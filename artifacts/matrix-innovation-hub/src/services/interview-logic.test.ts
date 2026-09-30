import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_MESSAGE, checkedResponse, isContentBlocked, safeErrorMessage } from "../lib/content-safety-error";
import { interviewEngine, mapConversationToFallback, nextFallbackQuestion,
  fallbackReadiness, canDraft, shouldContinueInterview, missingCriticalContext, isInterviewReadiness } from "./interviewEngine";
import {
  answersForReview, buildDraft, computeScore, countTranscriptAnswers,
  toTitle, validateInitiativeDraft, privateInterview, trackInterviewSave, waitForInterviewSave, parseLoss,
  type InitiativeDraftFields,
} from "./aiInterviewService";

test("blocked API errors show safe category but never echo rejected text", async () => {
  const sensitive = "synthetic-rejected-value";
  const body = { code: "CONTENT_BLOCKED", error: `unsafe ${sensitive}`, categories: ["CREDENTIAL_SECRET"] };
  const response = new Response(JSON.stringify(body), { status: 422 });
  await assert.rejects(checkedResponse(response, "Unavailable"), error => {
    assert.equal(isContentBlocked(error), true);
    assert.match(safeErrorMessage(error, "Unavailable"), /Possible credential or secret detected/);
    assert.ok(safeErrorMessage(error, "Unavailable").startsWith(BLOCKED_MESSAGE));
    assert.ok(!safeErrorMessage(error, "Unavailable").includes(sensitive));
    return true;
  });
  assert.match(safeErrorMessage({ status: 422, data: body }, "Unavailable"), /Possible credential or secret detected/);
  assert.equal(safeErrorMessage({ status: 500, data: body }, "Unavailable"), "Unavailable");
  assert.equal(safeErrorMessage({ status: 422, data: { error: sensitive } }, "Unavailable"), "Unavailable");
  const hrMessage = safeErrorMessage({ status: 422, data: {
    code: "CONTENT_BLOCKED", categories: ["SEXUAL_VULGAR_HARASSMENT", sensitive],
  } }, "Unavailable");
  assert.match(hrMessage, /appropriate Matrix HR or management reporting process/);
  assert.ok(!hrMessage.includes(sensitive));
});

test("titles use complete project names, not truncated answer fragments", () => {
  assert.equal(toTitle("build a centralized Matrix Platform that brings our teams together"), "Centralized Matrix Platform");
  assert.equal(toTitle("We want to improve the customer onboarding process."), "Customer Onboarding Process");
  assert.equal(toTitle(""), "New Business Initiative");
});

test("Jira context skips known opening content without dropping business follow-ups", () => {
  const plain = interviewEngine.planQuestions({});
  assert.equal(plain[0].id, "idea");
  assert.equal(plain[1].id, "problem");
  const existing = interviewEngine.planQuestions({
    jiraIssueId: "101", idea: "Improve onboarding", problem: "Manual handoffs slow onboarding",
  });
  assert.ok(!existing.some(q => q.id === "idea" || q.id === "problem"));
  assert.ok(["category_detail", "frequency", "success", "loss", "deadline", "notes"].every(id => existing.some(q => q.id === id)));
  const gap = interviewEngine.planQuestions({ jiraIssueId: "101", idea: "Improve onboarding" });
  assert.equal(gap[0].id, "problem");
  assert.equal(gap.filter(q => q.id === "problem").length, 1);
});

test("validation reports all missing required fields and rejects invisible category suggestions", () => {
  const fields = {
    title: "", department: "", category: "Experimental", submitterName: "", problemStatement: "",
  } as InitiativeDraftFields;
  const lists = { departments: ["Operations"], categories: ["Operational Efficiency"] };
  assert.deepEqual(validateInitiativeDraft(fields, lists.departments, lists.categories), {
    title: "This field is required.",
    department: "This field is required.",
    category: "Select a category from the list.",
    submitterName: "This field is required.",
    problemStatement: "This field is required.",
  });
  assert.deepEqual(validateInitiativeDraft({
    ...fields, title: "Onboarding", department: "Operations", category: "Operational Efficiency",
    submitterName: "Alex User", problemStatement: "Manual handoffs",
  }, lists.departments, lists.categories), {});
});

test("unknown impact does not manufacture monetary value; negative penalties stay negative", () => {
  const draft = buildDraft(
    { idea: "Improve onboarding", problem: "Manual handoffs", success: "Fewer delays", loss: "Value not yet known" },
    "",
    { category: "Operations", label: "Operations Improvement", suggestedInitiativeCategory: "Operational Efficiency" },
  );
  assert.equal(draft.fields.estimatedRevenueOpportunity, 0);
  assert.equal(draft.fields.estimatedCostSavings, 0);
  assert.equal(draft.canvas.expectedValue, "Value not yet quantified.");
  assert.ok(draft.scoring.technicalComplexityPenalty < 0);
  assert.equal(computeScore(draft.scoring), draft.score);
});

test("current effort or loss is not silently promoted into authoritative savings", () => {
  assert.deepEqual(parseLoss("We spend 40 hours per month and $20,000 in labor costs."),
    { hours: 0, revenue: 0, costSavings: 0 });
  assert.deepEqual(parseLoss("User estimates we could save 40 hours per month and $20,000 in cost savings."),
    { hours: 40, revenue: 0, costSavings: 20000 });
});

test("completed AI interview preserves the final submitted answer through review", () => {
  const answers = { idea: "Improve requests", ai_1: "The client is affected" };
  assert.deepEqual(answersForReview(answers, "ai_1", "", true), answers);
  assert.equal(answersForReview(answers, "ai_1", "Updated answer", false).ai_1, "Updated answer");
});

test("outage fallback recognizes qualitative frequency without fabricating a number", () => {
  const turns = [
    { question: "What problem or opportunity would you like to address?", answer: "Improve manual intake." },
    { question: "How often does this come up?", answer: "It comes up regularly now." },
  ];
  const mapped = mapConversationToFallback({ idea: turns[0].answer, ai_1: turns[1].answer }, turns);
  assert.equal(mapped.frequency, "It comes up regularly now.");
  assert.ok(!/\d/.test(mapped.frequency));
  const plan = interviewEngine.planQuestions(mapped);
  assert.notEqual(plan[nextFallbackQuestion(plan, mapped)]?.id, "frequency");
});

test("outage fallback asks the next missing useful question using accumulated user evidence", () => {
  const turns = [
    { question: "What problem would you address?", answer: "Reduce manual customer requests." },
    { question: "Who is affected by the current process?", answer: "Our support team manually routes customer requests today." },
    { question: "What steps take the most effort?", answer: "Handoffs and repeated approvals delay the work." },
    { question: "How often does that happen?", answer: "It comes up regularly now." },
  ];
  const mapped = mapConversationToFallback({ idea: turns[0].answer }, turns);
  assert.equal(mapped.problem, turns[1].answer);
  assert.equal(mapped.category_detail, turns[2].answer);
  assert.equal(mapped.frequency, turns[3].answer);
  const plan = interviewEngine.planQuestions(mapped);
  assert.equal(plan[nextFallbackQuestion(plan, mapped)].id, "success");
  assert.ok(!mapped.loss);
  assert.ok(!mapped.success);
});

test("AI outage still yields a usable deterministic interview and draft without treating unknowns as evidence", async () => {
  const mapped = mapConversationToFallback({ idea: "Improve intake" }, [
    { question: "How often does it happen?", answer: "Don't know" },
    { question: "What is the impact?", answer: "Not sure" },
  ]);
  assert.equal(mapped.frequency, undefined);
  assert.equal(mapped.loss, undefined);
  const plan = interviewEngine.planQuestions(mapped);
  assert.ok(nextFallbackQuestion(plan, mapped) >= 0);
  const draft = await interviewEngine.generateDraft({ ...mapped, problem: "We manually route requests today." }, plan);
  assert.equal(draft.fields.title, "Intake");
  assert.equal(draft.fields.estimatedRevenueOpportunity, 0);
});

test("fallback readiness shares the server's pure dimensions, not answer-count progress", () => {
  const initial = fallbackReadiness({});
  assert.equal(initial.score, 0);
  const strong = fallbackReadiness({ idea: "Customer support requests are delayed by manual routing." }, [
    { question: "What problem or opportunity would you like to address?", answer: "Customer support requests are delayed by manual routing." },
    { question: "Who is affected?", answer: "Our support team and customers wait for each request to be routed." },
    { question: "What business impact does this have?", answer: "Delays cause missed service expectations and wasted time every week." },
    { question: "What would a better outcome look like?", answer: "We want faster, reliable routing and fewer missed requests." },
    { question: "Are there any constraints?", answer: "We must keep customer data secure." },
  ]);
  assert.ok(strong.score > initial.score);
  assert.equal(strong.dimensions.length, 7);
  assert.equal(isInterviewReadiness(strong), true);
  assert.equal(isInterviewReadiness({ ...strong, dimensions: {} }), false);
  assert.equal(isInterviewReadiness({ ...strong, score: Number.NaN }), false);
  assert.equal(canDraft(strong), true);
  assert.equal(shouldContinueInterview(strong, 5, "low"), false);
  assert.ok(missingCriticalContext(initial).length > 0);
  assert.equal(shouldContinueInterview(initial, 12, "high"), false);
});

test("navigation waits for the final in-flight private save for that subject only", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  trackInterviewSave("subject-a", pending);
  let resumed = false;
  const resume = waitForInterviewSave("subject-a").then(() => { resumed = true; });
  await waitForInterviewSave("subject-b");
  assert.equal(resumed, false);
  resolve();
  await resume;
  assert.equal(resumed, true);
});

test("a failed navigation flush is surfaced instead of silently resuming stale state", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => { reject = fail; });
  trackInterviewSave("subject-failed", pending);
  const resumed = waitForInterviewSave("subject-failed");
  reject(new Error("Interview revision conflict"));
  await assert.rejects(resumed, /revision conflict/);
});

test("unknown numbers do not require another question after the opportunity is clear", () => {
  const readiness = fallbackReadiness({}, [
    { question: "What problem?", answer: "Manual customer intake regularly delays service requests." },
    { question: "Who is affected?", answer: "Support staff and customers are affected by long waits." },
    { question: "What happens today?", answer: "Today requests are manually transferred by email between teams." },
    { question: "What is the impact?", answer: "Frequent delays cause missed customer expectations and rework." },
    { question: "What is the desired outcome?", answer: "We want fewer handoffs and faster customer responses." },
    { question: "How much money is lost?", answer: "I don't know" },
    { question: "What constraints exist?", answer: "Not sure yet" },
  ]);
  assert.ok(readiness.dimensions.find(d => d.key === "impact")?.status === "known");
  assert.ok(readiness.score >= 65);
  assert.equal(shouldContinueInterview(readiness, 7, "low"), false);
});

test("interview answer count follows retained user transcript across fallback planner reset and resume", () => {
  const transcript = [
    { role: "ai" as const, text: "What problem?" },
    { role: "user" as const, text: "Manual intake" },
    { role: "ai" as const, text: "Who is affected?" },
    { role: "user" as const, text: "Support" },
    { role: "ai" as const, text: "Standard interview will continue. How often?" },
    { role: "user" as const, text: "Regularly now" },
    { role: "user" as const, text: "(nothing to add)" },
  ];
  assert.equal(countTranscriptAnswers(transcript), 3);
  assert.equal(countTranscriptAnswers(JSON.parse(JSON.stringify(transcript))), 3);
  assert.equal(countTranscriptAnswers(transcript.slice(0, 4)), 2);
});

test("private draft client sends revision and source initiative to session-scoped endpoints", async () => {
  const original = globalThis.fetch;
  const requests: { url: string; method: string; body?: unknown; credentials?: string }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    requests.push({
      url: String(url), method: options?.method ?? "GET", credentials: options?.credentials,
      body: options?.body ? JSON.parse(String(options.body)) : undefined,
    });
    const state = { answers: { idea: "Customer onboarding" } };
    if (requests.length === 4) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(requests.length === 1 ? { draft: null }
      : { id: "owned-id", state, revision: requests.length - 1 }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    assert.deepEqual(await privateInterview.active(), { draft: null });
    const created = await privateInterview.create({ answers: { idea: "Customer onboarding" } });
    await privateInterview.save(created, { answers: { idea: "Customer onboarding" } });
    await privateInterview.complete(created.id, 73);
    assert.equal(requests.every(r => r.credentials === "include"), true);
    assert.deepEqual(requests.map(r => [r.method, r.url]), [
      ["GET", "/api/interview/drafts/active"],
      ["POST", "/api/interview/drafts"],
      ["PUT", "/api/interview/drafts/owned-id"],
      ["POST", "/api/interview/drafts/owned-id/complete"],
    ]);
    assert.deepEqual(requests[2].body, { state: { answers: { idea: "Customer onboarding" } }, revision: 1 });
    assert.deepEqual(requests[3].body, { initiativeId: 73 });
  } finally {
    globalThis.fetch = original;
  }
});

test("private draft rejects blocked content with only safe guidance", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    code: "CONTENT_BLOCKED", error: "synthetic-rejected-value",
    categories: ["PERSONAL_IDENTIFIER"],
  }), { status: 422, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    await assert.rejects(privateInterview.save({
      id: "owned-id", state: { input: "" }, revision: 1,
    }, { input: "synthetic-rejected-value" }), error => {
      assert.equal(isContentBlocked(error), true);
      assert.match(safeErrorMessage(error, "Unavailable"), /Possible personal identifier detected/);
      assert.ok(!safeErrorMessage(error, "Unavailable").includes("synthetic-rejected-value"));
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("blocked legacy draft can be discarded by authenticated owner without reading raw draft", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; method: string; credentials?: RequestCredentials; body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), method: options?.method ?? "GET",
      credentials: options?.credentials, body: options?.body });
    if (options?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ code: "CONTENT_BLOCKED",
      error: "synthetic-private-draft-value", categories: ["PERSONAL_IDENTIFIER"] }), { status: 422 });
  }) as typeof fetch;
  try {
    await assert.rejects(privateInterview.active(), isContentBlocked);
    await privateInterview.discardActive();
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
      ["GET", "/api/interview/drafts/active"], ["DELETE", "/api/interview/drafts/active"],
    ]);
    assert.equal(calls.every(call => call.credentials === "include" && call.body === undefined), true);
  } finally {
    globalThis.fetch = original;
  }
});