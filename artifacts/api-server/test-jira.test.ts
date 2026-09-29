import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JiraClient, jiraConfig } from "./src/lib/jira-client";
import jiraRouter from "./src/routes/jira";
import jiraLinksRouter from "./src/routes/jira-links";
import initiativeRouter from "./src/routes/initiatives";
import executionRouter from "./src/routes/execution";
import matrixRouter from "./src/matrix/platform";
import { requireMatrixSession, mintSessionToken, verifySessionToken } from "./src/matrix/auth";
import { pool } from "@workspace/db";

const env = { JIRA_BASE_URL: "https://test.atlassian.net", JIRA_EMAIL: "jira-test@example.invalid", JIRA_API_TOKEN: "J1-TEST-TOKEN-never-real" };
const encoded = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const noSecret = (value: unknown) => {
  const text = JSON.stringify(value);
  for (const s of [env.JIRA_API_TOKEN, env.JIRA_EMAIL, encoded]) assert.equal(text.includes(s), false);
};
const call = (router: any, method: string, path: string, body = {}, params = {}, query = {}) => new Promise<{ status: number; body: any }>((resolve, reject) => {
  const route = router.stack.find((r: any) => r.route?.path === path && r.route.methods[method.toLowerCase()]);
  assert.ok(route, `${method} ${path} exists`);
  let status = 200;
  const res: any = { status: (v: number) => { status = v; return res; }, json: (value: unknown) => resolve({ status, body: value }), end: () => resolve({ status, body: null }), send: (value: unknown) => resolve({ status, body: value }), on: () => res, off: () => res };
  Promise.resolve(route.route.stack[0].handle({ body, params, query, headers: {}, matrixIdentity: { sub: "fixture-user" }, log: { info() {}, error() { throw new Error("Unexpected error logging"); } } }, res, reject)).catch(reject);
});

const issue = (id: string, key: string, summary = "Current Jira summary") => ({
  id, key, fields: {
    summary, issuetype: { name: "Story" }, status: { name: "Blocked" },
    assignee: { displayName: "Engineer" }, priority: { name: "High" },
    updated: "2026-09-25T15:00:00.000+0000",
    project: { id: "100", key: "KEY", name: "Real Jira project" },
    description: `do not copy ${env.JIRA_API_TOKEN}`, authorization: encoded,
  },
  token: env.JIRA_API_TOKEN,
});

test("J1 Jira client: mocked security, validation, pagination, timeout and retry", async t => {
  await t.test("reject unsafe origins before requests", () => {
    for (const base of ["http://test.atlassian.net", "https://u:p@test.atlassian.net", "https://test.atlassian.net/?secret=x", "https://test.atlassian.net/#x", "https://127.0.0.1", "https://localhost", "https://[::1]", "https://test.atlassian.net/path"]) {
      assert.throws(() => jiraConfig({ ...env, JIRA_BASE_URL: base }));
    }
  });
  await t.test("missing credentials is explicit, no fake data", async () => {
    const client = new JiraClient(async () => { throw new Error("must not fetch"); }, {});
    assert.equal(client.state().configured, false);
    await assert.rejects(client.projects(), /not configured/);
  });
  await t.test("whitelist and redact malicious allowed/extra fields", async () => {
    const p = { id: "100", key: "KEY", name: env.JIRA_API_TOKEN, projectTypeKey: encoded, authorization: encoded, password: env.JIRA_API_TOKEN };
    const client = new JiraClient(async (_url, options) => {
      assert.equal(options?.redirect, "error");
      assert.equal((options?.headers as any).Authorization, `Basic ${encoded}`);
      return json({ values: [p], isLast: true, authorization: encoded });
    }, env);
    const data = await client.projects();
    assert.deepEqual(Object.keys(data[0]).sort(), ["jiraProjectId", "key", "name", "projectType"]);
    noSecret(data); noSecret(client.state());
    const fieldClient = new JiraClient(async () => json([{ id: "duedate", name: env.JIRA_API_TOKEN, custom: false, schema: { type: encoded, secret: env.JIRA_API_TOKEN }, extra: env.JIRA_API_TOKEN }]), env);
    noSecret(await fieldClient.fields());
    const statusClient = new JiraClient(async () => json([{ id: "1", name: encoded, statusCategory: { key: "done" }, token: env.JIRA_API_TOKEN }]), env);
    const statuses = await statusClient.statuses();
    assert.equal(statuses[0].canonicalCategory, "done"); noSecret(statuses);
  });
  await t.test("project pagination fetches every page", async () => {
    let calls = 0;
    const c = new JiraClient(async url => {
      assert.ok(String(url).includes(`startAt=${calls}`));
      calls++;
      return json({ values: [{ id: `${calls}`, key: `P${calls}`, name: "Project" }], isLast: calls === 3 });
    }, env);
    assert.equal((await c.projects()).length, 3);
    assert.equal(calls, 3);
  });
  await t.test("429 retries are bounded; errors never echo upstream body", async () => {
    let calls = 0;
    const c = new JiraClient(async () => { calls++; return json({ error: env.JIRA_API_TOKEN }, 429, { "retry-after": "0" }); }, env);
    await assert.rejects(c.test(), /rate limit/); assert.equal(calls, 3);
    await assert.rejects(new JiraClient(async () => json({ message: encoded }, 401), env).test(), e => { noSecret(String(e)); return /permissions/.test(String(e)); });
    let tries = 0;
    await new JiraClient(async () => ++tries === 1 ? json({}, 429, { "retry-after": "0" }) : json({}), env).test();
    assert.equal(tries, 2);
    let longWaitCalls = 0;
    await assert.rejects(new JiraClient(async () => { longWaitCalls++; return json({}, 429, { "retry-after": "3600" }); }, env).test(), /rate limit/);
    assert.equal(longWaitCalls, 1, "do not retry earlier than a long server Retry-After");
  });
  await t.test("timeout and unsafe redirect errors sanitized", async () => {
    const c = new JiraClient((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error(env.JIRA_API_TOKEN)))), { ...env, JIRA_REQUEST_TIMEOUT_MS: "100" });
    await assert.rejects(c.test(), /timed out/);
    await assert.rejects(new JiraClient(async () => { throw new Error(`redirect ${encoded}`); }, env).test(), e => { noSecret(String(e)); return /request failed/.test(String(e)); });
  });
  await t.test("malformed, incomplete and oversized metadata fail explicitly", async () => {
    await assert.rejects(new JiraClient(async () => json({ values: [], isLast: false }), env).projects(), /pagination/);
    await assert.rejects(new JiraClient(async () => json({ fields: [] }), env).fields(), /invalid field/);
    await assert.rejects(new JiraClient(async () => new Response("x".repeat(5_000_001)), env).test(), /size limit/);
  });
  await t.test("Jira code has no logging or frontend server-secret imports", () => {
    for (const file of ["src/lib/jira-client.ts", "src/routes/jira.ts"]) {
      const source = readFileSync(file, "utf8");
      assert.equal(/console\.(log|error|warn)|(?:req\.)?log(?:ger)?\.(info|error|warn|debug)/.test(source), false);
    }
    const ui = readFileSync("../matrix-innovation-hub/src/components/jira-integration.tsx", "utf8");
    noSecret(ui);
    assert.equal(/process\.env|import\.meta\.env|jira-client|\bfetch\(/.test(ui), false);
  });
});

test("J2 Jira client: live bounded, read-only issue search and resolution", async t => {
  const requests: { url: URL; method: string; authorization: string }[] = [];
  const client = new JiraClient(async (url, options) => {
    const u = new URL(String(url));
    requests.push({ url: u, method: options?.method ?? "GET", authorization: (options?.headers as any).Authorization });
    if (u.pathname.includes("/issue/")) return json(issue("101", "KEY-101"));
    return json({ issues: Array.from({ length: 40 }, (_, i) => issue(String(i + 101), `KEY-${i + 101}`)) });
  }, env);
  await t.test("exact and partial key, text and project filter use bounded live Jira reads", async () => {
    assert.equal((await client.searchIssues("KEY-101", undefined, 2)).length, 2);
    const exact = requests.at(-1)!.url;
    assert.match(exact.searchParams.get("jql")!, /key = "KEY-101"/);
    assert.equal(exact.searchParams.get("maxResults"), "2");
    await client.searchIssues("KEY-10", "KEY");
    assert.match(requests.at(-1)!.url.searchParams.get("jql")!, /project = "KEY"/);
    assert.match(requests.at(-1)!.url.searchParams.get("jql")!, /key = "KEY-10"/);
    await client.searchIssues("critical bug", "KEY");
    assert.match(requests.at(-1)!.url.searchParams.get("jql")!, /text ~ "critical bug"/);
    assert.match(requests.at(-1)!.url.searchParams.get("jql")!, /project = "KEY"/);
    const bounded = await client.searchIssues("", "KEY", 1000);
    assert.equal(bounded.length, 25);
    assert.equal(requests.at(-1)!.url.searchParams.get("maxResults"), "25");
    assert.equal(bounded[0].status, "Blocked");
    assert.equal(bounded[0].url, "https://test.atlassian.net/browse/KEY-101");
    noSecret(bounded);
    assert.equal(JSON.stringify(bounded).includes("description"), false);
  });
  await t.test("issue ID validated and live detail resolved, with no Jira write", async () => {
    const result = await client.issue("101");
    assert.equal(result.summary, "Current Jira summary");
    assert.equal(result.jiraIssueId, "101");
    noSecret(result);
    await assert.rejects(client.issue("../101"), /Invalid Jira issue ID/);
    assert.equal(requests.every(r => r.method === "GET" && r.authorization === `Basic ${encoded}`), true);
    assert.equal(requests.every(r => r.url.origin === env.JIRA_BASE_URL && r.url.pathname.startsWith("/rest/api/3/")), true);
  });
  await t.test("outages, malicious upstream error bodies, and unsafe query values do not leak credentials", async () => {
    await assert.rejects(new JiraClient(async () => json({ message: env.JIRA_API_TOKEN }, 500), env).issue("101"), err => {
      noSecret(String(err)); return true;
    });
    await assert.rejects(client.searchIssues("bad\nquery"), /Invalid Jira search/);
    await assert.rejects(client.searchIssues("", "KEY\") OR status = Done"), /Invalid Jira search/);
  });
});

test("J1 routes and PostgreSQL persistence in isolated TEMP tables", async t => {
  const originalFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  const client = await pool.connect();
  const connect = pool.connect;
  const query = pool.query;
  try {
    Object.assign(process.env, env);
    // All Jira and Hub fixture rows live only in this session's temporary tables.
    await client.query("CREATE TEMP TABLE projects (id integer PRIMARY KEY)");
    const sql = readFileSync("../../lib/db/src/jira-foundation.sql", "utf8");
    await client.query(sql.replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"));
    await client.query(`CREATE TEMP TABLE project_jira_links (
      id serial PRIMARY KEY, project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      jira_project_id integer REFERENCES jira_projects(id) ON DELETE SET NULL,
      jira_issue_id text NOT NULL, jira_issue_key text NOT NULL, jira_issue_type text NOT NULL,
      relationship_type text, display_order integer, notes text, created_by text,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (project_id, jira_issue_id)
    )`);
    (pool as any).query = client.query.bind(client);
    (pool as any).connect = async () => ({ query: client.query.bind(client), release() {} });
    const request = async (method: string, path: string, body = {}, params = {}) => {
      const result = await call(jiraRouter, method, path, body, params);
      noSecret(result);
      return result;
    };
    await t.test("all Jira endpoints require existing Matrix session", async () => {
      for (const layer of (jiraRouter as any).stack) {
        let status = 0;
        let next = false;
        await requireMatrixSession({ headers: {} } as any, { status(v: number) { status = v; return this; }, json(value: unknown) { noSecret(value); } } as any, () => { next = true; });
        assert.equal(status, 401, layer.route.path); assert.equal(next, false);
      }
      const app = readFileSync("src/app.ts", "utf8");
      assert.ok(app.indexOf("void requireMatrixSession") < app.indexOf('app.use("/api", router)'));
    });
    await t.test("connection success and safe failure persisted", async () => {
      globalThis.fetch = async () => json({ displayName: env.JIRA_API_TOKEN, authorization: encoded });
      let result = await request("POST", "/jira/connection/test");
      assert.equal(result.body.lastTestStatus, "connected");
      assert.ok(result.body.lastTestAt);
      assert.equal((await client.query("select last_test_status from jira_connection_state")).rows[0].last_test_status, "connected");
      globalThis.fetch = async () => json({ error: env.JIRA_API_TOKEN }, 403);
      result = await request("POST", "/jira/connection/test");
      assert.equal(result.body.lastTestStatus, "failed");
      assert.match(result.body.lastTestMessage, /permissions/);
      assert.equal((await request("GET", "/jira/connection")).body.lastTestStatus, "failed");
    });
    let a: any, b: any;
    await t.test("discovery upsert retains mappings, sync flag and omitted history", async () => {
      globalThis.fetch = async () => json({ values: [{ id: "100", key: "A", name: "Alpha" }, { id: "101", key: "B", name: "Beta" }], isLast: true });
      let result = await request("POST", "/jira/projects/discover"); assert.equal(result.status, 200);
      [a, b] = result.body;
      await client.query("INSERT INTO projects(id) VALUES (9000001),(9000002)");
      for (const p of [a, b]) assert.equal((await request("PATCH", "/jira/projects/:id", { projectId: 9000001, syncEnabled: true }, { id: String(p.id) })).status, 200);
      globalThis.fetch = async () => json({ values: [{ id: "100", key: "A", name: "Renamed" }], isLast: true });
      result = await request("POST", "/jira/projects/discover");
      assert.equal(result.body.length, 2);
      assert.equal(result.body[0].name, "Renamed");
      assert.equal(result.body[0].projectId, 9000001);
      assert.equal(result.body[0].syncEnabled, true);
      assert.equal(result.body[1].projectId, 9000001);
      await request("PATCH", "/jira/projects/:id", { projectId: 9000002 }, { id: String(a.id) });
      assert.equal((await request("GET", "/jira/projects")).body[0].projectId, 9000002);
      await client.query("DELETE FROM projects WHERE id IN (9000001,9000002)");
      assert.ok((await request("GET", "/jira/projects")).body.every((p: any) => p.projectId === null));
    });
    await t.test("field discovery and explicit null override persistence", async () => {
      globalThis.fetch = async () => json([{ id: "duedate", name: "Due date", schema: { type: "date" } }, { id: "customfield_7", name: "Estimate", custom: true, schema: { type: "number" } }]);
      assert.equal((await request("GET", "/jira/fields")).body.length, 2);
      assert.equal((await request("GET", "/jira/projects/:id/field-mapping", {}, { id: a.id })).body.dueDateField, "duedate");
      const mapping = { dueDateField: null, blockedField: null, storyPointsField: "customfield_7", additionalMappings: null };
      assert.equal((await request("PUT", "/jira/projects/:id/field-mapping", mapping, { id: a.id })).status, 200);
      assert.deepEqual((await request("GET", "/jira/projects/:id/field-mapping", {}, { id: a.id })).body, mapping);
    });
    await t.test("status defaults, global uniqueness and project override preservation", async () => {
      globalThis.fetch = async () => json([{ id: "10", name: "Working", statusCategory: { key: "indeterminate" } }]);
      let result = await request("POST", "/jira/statuses");
      assert.equal(result.body[0].canonicalCategory, "in_progress");
      const input = { jiraProjectId: null, jiraStatusId: "10", jiraStatusName: "Working", canonicalCategory: "blocked" };
      await request("PUT", "/jira/status-mappings", input);
      await request("PUT", "/jira/status-mappings", { ...input, jiraProjectId: a.id, canonicalCategory: "done" });
      await request("POST", "/jira/statuses");
      result = await request("GET", "/jira/status-mappings");
      assert.equal(result.body.length, 2);
      assert.equal(result.body.find((s: any) => s.jiraProjectId === null).canonicalCategory, "blocked");
      assert.equal(result.body.find((s: any) => s.jiraProjectId === a.id).canonicalCategory, "done");
      await assert.rejects(client.query("INSERT INTO jira_status_mappings(jira_status_id,jira_status_name) VALUES ('10','duplicate')"), /unique/);
      assert.equal((await request("PUT", "/jira/status-mappings", { ...input, canonicalCategory: "invalid" })).status, 400);
      await request("PUT", "/jira/status-mappings", { jiraProjectId: null, jiraStatusId: "10814", jiraStatusName: "Blocked", canonicalCategory: "blocked" });
      assert.equal((await request("GET", "/jira/status-mappings")).body.find((s: any) => s.jiraStatusId === "10814").canonicalCategory, "blocked");
    });
    await t.test("J2 routes: live search, identity-only links, duplicates, multi-project, outage, refresh, unlink and cascade", async () => {
      const routes = async (method: string, path: string, body = {}, params = {}, query = {}) => {
        const result = await call(jiraLinksRouter, method, path, body, params, query);
        noSecret(result);
        return result;
      };
      await client.query("INSERT INTO projects(id) VALUES (9000001),(9000002)");
      const calls: string[] = [];
      globalThis.fetch = async (url, options) => {
        assert.equal(options?.method ?? "GET", "GET", "J2 must never write to Jira");
        calls.push(String(url));
        const u = new URL(String(url));
        if (u.pathname.endsWith("/issue/102")) return json(issue("102", "KEY-102", "Second current summary"));
        if (u.pathname.endsWith("/issue/101")) return json(issue("101", "KEY-101"));
        if (u.pathname.endsWith("/search/jql")) return json({ issues: Array.from({ length: 30 }, (_, i) => issue(String(i + 101), `KEY-${i + 101}`)) });
        throw new Error("Unexpected Jira endpoint");
      };
      const search = async (query: Record<string, string>) => routes("GET", "/jira/issues/search", {}, {}, query);
      let found = await search({ q: "KEY-101", limit: "2" });
      assert.equal(found.status, 200);
      assert.equal(found.body.length, 2);
      assert.match(new URL(calls.at(-1)!).searchParams.get("jql")!, /key = "KEY-101"/);
      await search({ q: "KEY-10", projectKey: "KEY" });
      assert.match(new URL(calls.at(-1)!).searchParams.get("jql")!, /project = "KEY"/);
      found = await search({ q: "current summary", projectKey: "KEY" });
      assert.match(new URL(calls.at(-1)!).searchParams.get("jql")!, /text ~ "current summary"/);
      found = await search({ projectKey: "KEY" });
      assert.equal(found.body.length, 25);
      assert.equal(new URL(calls.at(-1)!).searchParams.get("maxResults"), "25");
      assert.equal((await search({ q: "x", limit: "999" })).status, 400);
      const routeParams = (projectId: number, linkId?: number) => ({ projectId: String(projectId), ...(linkId ? { linkId: String(linkId) } : {}) });
      const linkBody = (jiraIssueId: string) => ({ jiraIssueId, summary: env.JIRA_API_TOKEN, status: "Done", jiraIssueKey: "FAKE-99" });
      const create = (p: number, id: string) => routes("POST", "/projects/:projectId/jira-links", linkBody(id), routeParams(p));
      const first = await create(9000001, "101");
      assert.equal(first.status, 201);
      assert.equal(first.body.jiraIssueKey, "KEY-101");
      assert.equal(first.body.details.status, "Blocked");
      assert.equal(first.body.createdBy, "fixture-user");
      assert.equal((await create(9000001, "101")).status, 409);
      assert.equal((await create(9000001, "102")).status, 201);
      const other = await create(9000002, "101");
      assert.equal(other.status, 201);
      const stored = (await client.query("SELECT * FROM project_jira_links ORDER BY id")).rows;
      assert.equal(stored.length, 3);
      assert.equal(stored.every(row => row.jira_issue_key.startsWith("KEY-")), true);
      for (const field of ["summary", "status", "assignee", "priority", "description", "token", "authorization"]) {
        assert.equal(stored.some(row => field in row), false, `${field} must not persist`);
      }
      const list = () => routes("GET", "/projects/:projectId/jira-links", {}, routeParams(9000001));
      assert.equal((await list()).body[0].details.summary, "Current Jira summary");
      globalThis.fetch = async () => json({ message: env.JIRA_API_TOKEN }, 503);
      const unavailable = await list();
      assert.equal(unavailable.status, 200);
      assert.equal(unavailable.body.length, 2);
      assert.equal(unavailable.body[0].jiraIssueKey, "KEY-101");
      assert.equal(unavailable.body[0].unavailable, true);
      globalThis.fetch = async url => json(String(url).includes("/issue/102") ? issue("102", "KEY-102") : issue("101", "KEY-101", "Updated live summary"));
      assert.equal((await list()).body[0].details.summary, "Updated live summary", "refresh is a new GET, not a sync");
      assert.equal((await client.query("SELECT count(*)::int AS count FROM project_jira_links")).rows[0].count, 3);
      const beforeUnlinkCalls = calls.length;
      assert.equal((await routes("DELETE", "/projects/:projectId/jira-links/:linkId", {}, routeParams(9000001, first.body.id))).status, 204);
      assert.equal(calls.length, beforeUnlinkCalls, "unlink never contacts Jira");
      assert.equal((await routes("DELETE", "/projects/:projectId/jira-links/:linkId", {}, routeParams(9000001, other.body.id))).status, 404, "cannot unlink another project's reference");
      assert.equal((await client.query("SELECT count(*)::int AS count FROM project_jira_links")).rows[0].count, 2);
      await client.query("DELETE FROM projects WHERE id = 9000001");
      assert.deepEqual((await client.query("SELECT project_id FROM project_jira_links")).rows.map(row => row.project_id), [9000002]);
      await client.query("DELETE FROM projects WHERE id = 9000002");
    });
    await t.test("Jira intake context and initiative-to-project references use read-only Jira and atomic local writes", async () => {
      // Temporary shadow tables isolate every write; no permanent rows or live Jira.
      await client.query(`CREATE TEMP TABLE initiatives (
        id serial PRIMARY KEY, title text NOT NULL, department text NOT NULL, submitter_name text NOT NULL,
        business_owner text, executive_sponsor text, executive_summary text, category text NOT NULL,
        status text NOT NULL DEFAULT 'Idea', problem_statement text NOT NULL DEFAULT '',
        current_process text NOT NULL DEFAULT '', desired_outcome text NOT NULL DEFAULT '',
        ai_concept text NOT NULL DEFAULT '', prototype_goal text NOT NULL DEFAULT '', success_metric text NOT NULL DEFAULT '',
        estimated_hours_saved_monthly double precision NOT NULL DEFAULT 0,
        estimated_revenue_opportunity double precision NOT NULL DEFAULT 0,
        estimated_cost_savings double precision NOT NULL DEFAULT 0,
        customer_impact text NOT NULL DEFAULT '', compliance_risk text NOT NULL DEFAULT '',
        technical_complexity text NOT NULL DEFAULT '', ai_readiness text NOT NULL DEFAULT '',
        business_value integer NOT NULL DEFAULT 0, revenue_potential integer NOT NULL DEFAULT 0,
        cost_savings_score integer NOT NULL DEFAULT 0, customer_impact_score integer NOT NULL DEFAULT 0,
        strategic_alignment integer NOT NULL DEFAULT 0, ai_readiness_score integer NOT NULL DEFAULT 0,
        prototype_confidence integer NOT NULL DEFAULT 0, technical_complexity_penalty integer NOT NULL DEFAULT 0,
        risk_penalty integer NOT NULL DEFAULT 0, score integer NOT NULL DEFAULT 0,
        priority text NOT NULL DEFAULT 'Low', version text NOT NULL DEFAULT 'v0.1.0',
        assigned_team text, current_phase text, prototype_day integer,
        last_reviewed_at timestamp, next_review_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TEMP TABLE initiative_versions (
        id serial PRIMARY KEY, initiative_id integer NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
        version text NOT NULL, changed_by text NOT NULL, summary text NOT NULL,
        snapshot jsonb, created_at timestamp NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TEMP TABLE initiative_jira_links (
        id serial PRIMARY KEY, initiative_id integer NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
        jira_project_id integer REFERENCES jira_projects(id) ON DELETE SET NULL,
        jira_issue_id text NOT NULL, jira_issue_key text NOT NULL, jira_issue_type text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (initiative_id, jira_issue_id)
      )`);
      await client.query(`ALTER TABLE projects ADD COLUMN initiative_id integer REFERENCES initiatives(id) ON DELETE SET NULL,
        ADD COLUMN organization_id integer, ADD COLUMN client_id integer, ADD COLUMN program_id integer,
        ADD COLUMN name text, ADD COLUMN description text, ADD COLUMN project_type text,
        ADD COLUMN lifecycle_stage text, ADD COLUMN state text, ADD COLUMN health text,
        ADD COLUMN health_override_reason text, ADD COLUMN health_override_by text,
        ADD COLUMN health_override_at timestamp,
        ADD COLUMN priority text, ADD COLUMN primary_owner text, ADD COLUMN supporting_owners text,
        ADD COLUMN target_date timestamp, ADD COLUMN created_at timestamp DEFAULT now(),
        ADD COLUMN updated_at timestamp DEFAULT now()`);
      await client.query("CREATE TEMP SEQUENCE intake_project_id_seq START 9900000");
      await client.query("ALTER TABLE projects ALTER COLUMN id SET DEFAULT nextval('intake_project_id_seq')");
      const requests: string[] = [];
      globalThis.fetch = async (url, options) => {
        assert.equal(options?.method ?? "GET", "GET", "intake never writes Jira");
        requests.push(String(url));
        if (String(url).includes("/issue/101")) return json({
          ...issue("101", "KEY-101"),
          fields: { ...issue("101", "KEY-101").fields, description: {
            type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Business need ${env.JIRA_API_TOKEN} ` }, { type: "text", text: "Reduce wait" }] }],
          } },
        });
        return json({ error: "unavailable" }, 503);
      };
      const intake = await call(jiraLinksRouter, "GET", "/jira/issues/:issueId/intake-context", {}, { issueId: "101" });
      assert.equal(intake.status, 200);
      assert.match(intake.body.description, /Reduce wait/);
      noSecret(intake);
      assert.equal((await call(jiraLinksRouter, "GET", "/jira/issues/:issueId/intake-context", {}, { issueId: "not-an-id" })).status, 400);
      const body = {
        title: "Improve Intake", department: "Operations", submitterName: "Test User",
        category: "Process", problemStatement: "Waiting", currentProcess: "Manual triage",
        desiredOutcome: "Faster turnaround", aiConcept: "", prototypeGoal: "",
        successMetric: "Cycle time",
      };
      const create = (extra = {}) => call(initiativeRouter, "POST", "/initiatives", { ...body, ...extra });
      const noJira = await create();
      assert.equal(noJira.status, 201);
      assert.deepEqual(noJira.body.jiraLinks, []);
      const before = requests.length;
      const linked = await create({ jiraIssueId: "101", jiraIssueKey: "FORGED-1" });
      assert.equal(linked.status, 201);
      assert.deepEqual(linked.body.jiraLinks, [{ jiraIssueId: "101", jiraIssueKey: "KEY-101", jiraIssueType: "Story" }]);
      assert.equal(requests.length, before + 1);
      assert.deepEqual((await call(initiativeRouter, "GET", "/initiatives/:id", {}, { id: String(linked.body.id) })).body.jiraLinks, linked.body.jiraLinks);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM initiative_versions")).rows[0].n, 2);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM initiative_jira_links")).rows[0].n, 1);
      const rejected = await create({ jiraIssueId: "999" });
      assert.equal(rejected.status, 503);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM initiatives")).rows[0].n, 2, "Jira outage cannot create an unlinked initiative");
      const promote = (initiativeId: number, extra = {}) =>
        call(executionRouter, "POST", "/initiatives/:id/promote", { projectType: "Innovation", primaryOwner: "Test User", ...extra }, { id: String(initiativeId) });
      const beforePromotion = requests.length;
      const promoted = await promote(linked.body.id);
      assert.equal(promoted.status, 201);
      assert.equal(promoted.body.targetDate, null, "no today's-date default");
      assert.match(promoted.body.description, /Cycle time/);
      assert.equal(requests.length, beforePromotion, "promotion must not contact Jira");
      assert.deepEqual((await client.query("SELECT jira_issue_id, jira_issue_key FROM project_jira_links WHERE project_id = $1", [promoted.body.id])).rows,
        [{ jira_issue_id: "101", jira_issue_key: "KEY-101" }]);
      assert.equal((await promote(linked.body.id)).status, 409, "duplicate promotion blocked");
      const additional = await promote(linked.body.id, { allowDuplicate: true });
      assert.equal(additional.status, 201);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM project_jira_links WHERE project_id = $1", [additional.body.id])).rows[0].n, 1);
      assert.equal((await promote(noJira.body.id)).status, 201);
      assert.equal(requests.length, beforePromotion);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM initiative_versions")).rows[0].n, 2, "promotion leaves initiative history intact");
    });
    await t.test("J2 auth and additive schema safety", async () => {
      for (const layer of (jiraLinksRouter as any).stack) {
        let status = 0;
        await requireMatrixSession({ headers: {} } as any, { status(v: number) { status = v; return this; }, json(value: unknown) { noSecret(value); } } as any, () => { throw new Error("Unauthenticated Jira route"); });
        assert.equal(status, 401, layer.route.path);
      }
      const source = readFileSync("src/routes/jira-links.ts", "utf8");
      assert.equal(/console\.(?:log|error)|(?:req\.)?log(?:ger)?\.(?:info|error|warn|debug)/.test(source), false);
      assert.equal(/\.post\(["'`]\/rest\/api\/3|\.put\(["'`]\/rest\/api\/3/.test(source), false);
      const schema = readFileSync("../../lib/db/src/schema/jira.ts", "utf8");
      assert.match(schema, /projectJiraLinksTable/);
      assert.match(schema, /onDelete: "cascade"/);
      assert.equal(/(?:summary|status|assignee|priority|description): (?:text|jsonb)\(/.test(schema.slice(schema.indexOf("export const projectJiraLinksTable"))), false);
    });
    await t.test("Matrix app-info and health version surfaces", async () => {
      const info = await call(matrixRouter, "GET", "/app-info");
      assert.equal(info.body.version, "v1.6.1");
      assert.equal(info.body.name, "Innovation Hub");
      noSecret(info);
      const health = await call(matrixRouter, "GET", "/health");
      assert.equal(health.body.version, "v1.6.1"); noSecret(health);
    });
    await t.test("unchanged Matrix session mint/verify", async () => {
      process.env.SESSION_SECRET = "J1-automated-test-session-secret-not-real";
      const token = await mintSessionToken({ sub: "j1-test", name: "Test", email: null });
      assert.equal((await verifySessionToken(token))?.sub, "j1-test");
      assert.equal(await verifySessionToken(`${token}invalid`), null);
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env = oldEnv;
    pool.query = query;
    pool.connect = connect;
    client.release(true); // Closing session destroys all temporary fixtures.
    await pool.end();
  }
});