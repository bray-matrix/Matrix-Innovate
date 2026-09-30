import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import draftRouter from "./src/routes/interview-drafts";
import initiativeRouter from "./src/routes/initiatives";
import { buildInitiativeBrief } from "@workspace/initiative-brief";

function call(router: any, method: string, path: string, sub: string | null, body: any = {}, params: any = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method.toLowerCase()]);
    assert.ok(route, `${method} ${path}`);
    let status = 200;
    const res: any = {
      status(code: number) { status = code; return res; },
      json(value: any) { resolve({ status, body: value }); return res; },
      end() { resolve({ status, body: null }); return res; },
    };
    Promise.resolve(route.route.stack[0].handle({
      body, params, matrixIdentity: sub ? { sub } : undefined,
    }, res, reject)).catch(reject);
  });
}

test("private interview persistence: ownership, tampering, concurrency and authenticated save linkage", async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  try {
    await client.query("CREATE TEMP SEQUENCE test_initiative_id_seq");
    await client.query("CREATE TEMP TABLE initiatives (LIKE public.initiatives INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)");
    await client.query("ALTER TABLE initiatives ALTER COLUMN id SET DEFAULT nextval('pg_temp.test_initiative_id_seq')");
    await client.query("CREATE TEMP TABLE initiative_versions (LIKE public.initiative_versions INCLUDING DEFAULTS)");
    await client.query("CREATE TEMP TABLE calculation_events (LIKE public.calculation_events INCLUDING DEFAULTS)");
    await client.query("CREATE TEMP TABLE initiative_jira_links (LIKE public.initiative_jira_links INCLUDING DEFAULTS)");
    await client.query(`CREATE TEMP TABLE interview_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_sub text NOT NULL, state jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'active',
      saved_initiative_id integer REFERENCES initiatives(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
      completed_at timestamp
    )`);
    await client.query("CREATE UNIQUE INDEX test_one_active ON interview_drafts(owner_sub) WHERE status = 'active'");
    (pool as any).query = client.query.bind(client);
    (pool as any).connect = async () => ({ query: client.query.bind(client), release() {} });
    const drafts = (method: string, path: string, sub: string | null, body: any = {}, id?: string) =>
      call(draftRouter, method, path, sub, body, id ? { id } : {});
    const active = (sub: string) => drafts("GET", "/interview/drafts/active", sub);
    const create = (sub: string, state: any) => drafts("POST", "/interview/drafts", sub, { state });
    const put = (sub: string, id: string, state: any, revision: number) =>
      drafts("PUT", "/interview/drafts/:id", sub, { state, revision }, id);
    const remove = (sub: string, id: string) => drafts("DELETE", "/interview/drafts/:id", sub, {}, id);
    const complete = (sub: string, id: string, initiativeId: number) =>
      drafts("POST", "/interview/drafts/:id/complete", sub, { initiativeId }, id);

    assert.equal((await create("", { answer: "secret" })).status, 401);
    assert.deepEqual((await active("B")).body, { draft: null });
    const a = await create("A", { messages: [{ role: "user", text: "A secret" }] });
    assert.equal(a.status, 201);
    assert.equal(a.body.revision, 1);
    assert.equal((await create("A", {})).status, 409);
    assert.deepEqual((await active("B")).body, { draft: null });
    assert.deepEqual((await active("A")).body.draft, a.body, "A resumes private state");
    assert.equal((await put("B", a.body.id, { stolen: true }, 1)).status, 404);
    assert.equal((await remove("B", a.body.id)).status, 404);
    assert.equal((await complete("B", a.body.id, 1)).status, 404);
    assert.equal((await drafts("GET", "/interview/drafts/active", null)).status, 401);
    assert.equal((await put("A", "not-an-id", {}, 1)).status, 400);
    assert.equal((await put("A", a.body.id, { invalid: "x".repeat(130 * 1024) }, 1)).status, 400);
    assert.equal((await put("A", a.body.id, [], 1)).status, 400);
    const [first, second] = await Promise.all([
      put("A", a.body.id, { answer: "one" }, 1),
      put("A", a.body.id, { answer: "two" }, 1),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409], "only one revision wins");
    const current = (await active("A")).body.draft;
    assert.equal(current.revision, 2);
    assert.deepEqual(current.state, first.status === 200 ? first.body.state : second.body.state);
    assert.equal((await put("B", a.body.id, { tampered: true }, 2)).status, 404);
    assert.equal((await complete("A", a.body.id, 777)).status, 404, "unrelated save cannot complete");
    const b = await create("B", { answer: "B private" });
    assert.equal(b.status, 201);
    assert.deepEqual((await active("B")).body.draft, b.body, "B resumes only B's interview");

    const initiativeBody = { title: "Test", department: "Operations", submitterName: "A",
      category: "Process", problemStatement: "Issue", currentProcess: "Manual", desiredOutcome: "Better",
      aiConcept: "", prototypeGoal: "", successMetric: "Cycle time" };
    const save = (sub: string, interviewDraftId: string) =>
      call(initiativeRouter, "POST", "/initiatives", sub, { ...initiativeBody, interviewDraftId });
    assert.equal((await save("B", a.body.id)).status, 404, "cannot bind someone else's draft");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count, 0);
    const savedB = await save("B", b.body.id);
    assert.equal(savedB.status, 201);
    assert.equal((await complete("A", a.body.id, savedB.body.id)).status, 404, "another user's saved initiative denied");
    const savedA = await save("A", a.body.id);
    assert.equal(savedA.status, 201);
    assert.equal((await save("A", a.body.id)).body.id, savedA.body.id, "retry returns original receipt");
    assert.equal((await save("B", a.body.id)).status, 404, "foreign completed draft stays private");
    assert.equal((await complete("B", a.body.id, savedA.body.id)).status, 404);
    assert.equal((await complete("A", a.body.id, savedA.body.id)).status, 200);
    assert.deepEqual((await active("A")).body, { draft: null });
    assert.equal((await complete("A", a.body.id, savedA.body.id)).status, 200, "complete is idempotent");
    assert.equal((await remove("A", a.body.id)).status, 404, "completed history is immutable to reset");
    assert.equal((await client.query("SELECT status, saved_initiative_id FROM interview_drafts WHERE id = $1", [a.body.id])).rows[0].status, "completed");

    assert.equal((await remove("A", b.body.id)).status, 404);
    assert.equal((await remove("B", b.body.id)).status, 404, "saved drafts cannot be deleted");
    assert.deepEqual((await active("B")).body, { draft: null });
    assert.equal((await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count, 2, "retry never creates an extra initiative");
    const [fresh, racing] = await Promise.all([create("B", { answer: "fresh" }), create("B", { answer: "racing" })]);
    assert.deepEqual([fresh.status, racing.status].sort(), [201, 409], "concurrent starts yield one active draft");
    const freshDraftId = (await active("B")).body.draft.id;
    assert.notEqual(freshDraftId, b.body.id);
    const brief = buildInitiativeBrief({
      draft: {
        fields: {
          title: "Reviewed save", category: "Process", department: "Operations",
          submitterName: "B", businessOwner: "Owner", executiveSponsor: "Sponsor",
          problemStatement: "Current gaps", currentProcess: "Manual handoffs",
          desiredOutcome: "Clear ownership", aiConcept: "", prototypeGoal: "",
          successMetric: "Handoffs recorded", estimatedHoursSavedMonthly: 0,
          estimatedRevenueOpportunity: 0, estimatedCostSavings: 0,
          customerImpact: "", complianceRisk: "", technicalComplexity: "", aiReadiness: "",
        },
        canvas: { expectedValue: "Fewer gaps in service", risks: "Ownership is uncertain",
          recommendedNextStep: "Validate ownership" },
        executiveSummary: "Improve coordination", score: 55, priority: "Medium",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
      review: { readiness: "83%", criticalUnknowns: ["Who approves changes?"] },
    });
    const scored = await call(initiativeRouter, "POST", "/initiatives", "B", {
      ...initiativeBody, title: "Reviewed save", interviewDraftId: freshDraftId,
      reviewedBrief: brief, businessValue: 21, strategicAlignment: 8,
      revenuePotential: 3, costSavingsScore: 7, customerImpactScore: 11,
      aiReadinessScore: 5, prototypeConfidence: 8, technicalComplexityPenalty: -6,
      riskPenalty: -2,
    });
    assert.equal(scored.status, 201, scored.body.error);
    assert.equal(scored.body.score, 55);
    assert.equal(scored.body.version, "v0.1.0");
    assert.equal(scored.body.reviewedBrief.unknowns[0].text, "Who approves changes?");
    assert.equal(scored.body.reviewedBrief.assessment.readiness, "83%");
    assert.equal(scored.body.desiredOutcome, "Better", "core desired outcome is not overwritten by supplemental narrative");
    const id = scored.body.id;
    const detail = await call(initiativeRouter, "GET", "/initiatives/:id", "B", {}, { id: String(id) });
    assert.equal(detail.body.reviewedBrief.expectedValue.qualitative.text, "Fewer gaps in service");
    const versions = await call(initiativeRouter, "GET", "/initiatives/:id/versions", "B", {}, { id: String(id) });
    assert.equal(versions.body.length, 1);
    assert.equal(versions.body[0].snapshot.score, 55);
    assert.equal(versions.body[0].snapshot.businessValue, 21);
    assert.deepEqual(versions.body[0].snapshot.reviewedBrief, brief);
    assert.equal((await save("A", freshDraftId)).status, 404);
    assert.equal((await complete("B", freshDraftId, id)).status, 200);
    assert.equal((await complete("B", freshDraftId, savedA.body.id)).status, 404);
    assert.equal((await call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, interviewDraftId: freshDraftId, title: "Changed on retry" })).body.id, id);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count, 3);
    const patched = await call(initiativeRouter, "PATCH", "/initiatives/:id", "B",
      { currentProcess: "Now tracked" }, { id: String(id) });
    assert.equal(patched.body.reviewedBrief.unknowns[0].text, "Who approves changes?");
    assert.equal(patched.body.score, 55);
    const diff = await call(initiativeRouter, "GET", "/initiatives/:id/compare", "B", {}, { id: String(id) });
    assert.equal(diff.body.available, true);
    assert.equal(diff.body.fields.find((f: any) => f.field === "reviewedBrief").changed, false);
    const changedBrief = { ...brief, nextSteps: { text: "Review sponsorship", source: "reviewed" } };
    const revised = await call(initiativeRouter, "PATCH", "/initiatives/:id", "B",
      { reviewedBrief: changedBrief }, { id: String(id) });
    assert.equal(revised.body.reviewedBrief.nextSteps.text, "Review sponsorship");
    assert.equal((await call(initiativeRouter, "GET", "/initiatives/:id/compare", "B", {},
      { id: String(id) })).body.fields.find((f: any) => f.field === "reviewedBrief").changed, true);
    const recalculated = await call(initiativeRouter, "POST", "/initiatives/:id/recalculate", "B",
      {}, { id: String(id) });
    assert.equal(recalculated.status, 200);
    assert.equal(recalculated.body.initiative.reviewedBrief.nextSteps.text, "Review sponsorship");
    assert.equal(recalculated.body.initiative.businessValue, 21, "judgment components survive recalculation");
    assert.equal((await save("B", freshDraftId)).body.id, id, "retry cannot overwrite reviewed content");
    const malformed = { ...brief, extra: { arbitrary: "unbounded" } };
    assert.equal((await call(initiativeRouter, "PATCH", "/initiatives/:id", "B",
      { reviewedBrief: malformed }, { id: String(id) })).status, 400);
    await assert.rejects(() => call(initiativeRouter, "PATCH", "/initiatives/:id", "B",
      { reviewedBrief: { ...brief, nextSteps: { text: "password: syntheticSecretValue", source: "reviewed" } } },
      { id: String(id) }), { name: "Error" });
    // A legacy restricted draft cannot be resumed, but owner-only discard
    // must work without retrieving the state or accepting a target owner.
    await client.query("INSERT INTO interview_drafts (owner_sub, state) VALUES ($1, $2)", [
      "legacy-owner", JSON.stringify({ answer: "password: syntheticLegacyValue" }),
    ]);
    await assert.rejects(() => active("legacy-owner"), { name: "Error", message:
      "This entry appears to contain sensitive or inappropriate information that should not be stored in Innovation Hub. Remove the restricted content and try again." });
    assert.equal((await drafts("DELETE", "/interview/drafts/active", null)).status, 401);
    assert.equal((await drafts("DELETE", "/interview/drafts/active", "unrelated-owner", { ownerSub: "legacy-owner" })).status, 204);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM interview_drafts WHERE owner_sub = $1", ["legacy-owner"])).rows[0].count, 1);
    assert.equal((await drafts("DELETE", "/interview/drafts/active", "legacy-owner")).status, 204);
    assert.equal((await drafts("DELETE", "/interview/drafts/active", "legacy-owner")).status, 204, "idempotent");
    assert.deepEqual((await active("legacy-owner")).body, { draft: null });
    assert.deepEqual((await active("B")).body, { draft: null });
    assert.equal((await client.query("SELECT status FROM interview_drafts WHERE id = $1", [a.body.id])).rows[0].status, "completed");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count, 3);
    const nullable = await call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, title: "Explicitly no brief", reviewedBrief: null });
    assert.equal(nullable.status, 201);
    assert.equal(nullable.body.reviewedBrief, null);
    assert.equal(nullable.body.score, 0, "unscored legacy create remains unchanged");
    assert.equal(nullable.body.version, "v0.1.0");
    const nullHistory = await call(initiativeRouter, "GET", "/initiatives/:id/versions", "B",
      {}, { id: String(nullable.body.id) });
    assert.equal(nullHistory.body.length, 1);
    assert.equal(nullHistory.body[0].snapshot.reviewedBrief, null);
    const countBeforeInvalid = (await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count;
    assert.equal((await call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, reviewedBrief: { ...brief, unknowns: [{ text: "Missing priority" }] } })).status, 400);
    assert.equal((await call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, reviewedBrief: { ...brief, extra: { unsupported: true } } })).status, 400);
    await assert.rejects(() => call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, reviewedBrief: { ...brief,
        supportingContext: { facts: [], jiraKey: "", token: "syntheticSecretValue" } } }), { name: "Error" });
    assert.equal((await client.query("SELECT count(*)::int AS count FROM initiatives")).rows[0].count,
      countBeforeInvalid, "invalid or unsafe create never persists a row");
    const clamped = await call(initiativeRouter, "POST", "/initiatives", "B",
      { ...initiativeBody, businessValue: 50, riskPenalty: -20 });
    assert.equal(clamped.status, 201);
    assert.equal(clamped.body.businessValue, 50, "submitted component is retained like PATCH");
    assert.equal(clamped.body.riskPenalty, -20);
    assert.equal(clamped.body.score, 15, "score applies existing 25/-10 clamps");
    assert.equal(clamped.body.priority, "Low");
  } finally {
    (pool as any).query = originalQuery;
    (pool as any).connect = originalConnect;
    client.release(true);
  }
});