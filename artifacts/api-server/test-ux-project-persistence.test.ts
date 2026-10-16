import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import executionRouter from "./src/routes/execution";

// Actual PostgreSQL TEMP tables, isolated to one connection. These tests do not
// authenticate a real Platform user and never modify existing application rows.
const tables = [
  "organizations", "clients", "programs", "initiatives", "projects",
  "project_milestones", "project_risks", "project_approvals", "resources",
  "project_resource_assignments", "readiness_assessments", "readiness_items",
  "project_jira_links", "initiative_jira_links",
] as const;

function call(method: string, path: string, id: number, body: unknown = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const entry = (executionRouter as any).stack.find((layer: any) =>
      layer.route?.path === path && layer.route.methods[method.toLowerCase()]);
    assert.ok(entry, `${method} ${path}`);
    let status = 200;
    const res = {
      status(value: number) { status = value; return this; },
      json(value: unknown) { resolve({ status, body: value }); },
    };
    Promise.resolve(entry.route.stack[0].handle({
      body, params: { id: String(id) }, query: {}, headers: {},
      matrixIdentity: { sub: "synthetic-database-test", name: "Test owner", roles: [] },
      log: { info() {}, warn() {}, error() {} },
    }, res, reject)).catch(reject);
  });
}

test("project create/edit/link preservation against isolated PostgreSQL temporary tables", async t => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  try {
    for (const table of tables) {
      // Table names are compile-time constants, never user input.
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`);
      await client.query(`CREATE TEMP SEQUENCE ux_${table}_ids START 100`);
      await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('pg_temp.ux_${table}_ids')`);
    }
    // Enforce the selected-link conflict target used by promotion.
    await client.query("CREATE UNIQUE INDEX ux_project_issue_unique ON project_jira_links(project_id,jira_issue_id)");
    (pool as any).query = client.query.bind(client);
    (pool as any).connect = async () => ({ query: client.query.bind(client), release() {} });

    await client.query("INSERT INTO organizations(id,name) VALUES (1,'Test parent'),(2,'Other parent')");
    await client.query("INSERT INTO clients(id,name,organization_id) VALUES (1,'Test client',1),(2,'Other client',2)");
    await client.query("INSERT INTO programs(id,name) VALUES (1,'Test program'),(2,'Other program')");
    await client.query(`INSERT INTO initiatives(id,title,department,submitter_name,category,status)
      VALUES (7,'Unapproved test idea','Operations','Test employee','Operational Efficiency','Idea')`);

    const direct = await call("POST", "/projects", 0, {
      name: "Defined project", projectType: "Internal Operations", primaryOwner: "Test owner",
    });
    await t.test("direct creation allows deferred details with no Initiative prerequisite", () => {
      assert.equal(direct.status, 201);
      assert.equal(direct.body.initiativeId, null);
      assert.equal(direct.body.clientId, null);
      assert.equal(direct.body.targetDate, null);
    });
    const linked = await call("POST", "/initiatives/:id/promote", 7, {
      projectType: "Innovation", primaryOwner: "Test owner",
      organizationId: 1, clientId: 1, programId: 1, targetDate: "2026-12-20T14:30:00Z",
    });
    assert.equal(linked.status, 201);
    const id = linked.body.id;
    await client.query(`INSERT INTO project_milestones(id,project_id,name) VALUES(1,$1,'Existing milestone')`, [id]);
    await client.query(`INSERT INTO project_risks(id,project_id,title) VALUES(1,$1,'Existing risk')`, [id]);
    await client.query(`INSERT INTO project_approvals(id,project_id,title) VALUES(1,$1,'Existing decision')`, [id]);
    await client.query("INSERT INTO resources(id,name,department) VALUES(1,'Existing person','Operations')");
    await client.query("INSERT INTO project_resource_assignments(id,project_id,resource_id) VALUES(1,$1,1)", [id]);
    await client.query("INSERT INTO readiness_assessments(id,project_id,name) VALUES(1,$1,'Existing assessment')", [id]);
    await client.query("INSERT INTO readiness_items(id,assessment_id,category,requirement) VALUES(1,1,'Operations','Existing requirement')");
    await client.query(`INSERT INTO project_jira_links(id,project_id,jira_issue_id,jira_issue_key,jira_issue_type)
      VALUES(1,$1,'12345','TEST-1','Task')`, [id]);
    const children = tables.filter(table => table.startsWith("project_") || table === "resources" || table.startsWith("readiness_"));
    async function snapshot() {
      return Object.fromEntries(await Promise.all(children.map(async table =>
        [table, JSON.stringify((await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows)])));
    }
    const before = await snapshot();
    const updated = await call("PATCH", "/projects/:id", id, {
      name: "Corrected name", description: "Revised intended outcome", primaryOwner: "Reassigned owner",
      supportingOwners: "Supporting colleague", projectType: "Internal Operations",
      organizationId: 2, clientId: 2, programId: 2,
    });
    const reloaded = await call("GET", "/projects/:id", id);
    await t.test("changed basics persist after a fresh detail read; omitted timestamp and source link stay unchanged", () => {
      assert.equal(updated.status, 200);
      assert.equal(reloaded.status, 200);
      const value = reloaded.body;
      assert.equal(value.name, "Corrected name");
      assert.equal(value.description, "Revised intended outcome");
      assert.equal(value.primaryOwner, "Reassigned owner");
      assert.equal(value.supportingOwners, "Supporting colleague");
      assert.equal(value.projectType, "Internal Operations");
      assert.equal(value.organizationId, 2);
      assert.equal(value.clientId, 2);
      assert.equal(value.programId, 2);
      assert.equal(value.initiativeId, 7);
      assert.equal(value.id, id);
      assert.equal(value.targetDate, linked.body.targetDate);
    });
    await t.test("all existing milestones, risks, approvals, assignments, readiness and Jira links remain byte-equivalent", async () => {
      assert.deepEqual(await snapshot(), before);
    });
    await call("PATCH", "/projects/:id", id, {
      description: "", supportingOwners: "", organizationId: null, clientId: null, programId: null, targetDate: null,
    });
    const cleared = await call("GET", "/projects/:id", id);
    await t.test("explicit optional clearing persists and does not clear unrelated data", async () => {
      for (const key of ["organizationId", "clientId", "programId", "targetDate"]) assert.equal(cleared.body[key], null);
      assert.equal(cleared.body.description, "");
      assert.equal(cleared.body.supportingOwners, "");
      assert.equal(cleared.body.primaryOwner, "Reassigned owner");
      assert.equal(cleared.body.initiativeId, 7);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("creating a linked project leaves Idea status intact and continues to reject accidental duplicates", async () => {
      const duplicate = await call("POST", "/initiatives/:id/promote", 7, {
        projectType: "Innovation", primaryOwner: "Test owner",
      });
      assert.equal(duplicate.status, 409);
      assert.equal((await client.query("SELECT status FROM initiatives WHERE id=7")).rows[0].status, "Idea");
    });
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    client.release(true); // closes connection and discards its temporary objects
    await pool.end();
  }
});
