import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JiraClient, jiraConfig } from "./src/lib/jira-client";
import jiraRouter from "./src/routes/jira";
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
const call = (router: any, method: string, path: string, body = {}, params = {}) => new Promise<{ status: number; body: any }>((resolve, reject) => {
  const route = router.stack.find((r: any) => r.route?.path === path && r.route.methods[method.toLowerCase()]);
  assert.ok(route, `${method} ${path} exists`);
  let status = 200;
  const res: any = { status: (v: number) => { status = v; return res; }, json: (value: unknown) => resolve({ status, body: value }) };
  Promise.resolve(route.route.stack[0].handle({ body, params, query: {}, headers: {}, log: { info() {}, error() { throw new Error("Unexpected error logging"); } } }, res, reject)).catch(reject);
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
    });
    await t.test("Matrix app-info and health version surfaces", async () => {
      const info = await call(matrixRouter, "GET", "/app-info");
      assert.equal(info.body.version, "v1.3.0");
      assert.equal(info.body.name, "Matrix Innovation Hub");
      noSecret(info);
      const health = await call(matrixRouter, "GET", "/health");
      assert.equal(health.body.version, "v1.3.0"); noSecret(health);
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