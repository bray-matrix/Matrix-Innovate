import { test } from "node:test";
import assert from "node:assert/strict";
import { db, projectsTable, initiativesTable } from "@workspace/db";
import executionRouter from "./src/routes/execution";
import { requireMatrixSession } from "./src/matrix/auth";
import { buildPortfolioRows } from "./src/routes/portfolio";
import { computeCalculatedHealth, effectiveHealth } from "./src/lib/project-health";

// Isolated route-contract tests: no live credentials, DB writes or human sessions.
// Database operations below are in-memory doubles, not authenticated persistence.
function call(method: string, path: string, body: unknown, id = "41") {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const layer = (executionRouter as any).stack.find((entry: any) =>
      entry.route?.path === path && entry.route.methods[method.toLowerCase()]);
    assert.ok(layer, `${method} ${path}`);
    let status = 200;
    const req = {
      body, params: { id }, query: {}, headers: {},
      matrixIdentity: { sub: "synthetic-route-subject", name: "Route fixture", roles: [] },
      log: { info() {}, warn() {}, error() {} },
    };
    const res = {
      status(value: number) { status = value; return this; },
      json(value: unknown) { resolve({ status, body: value }); },
    };
    Promise.resolve(layer.route.stack[0].handle(req, res, reject)).catch(reject);
  });
}

const date = new Date("2026-10-16T12:00:00Z");
function project() {
  return {
    id: 41, initiativeId: 7, organizationId: 11, clientId: 12, programId: 13,
    name: "Existing delivery", description: "Existing scope", projectType: "Innovation",
    primaryOwner: "Original owner", supportingOwners: "Supporting contact",
    lifecycleStage: "Planning", state: "Active", priority: "Medium",
    health: "On Track", healthOverrideReason: "Previous decision",
    healthOverrideBy: "previous-subject", healthOverrideAt: date,
    targetDate: new Date("2026-12-01T15:30:00Z"), createdAt: date, updatedAt: date,
  };
}

test("project details PATCH changes only submitted fields and never touches child tables", async t => {
  let row = project();
  let captured: any;
  t.mock.method(db, "update", (table: unknown) => {
    assert.equal(table, projectsTable);
    return { set(patch: any) {
      captured = patch;
      row = { ...row, ...patch };
      return { where() { return { returning: async () => [row] }; } };
    } };
  });
  for (const method of ["insert", "delete", "transaction"] as const) {
    t.mock.method(db, method, () => { throw new Error(`Unexpected ${method}: children must stay intact`); });
  }
  const original = project();
  const result = await call("PATCH", "/projects/:id", {
    name: "Updated delivery", description: "", primaryOwner: "New owner",
    supportingOwners: "", projectType: "Internal Operations",
    organizationId: 21, clientId: 22, programId: 23,
    // Not writable through this contract, regardless of caller:
    initiativeId: 999, milestones: [], risks: [], resources: [], jiraLinks: [], approvals: [],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(captured).sort(), [
    "name", "description", "primaryOwner", "supportingOwners", "projectType",
    "organizationId", "clientId", "programId", "updatedAt",
  ].sort());
  assert.equal(result.body.id, original.id);
  assert.equal(result.body.initiativeId, original.initiativeId);
  assert.equal(result.body.targetDate, original.targetDate.toISOString());
  assert.equal(result.body.healthOverrideAt, original.healthOverrideAt);
  assert.equal(result.body.healthOverrideReason, original.healthOverrideReason);
  assert.equal(result.body.name, "Updated delivery");
  assert.equal(result.body.description, "");
  assert.equal(result.body.primaryOwner, "New owner");
});

test("optional relationships and target date clear explicitly with null", async t => {
  let captured: any;
  t.mock.method(db, "update", () => ({ set(patch: any) {
    captured = patch;
    return { where() { return { returning: async () => [{ ...project(), ...patch }] }; } };
  } }));
  const clear = { organizationId: null, clientId: null, programId: null, targetDate: null };
  const result = await call("PATCH", "/projects/:id", clear);
  assert.equal(result.status, 200);
  for (const key of Object.keys(clear)) {
    assert.equal(captured[key], null);
    assert.equal(result.body[key], null);
  }
  assert.equal("health" in captured, false);
  assert.equal("primaryOwner" in captured, false);
});

test("the UI date-only payload preserves an explicitly changed delivery date", async t => {
  t.mock.method(db, "update", () => ({ set(patch: any) {
    assert.ok(patch.targetDate instanceof Date);
    return { where() { return { returning: async () => [{ ...project(), ...patch }] }; } };
  } }));
  const targetDate = "2026-12-20";
  const result = await call("PATCH", "/projects/:id", { targetDate });
  assert.equal(result.status, 200);
  assert.equal(result.body.targetDate, "2026-12-20T00:00:00.000Z");
});

test("invalid project name and invalid ID are rejected before writes", async t => {
  t.mock.method(db, "update", () => { throw new Error("Invalid request reached DB"); });
  assert.equal((await call("PATCH", "/projects/:id", { name: "" })).status, 400);
  assert.equal((await call("PATCH", "/projects/:id", { name: "Valid" }, "not-an-id")).status, 400);
});

test("direct project creation remains possible without an initiative or optional relationships", async t => {
  t.mock.method(db, "insert", (table: unknown) => {
    assert.equal(table, projectsTable);
    return { values(values: any) {
      assert.equal("initiativeId" in values, false);
      assert.equal("clientId" in values, false);
      assert.equal(values.targetDate, null);
      return { returning: async () => [{ ...project(), initiativeId: null,
        organizationId: null, clientId: null, programId: null, ...values }] };
    } };
  });
  const result = await call("POST", "/projects", {
    name: "Defined operations work", projectType: "Internal Operations", primaryOwner: "Delivery owner",
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.initiativeId, null);
  assert.equal(result.body.clientId, null);
});

for (const [existing, allowDuplicate, expected] of [
  [false, false, 201], [true, false, 409], [true, true, 201],
] as const) {
  test(`linked creation preserves Idea status and duplicate guard: existing=${existing}, explicit=${allowDuplicate}`, async t => {
    const initiative = {
      id: 7, title: "Unapproved idea", status: "Idea", businessOwner: "Idea owner",
      executiveSponsor: "Sponsor", priority: "High", problemStatement: "Business need",
    };
    let locked = false;
    let inserts = 0;
    t.mock.method(db, "transaction", async (action: any) => action({
      select() {
        let table: unknown;
        const query: any = {
          from(value: unknown) { table = value; return query; },
          where() { return query; },
          for(mode: string) {
            assert.equal(table, initiativesTable);
            assert.equal(mode, "update");
            locked = true;
            return Promise.resolve([initiative]);
          },
          then(resolve: any, reject: any) {
            return Promise.resolve(table === projectsTable && existing ? [{ id: 41 }] : []).then(resolve, reject);
          },
        };
        return query;
      },
      insert(table: unknown) {
        assert.equal(table, projectsTable, "no automatic milestones/risks/approvals/resources");
        assert.equal(locked, true, "duplicate check/create remains under row lock");
        inserts++;
        return { values(values: any) {
          assert.equal(values.initiativeId, 7);
          assert.equal(values.lifecycleStage, "Planning");
          assert.equal(values.primaryOwner, "Delivery owner");
          return { returning: async () => [{ ...project(), ...values }] };
        } };
      },
    }));
    const result = await call("POST", "/initiatives/:id/promote", {
      projectType: "Innovation", primaryOwner: "Delivery owner", allowDuplicate,
    }, "7");
    assert.equal(result.status, expected);
    assert.equal(inserts, expected === 201 ? 1 : 0);
    assert.equal(initiative.status, "Idea", "project creation is not initiative approval");
  });
}

test("unauthenticated requests still fail closed without entering the route", async () => {
  let status = 200;
  let reached = false;
  let body: any;
  await requireMatrixSession(
    { headers: {} } as any,
    { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; } } as any,
    () => { reached = true; },
  );
  assert.equal(status, 401);
  assert.equal(reached, false);
  assert.match(body.error, /session required/i);
});

test("portfolio uses existing deterministic health and honors manual overrides", () => {
  const row = project();
  const risk: any = { id: 1, projectId: row.id, status: "Open", severity: "Critical" };
  const data: any = {
    projects: [row], milestones: [], risks: [risk], approvals: [],
    assessments: [], items: [], clients: [], programs: [], organizations: [],
  };
  const calculated = computeCalculatedHealth({
    project: row, risks: [risk], milestones: [], approvals: [], readinessStatuses: [],
  }, date);
  const output = buildPortfolioRows(data, date)[0].row;
  assert.equal(calculated, "Off Track");
  assert.equal(output.calculatedHealth, calculated);
  assert.equal(output.effectiveHealth, effectiveHealth(row, calculated));
  assert.equal(output.effectiveHealth, "On Track");
  assert.equal(output.healthOverridden, true);
  row.healthOverrideAt = null as any;
  const cleared = buildPortfolioRows(data, date)[0].row;
  assert.equal(cleared.effectiveHealth, "Off Track");
  assert.equal(cleared.healthOverridden, false);
});
