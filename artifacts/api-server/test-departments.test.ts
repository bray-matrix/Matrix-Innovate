import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, departmentsTable, initiativesTable, resourcesTable, projectsTable, projectResourceAssignmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import settingsRouter from "./src/routes/settings";
import resourcesRouter from "./src/routes/resources";
import initiativesRouter from "./src/routes/initiatives";
import { validDepartmentSelection, ensureDepartments, INITIAL_DEPARTMENTS } from "./src/lib/departments";
import { mintSessionToken, verifySessionToken } from "./src/matrix/auth";

after(async () => { await pool.end(); });

function handler(router: any, method: string, path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
  return layer.route.stack[0].handle;
}

async function call(router: any, method: string, path: string, body: unknown, roles: string[], params: Record<string, string> = {}) {
  let status = 200;
  let value: any;
  let error: unknown;
  const res = {
    status(code: number) { status = code; return res; },
    json(data: unknown) { value = data; return res; },
  };
  await handler(router, method, path)({
    body, params, matrixIdentity: { sub: "synthetic-departments-test", roles },
    log: { info() {}, warn() {} },
  }, res, (err: unknown) => { error = err; });
  if (error) throw error;
  return { status, value };
}

test("department admin mutation, normalized duplicates, atomic rename and inactive selection history", async () => {
  const prefix = `DeptTest-${randomUUID()}`;
  const old = `${prefix} Alpha`;
  const renamed = `${prefix} Beta`;
  const admin = ["Admin"];
  let departmentId: number | undefined;
  let initiativeId: number | undefined;
  let variantInitiativeId: number | undefined;
  let resourceId: number | undefined;
  let variantResourceId: number | undefined;
  let projectId: number | undefined;
  try {
    const [signed] = await Promise.all([mintSessionToken({ sub: "admin-test", name: null, email: null, roles: admin })]);
    assert.deepEqual((await verifySessionToken(signed))?.roles, admin, "signed admin claim survives session exchange");
    const [oldSession] = await Promise.all([mintSessionToken({ sub: "old-session", name: null, email: null, roles: [] })]);
    assert.deepEqual((await verifySessionToken(oldSession))?.roles, [], "legacy/no-role session fails closed");
    assert.equal((await call(settingsRouter, "post", "/settings/departments", { name: old }, [])).status, 403);
    assert.equal((await call(settingsRouter, "post", "/settings/departments", { name: old }, ["User"])).status, 403);
    const added = await call(settingsRouter, "post", "/settings/departments", { name: `  ${old}  ` }, admin);
    assert.equal(added.status, 201);
    departmentId = added.value.id;
    assert.equal(added.value.name, old);
    assert.equal((await call(settingsRouter, "post", "/settings/departments", { name: ` ${prefix.toLowerCase()}   alpha ` }, ["Super Admin"])).status, 409);

    const [initiative] = await db.insert(initiativesTable).values({
      title: prefix, department: old, submitterName: "Department test", category: "Experimental",
      reviewedBrief: { metadata: { department: old } } as any,
    }).returning();
    initiativeId = initiative.id;
    const variant = `  ${prefix.toLowerCase()}   ALPHA  `;
    const [variantInitiative] = await db.insert(initiativesTable).values({
      title: `${prefix}-variant`, department: variant, submitterName: "Department test", category: "Experimental",
      reviewedBrief: { metadata: { department: variant } } as any,
    }).returning();
    variantInitiativeId = variantInitiative.id;
    const [resource] = await db.insert(resourcesTable).values({ name: prefix, department: old }).returning();
    resourceId = resource.id;
    const [variantResource] = await db.insert(resourcesTable).values({ name: `${prefix}-variant`, department: variant }).returning();
    variantResourceId = variantResource.id;
    const [project] = await db.insert(projectsTable).values({ name: prefix }).returning();
    projectId = project.id;
    const [assignment] = await db.insert(projectResourceAssignmentsTable).values({ projectId, department: old }).returning();
    const [variantAssignment] = await db.insert(projectResourceAssignmentsTable).values({ projectId, department: variant }).returning();

    assert.equal((await call(settingsRouter, "patch", "/settings/departments/:id", { name: renamed }, ["User"], { id: String(departmentId) })).status, 403);
    const changed = await call(settingsRouter, "patch", "/settings/departments/:id", { name: renamed }, admin, { id: String(departmentId) });
    assert.equal(changed.status, 200);
    assert.equal(changed.value.id, departmentId, "rename preserves master id");
    assert.equal((await db.select().from(initiativesTable).where(eq(initiativesTable.id, initiativeId)))[0].department, renamed);
    assert.equal(((await db.select().from(initiativesTable).where(eq(initiativesTable.id, initiativeId)))[0].reviewedBrief as any).metadata.department, renamed);
    assert.equal((await db.select().from(resourcesTable).where(eq(resourcesTable.id, resourceId)))[0].department, renamed);
    assert.equal((await db.select().from(projectResourceAssignmentsTable).where(eq(projectResourceAssignmentsTable.id, assignment.id)))[0].department, renamed);
    const variantAfter = (await db.select().from(initiativesTable).where(eq(initiativesTable.id, variantInitiativeId)))[0];
    assert.equal(variantAfter.department, renamed, "case and whitespace variant initiative is renamed");
    assert.equal((variantAfter.reviewedBrief as any).metadata.department, renamed, "variant brief metadata is renamed");
    assert.equal((await db.select().from(resourcesTable).where(eq(resourcesTable.id, variantResourceId)))[0].department, renamed);
    assert.equal((await db.select().from(projectResourceAssignmentsTable).where(eq(projectResourceAssignmentsTable.id, variantAssignment.id)))[0].department, renamed);
    assert.equal((await call(settingsRouter, "patch", "/settings/departments/:id", { active: false }, ["User"], { id: String(departmentId) })).status, 403);
    assert.equal((await call(settingsRouter, "patch", "/settings/departments/:id", { active: false }, admin, { id: String(departmentId) })).status, 200);
    const settings = await call(settingsRouter, "get", "/settings", {}, []);
    assert.equal(settings.status, 200);
    assert.ok(!settings.value.departments.includes(renamed));
    assert.ok(settings.value.departmentMaster.some((d: any) => d.id === departmentId && !d.active));
    assert.ok(settings.value.departments.includes("Project Management Office"));
    assert.equal(await validDepartmentSelection(renamed), false);
    assert.equal(await validDepartmentSelection(renamed, renamed), true);
    assert.equal(await validDepartmentSelection(old), false);
    const inactiveSubmit = await call(initiativesRouter, "post", "/initiatives", {
      title: `${prefix}-new`, department: renamed, submitterName: "Department test",
      category: "Experimental", problemStatement: "Test", currentProcess: "Test",
      desiredOutcome: "Test", aiConcept: "Test", prototypeGoal: "Test", successMetric: "Test",
    }, []);
    assert.equal(inactiveSubmit.status, 400, "Quick Submit / final Initiative save rejects inactive department");
    assert.equal((await call(initiativesRouter, "patch", "/initiatives/:id", { department: renamed }, [], { id: String(initiativeId) })).status, 200,
      "historical Initiative can be saved unchanged");
    assert.equal((await call(resourcesRouter, "post", "/resources", { name: `${prefix}-new`, department: renamed }, [])).status, 400);
    assert.equal((await call(resourcesRouter, "patch", "/resources/:id", { department: renamed, roleTitle: "Historical" }, [], { id: String(resourceId) })).status, 200);
    assert.equal((await call(resourcesRouter, "post", "/projects/:id/resources", { department: renamed }, [], { id: String(projectId) })).status, 400);
    assert.equal((await call(resourcesRouter, "patch", "/projects/:id/resources/:assignmentId", { department: renamed }, [], { id: String(projectId), assignmentId: String(assignment.id) })).status, 200);
  } finally {
    if (projectId) await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
    if (resourceId) await db.delete(resourcesTable).where(eq(resourcesTable.id, resourceId));
    if (variantResourceId) await db.delete(resourcesTable).where(eq(resourcesTable.id, variantResourceId));
    if (initiativeId) await db.delete(initiativesTable).where(eq(initiativesTable.id, initiativeId));
    if (variantInitiativeId) await db.delete(initiativesTable).where(eq(initiativesTable.id, variantInitiativeId));
    if (departmentId) await db.delete(departmentsTable).where(eq(departmentsTable.id, departmentId));
  }
});

test("empty-master fallback is read-only and all original selectors remain available", async () => {
  const originalSelect = db.select;
  (db as any).select = (...args: any[]) => {
    const query = (originalSelect as any).apply(db, args);
    const from = query.from.bind(query);
    query.from = (table: unknown) => table === departmentsTable
      ? { then: (resolve: (rows: any[]) => void) => Promise.resolve([]).then(resolve), orderBy: async () => [] }
      : from(table);
    return query;
  };
  try {
    const settings = await call(settingsRouter, "get", "/settings", {}, []);
    assert.equal(settings.status, 200);
    assert.deepEqual(settings.value.departments, INITIAL_DEPARTMENTS);
    assert.deepEqual(settings.value.departmentMaster, []);
    assert.equal(await validDepartmentSelection("Project Management Office"), true);
    assert.equal(await validDepartmentSelection("Other"), false);
  } finally {
    (db as any).select = originalSelect;
  }
});

test("first admin write backfills defaults plus distinct historical free-text values", async () => {
  const inserted: string[] = [];
  const tx = {
    execute: async (_sql: unknown) => ({ rows: [
      { department: "  Custom   Services  " },
      { department: "Finance" },
      { department: null },
    ] }),
    select: () => ({ from: () => ({ limit: async () => [] }) }),
    insert: () => ({ values: (values: { name: string } | { name: string }[]) => ({
      onConflictDoNothing: async () => { inserted.push(...(Array.isArray(values) ? values : [values]).map(row => row.name)); },
    }) }),
  };
  await ensureDepartments(tx as any);
  assert.ok(INITIAL_DEPARTMENTS.every(name => inserted.includes(name)));
  assert.ok(inserted.includes("Custom Services"), "historical custom departments are backfilled");
});