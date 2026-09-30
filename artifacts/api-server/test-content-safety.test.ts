import test from "node:test";
import assert from "node:assert/strict";
import { inspectContent, assertSafeContent, ContentBlockedError, contentSafetyBoundary, contentSafetyErrorHandler } from "./src/lib/content-safety";
import { advanceInterview, generateInterviewDraft } from "./src/routes/interview-ai";
import drafts from "./src/routes/interview-drafts";
import initiatives from "./src/routes/initiatives";
import exportsRouter from "./src/routes/initiative-brief";
import { JiraClient } from "./src/lib/jira-client";
import { db } from "@workspace/db";

const allowed = [
  "This Initiative could save $75,000 annually.", "Revenue declined by approximately 10%.",
  "We need to improve HIPAA compliance.", "The client reported inappropriate employee behavior.",
  "We need stronger password-management policies.", "The system stores member healthcare information.",
  "Expected savings are approximately $75,000 per year.", "This could generate $80,000 in annual client revenue.",
  "We need stronger HIPAA controls.", "Credential management is inconsistent.",
  "Employees currently store application passwords in multiple systems.",
  "The Initiative concerns a reported harassment process and needs better case routing.",
  "Class assignments and Scunthorpe analytics support assessment of threats and kill switches.",
];
// Synthetic examples only; never live credentials or individual records.
const blocked = [
  ["PERSONAL_IDENTIFIER", "SSN 123-45-6789"],
  ["PERSONAL_IDENTIFIER", "passport number: FAKE123456"],
  ["FINANCIAL_IDENTIFIER", "Card 4111 1111 1111 1111"],
  ["FINANCIAL_IDENTIFIER", "bank account: 123456789012 routing: 021000021"],
  ["FINANCIAL_IDENTIFIER", "IBAN: DE89370400440532013000"],
  ["CREDENTIAL_SECRET", "api_key=sk-testSynthetic01234567890"],
  ["CREDENTIAL_SECRET", "password: SyntheticPassword!"],
  ["CREDENTIAL_SECRET", "-----BEGIN PRIVATE KEY----- fake -----END PRIVATE KEY-----"],
  ["CREDENTIAL_SECRET", "postgres://fake:synthetic@db.example.invalid/test"],
  ["CREDENTIAL_SECRET", "Authorization: Bearer fakeSyntheticToken12345"],
  ["SEXUAL_VULGAR_HARASSMENT", "This is fucking broken."],
  ["SEXUAL_VULGAR_HARASSMENT", "Send me nudes"],
  ["SEXUAL_VULGAR_HARASSMENT", "My manager groped me"],
  ["HATE_ABUSE", "You are an idiot"],
  ["HATE_ABUSE", "faggot"],
  ["THREAT", "I will kill you"],
  ["HEALTH_PHI", "Patient Jane Example diagnosed with diabetes"],
  ["HEALTH_PHI", "Jane Example has HIV"],
  ["RESTRICTED_CONFIDENTIAL", "Jane Example salary: $95000"],
] as const;
test("legitimate financial, compliance, security and professional HR content remains allowed", () => {
  for (const text of allowed) assert.deepEqual(inspectContent(text), []);
});
test("all eight restricted categories, normalization, nested keys and labeled values", () => {
  for (const [category, text] of blocked) assert.ok(inspectContent(text).includes(category), category);
  assert.ok(inspectContent({ state: { api_key: "SyntheticKey12345" } }).includes("CREDENTIAL_SECRET"));
  assert.ok(inspectContent("pass\u200bword: SyntheticPassword!").includes("CREDENTIAL_SECRET"));
  assert.ok(inspectContent({ ["password: SyntheticPassword!"]: "nested key" }).length);
});
test("sensitive keys carry through objects and arrays; banking rules require banking context", () => {
  for (const payload of [
    { password: { value: "synthetic" } }, { password: ["synthetic"] },
    { apiKey: { nested: ["synthetic"] } }, { access_token: { value: 1234 } },
    { clientSecret: [{ value: "synthetic" }] },
  ]) assert.ok(inspectContent(payload).includes("CREDENTIAL_SECRET"));
  assert.deepEqual(inspectContent("Routing 500000 calls daily"), []);
  assert.deepEqual(inspectContent("Routing 500000 calls daily improves workflow"), []);
  assert.ok(inspectContent("Routing number 021000021").includes("FINANCIAL_IDENTIFIER"));
  assert.ok(inspectContent("Bank routing 021000021").includes("FINANCIAL_IDENTIFIER"));
});
test("typed server Jira metadata can exempt only explicit numeric ID paths, never narrative or credentials", async () => {
  const cardLikeId = "4111111111111111";
  assert.deepEqual(inspectContent({ jiraIssueId: cardLikeId }, ["jiraIssueId"]), []);
  assert.ok(inspectContent({ jiraIssueId: cardLikeId }).includes("FINANCIAL_IDENTIFIER"),
    "untrusted arbitrary objects have no automatic key-name exemption");
  assert.ok(inspectContent({ jiraIssueId: cardLikeId, summary: cardLikeId }, ["jiraIssueId"]).includes("FINANCIAL_IDENTIFIER"));
  assert.ok(inspectContent({ jiraIssueId: "password: synthetic" }, ["jiraIssueId"]).includes("CREDENTIAL_SECRET"));
  assert.ok(inspectContent({ password: cardLikeId }, ["password"]).includes("CREDENTIAL_SECRET"));
  const client = new JiraClient(async () => { throw new Error("No network"); }, {});
  (client as any).get = async () => ({ id: cardLikeId, key: "TEST-1", fields: {
    summary: "Improve routing", description: "Routing 500000 calls daily",
    project: { id: cardLikeId, key: "TEST", name: "Test" },
    issuetype: { name: "Task" }, status: { name: "Open" },
  } });
  assert.equal((await client.intakeContext(cardLikeId)).jiraIssueId, cardLikeId);
});
function handler(router: any, method: string, path: string) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route, `route exists: ${method} ${path}`);
  return route.route.stack[0].handle;
}
test("actual autosave/create, Quick Submit/final save, review and DOCX/PDF route handlers reject before storage/render", async () => {
  let storageCalls = 0;
  const methods = ["insert", "update", "select", "transaction"] as const;
  const originals = methods.map(key => db[key]);
  for (const key of methods) (db as any)[key] = () => { storageCalls++; throw new Error("Storage must not be called"); };
  try {
    for (const [, text] of blocked) {
      for (const [router, method, path, body, params] of [
        [drafts, "post", "/interview/drafts", { state: { turns: [{ answer: text }] } }, {}],
        [drafts, "put", "/interview/drafts/:id", { state: { notes: text }, revision: 1 }, { id: "00000000-0000-0000-0000-000000000001" }],
        [initiatives, "post", "/initiatives", { title: text }, {}],
        [initiatives, "patch", "/initiatives/:id", { problemStatement: text }, { id: "1" }],
        [exportsRouter, "post", "/initiative-brief/export/:format", { metadata: { title: text } }, { format: "docx" }],
        [exportsRouter, "post", "/initiative-brief/export/:format", { metadata: { title: text } }, { format: "pdf" }],
      ] as any[]) {
        let emitted = false;
        const res = { json() { emitted = true; }, send() { emitted = true; } };
        await assert.rejects(() => handler(router, method, path)({ body, params, matrixIdentity: { sub: "synthetic-owner" } }, res, () => {}), ContentBlockedError);
        assert.equal(emitted, false);
      }
    }
    assert.equal(storageCalls, 0);
  } finally { methods.forEach((key, i) => { (db as any)[key] = originals[i]; }); }
});
test("interview answer and draft including fallback ceiling reject before infer; AI output never returned", async () => {
  let calls = 0;
  const infer = async () => { calls++; return { data: {} }; };
  for (const [, text] of blocked) {
    for (const operation of [advanceInterview, generateInterviewDraft]) {
      for (const count of [1, 12]) {
        await assert.rejects(() => operation({ turns: Array.from({ length: count }, () => ({ question: "Describe the issue", answer: text })), jira: null }, infer), ContentBlockedError);
      }
    }
  }
  assert.equal(calls, 0);
  for (const [, text] of blocked) {
    for (const operation of [advanceInterview, generateInterviewDraft]) {
      let attempts = 0;
      await assert.rejects(() => operation({ turns: [{ question: "Describe the issue", answer: allowed[0] }], jira: null },
        async () => { attempts++; return { data: { nextQuestion: text } }; }), ContentBlockedError);
      assert.equal(attempts, 1, "no unsafe regeneration or fallback output");
    }
  }
});
test("Jira fetched summary and ADF description rejected, including fragments combined after extraction", async () => {
  const client = new JiraClient(async () => { throw new Error("Network must not be called"); }, {});
  const issue = (summary: string, description: unknown) => ({ id: "1", key: "TEST-1", fields: {
    summary, description, issuetype: { name: "Task" }, status: { name: "Open" },
    project: { id: "2", key: "TEST", name: "Test project" },
  } });
  for (const [, text] of blocked) {
    (client as any).get = async () => issue(text, "");
    await assert.rejects(() => client.intakeContext("1"), ContentBlockedError);
    (client as any).get = async () => issue("Improve workflow", { type: "doc", content: [{ type: "text", text }] });
    await assert.rejects(() => client.intakeContext("1"), ContentBlockedError);
  }
  (client as any).get = async () => issue("Improve workflow", { type: "doc", content: [
    { type: "text", text: "password:" }, { type: "text", text: "SyntheticPassword!" },
  ] });
  await assert.rejects(() => client.intakeContext("1"), ContentBlockedError);
  (client as any).get = async () => issue("Improve workflow", allowed[3]);
  assert.equal((await client.intakeContext("1")).description, allowed[3]);
});
test("authenticated cross-path boundary records metadata only and returns safe 422 without executing downstream", async () => {
  for (const path of ["/interview/advance", "/interview/draft", "/interview/drafts", "/interview/drafts/id",
    "/initiatives", "/initiatives/1", "/jira/issues/1/intake-context", "/initiative-brief/export/pdf", "/initiative-brief/export/docx"]) {
    for (const [, text] of blocked) {
      const logs: unknown[] = [];
      let status = 200, response: any, downstream = 0;
      const res: any = { status(n: number) { status = n; return res; }, json(v: any) { response = v; return res; } };
      const req: any = { path, method: "POST", body: { narrative: text }, query: {},
        matrixIdentity: { sub: "synthetic-owner" }, log: { warn(event: unknown) { logs.push(event); } } };
      contentSafetyBoundary(req, res, error => {
        if (error) contentSafetyErrorHandler(error, req, res, () => { throw new Error("Unexpected error"); });
        else downstream++;
      });
      assert.equal(downstream, 0);
      assert.equal(status, 422);
      assert.equal(response.code, "CONTENT_BLOCKED");
      assert.equal(logs.length, 1);
      assert.deepEqual(Object.keys(logs[0] as object).sort(), ["action", "blocked", "categories", "route", "ruleVersion", "timestamp", "userId"]);
      assert.ok(!JSON.stringify({ logs, response }).includes(text));
    }
  }
});
test("async external boundary inherits authenticated audit identity, never raw errors; anonymous boundary stops", async () => {
  const logs: any[] = [];
  const req: any = { path: "/interview/draft", method: "POST", body: {}, query: {},
    matrixIdentity: { sub: "synthetic-owner" }, log: { warn(event: unknown) { logs.push(event); } } };
  await new Promise<void>((resolve, reject) => contentSafetyBoundary(req, {} as any, async error => {
    if (error) { reject(error); return; }
    await Promise.resolve();
    assert.throws(() => assertSafeContent(blocked[0][1], "ai_output"), ContentBlockedError);
    resolve();
  }));
  assert.equal(logs[0].userId, "synthetic-owner");
  assert.equal(logs[0].action, "ai_output");
  let status = 0, downstream = false;
  const res: any = { status(n: number) { status = n; return res; }, json() {} };
  contentSafetyBoundary({ ...req, matrixIdentity: undefined }, res, () => { downstream = true; });
  assert.equal(status, 401);
  assert.equal(downstream, false);
});