import test from "node:test";
import assert from "node:assert/strict";
import { PlatformServiceError } from "@workspace/matrix-sdk";
import interviewRouter, {
  advanceInterview, generateInterviewDraft, fallbackInterview, buildInterviewMessages, inputSchema,
  INTERVIEW_TURN_TOKENS, FINAL_DRAFT_TOKENS, safePlatformErrorMetadata,
} from "./src/routes/interview-ai";
import {
  calculateInterviewReadiness, canDraft, missingCriticalContext, shouldContinueInterview,
} from "./src/lib/interview-readiness";

type Input = Parameters<typeof advanceInterview>[0];
const make = (answers: string[], questions?: string[]): Input => ({
  turns: answers.map((answer, i) => ({ question: questions?.[i] ?? "Describe the idea.", answer })),
  jira: null,
});
const compact = (input: Input, question = "Who is affected by this issue?") => ({
  knownFacts: [{ category: "problem", value: input.turns[0].answer, evidence: input.turns[0].answer, source: "user" }],
  inferredSuggestions: [], unknowns: [], nextQuestion: question, readyToDraft: false,
  nextQuestionValue: "high", missingCriticalContext: ["Who is Affected"],
  suggestedTitle: "", suggestedInitiativeType: "",
});
const draft = (input: Input) => ({
  knownFacts: compact(input).knownFacts, inferredSuggestions: ["Consider a more reliable process"],
  unknowns: ["Exact cost is unknown"], suggestedTitle: "Improve request routing",
  suggestedInitiativeType: "Operations", draft: {
    problemStatement: input.turns[0].answer, currentProcess: "", desiredOutcome: "",
    expectedValue: "Value not yet quantified", successMetric: "", risks: "",
  },
});
const success = (data: unknown) => async () => ({ data });

test("quality beats populated fields: generic answers do not inflate readiness", () => {
  const vague = calculateInterviewReadiness(make(["Something needs improvement", "I don't know", "skip"],
    ["Describe the idea.", "What business impact?", "What is the priority?"]));
  const rich = calculateInterviewReadiness(make([
    "Our account managers struggle to track requests sent by clients in email.",
    "Today operations forwards requests through email and spreadsheets and ownership is unclear.",
    "Errors delay clients constantly and waste time; we want a shared view that reduces handoff delays.",
    "Security compliance is important, but exact volume is unknown.",
  ]));
  assert.ok(vague.score < 65, `vague scored ${vague.score}`);
  assert.ok(rich.score >= 65, `rich scored ${rich.score}`);
  assert.ok(canDraft(rich));
  assert.equal(rich.label === "Enough to Draft" || rich.label === "Strong Business Context", true);
  assert.equal(rich.dimensions.reduce((n, d) => n + d.weight, 0), 100);
});

test("seven weak dimension replies cannot score as known; strong single answer spans dimensions", () => {
  const questions = [
    "What is the problem?", "Who is affected?", "What is the current process?",
    "What is the impact?", "What outcome do you want?", "Why now?", "What constraints exist?",
  ];
  const weak = calculateInterviewReadiness(make(Array(7).fill("It should be better."), questions));
  assert.ok(weak.score < 40, `weak replies scored ${weak.score}`);
  assert.equal(canDraft(weak), false);
  assert.ok(weak.dimensions.every(d => d.status !== "known"));
  const strong = calculateInterviewReadiness(make([
    "Operations staff and clients struggle because today's manual email and spreadsheet handoffs delay requests constantly. We want shared ownership to reduce missed work. Security compliance is an urgent priority.",
  ]));
  assert.ok(strong.score > weak.score + 40, `${strong.score} vs ${weak.score}`);
  assert.ok(strong.dimensions.filter(d => d.status === "known").length >= 4);
  const almost = calculateInterviewReadiness(make([
    "Operations staff and clients struggle because today's manual email handoffs delay requests constantly. Security compliance is an urgent priority.",
    "It should be better.",
  ], ["Describe the issue.", "What desired outcome would help?"]));
  assert.equal(canDraft(almost), false, "a vague outcome cannot unlock early draft even if other dimensions score well");
  const forged = calculateInterviewReadiness({ ...make(["It should be better."]), knownFacts: [
    { category: "problem", value: "Saves millions yearly", evidence: "Saves millions yearly", source: "user" },
    { category: "outcome", value: "It should be better.", evidence: "It should be better.", source: "user" },
  ] });
  assert.ok(forged.score < 40);
});

test("a rejected redundant question picks a missing critical business dimension rather than auto-finishing vague intake", async () => {
  const input = make(["It should be better."], ["What is the problem?"]);
  const result = await advanceInterview(input, success({ ...compact(input),
    knownFacts: [], nextQuestion: "What is the problem?" }));
  assert.equal(result.interviewComplete, false);
  assert.notEqual(result.nextQuestion, "What is the problem?");
  assert.ok(result.missingCriticalContext.length > 0);
});

test("software inventory replay gains business context and converges without implementation design", () => {
  const answers = [
    "We do not have a reliable inventory of applications used across the company.",
    "Employees and application owners across Operations and IT are affected; today teams keep separate spreadsheets.",
    "Requests for access and ownership updates happen constantly, and manual tracking causes delays and compliance risk.",
    "We want a shared view of applications and ownership so staff can find the right owner and reduce missed reviews.",
    "Security compliance is a priority now, but we don't know exact counts yet.",
    "Existing information lives in Jira and spreadsheets; owners should review the business information.",
  ];
  const scores = answers.map((_, i) => calculateInterviewReadiness(make(answers.slice(0, i + 1))).score);
  assert.ok(scores[0] < scores[3]);
  assert.ok(scores[3] >= 65, `readiness by answer: ${scores}`);
  assert.equal(canDraft(calculateInterviewReadiness(make(answers))), true);
  assert.equal(shouldContinueInterview(calculateInterviewReadiness(make(answers)), 6, "low"), false);
});

test("unknown is distinct from missing and does not trigger repeated questioning", () => {
  const input = make(["Manual handoffs delay customers; we want to reduce those delays.", "I don't know the exact volume"],
    ["Describe the idea.", "How many requests arrive?"]);
  const readiness = calculateInterviewReadiness({ ...input, unknowns: ["Volume unknown"] });
  assert.ok(readiness.dimensions.some(d => d.status === "unknown"));
  assert.ok(!missingCriticalContext(readiness).includes("Importance / Urgency"));
  assert.equal(shouldContinueInterview(readiness, 12, "high"), false);
});

test("compact output contains deltas only, no draft, validated provenance, bounded collections", async () => {
  const input = make(["Manual handoffs delay customer responses."]);
  input.knownFacts = [{ category: "problem", value: "Manual handoffs", evidence: "Manual handoffs", source: "user" }];
  const result = await advanceInterview(input, async request => {
    assert.equal(request.feature, "guided-interview-v2");
    assert.equal(request.maxOutputTokens, INTERVIEW_TURN_TOKENS);
    assert.ok(!Object.hasOwn(request.schema.properties!, "draft"));
    assert.ok(request.instruction.includes("Twelve answers is the ABSOLUTE ceiling"));
    return { data: { ...compact(input), knownFacts: [
      input.knownFacts![0],
      { category: "impact", value: "Delay", evidence: "delay customer responses", source: "user" },
      { category: "impact", value: "Save $50 million", evidence: "Manual handoffs", source: "jira" },
    ], unknowns: Array(30).fill("Impact unknown"), inferredSuggestions: Array(20).fill("Potential improvement") } };
  });
  assert.equal("draft" in result, false);
  assert.deepEqual(result.knownFacts.map(f => f.value), ["delay customer responses"]);
  assert.equal(result.unknowns.length, 5);
  assert.equal(result.inferredSuggestions.length, 3);
  assert.ok(result.readiness.score >= 0 && result.readiness.score <= 100);
});

test("strong idea converges, redundant/solution-design questions are suppressed", async () => {
  const input = make(["Operations manually tracks client requests by email, causing delays and errors. Customers and staff are affected constantly. We want faster routing and clearer ownership; compliance risk matters now."]);
  const result = await advanceInterview(input, success({ ...compact(input, "Which database tables and APIs should we build?"),
    nextQuestionValue: "low", readyToDraft: true }));
  assert.equal(result.interviewComplete, true);
  assert.equal(result.nextQuestion, "");
  assert.equal(result.readyToDraft, true);
  const low = await advanceInterview(make(["Our staff struggle with manual routing."]), success({
    ...compact(make(["Our staff struggle with manual routing."]), "What exact API should implement this?"),
  }));
  assert.doesNotMatch(low.nextQuestion, /\bapi\b/i);
  assert.match(low.nextQuestion, /handled today/i, "reject design and ask a missing business gap instead");
});

test("vague context asks one high-value question, AI failure uses deterministic readiness", async () => {
  const input = make(["Need better results."]);
  const normal = await advanceInterview(input, success({ ...compact(input), knownFacts: [] }));
  assert.equal(normal.interviewComplete, false);
  assert.ok(normal.nextQuestion.length > 0);
  const failure = await advanceInterview(input, async () => { throw new PlatformServiceError("unavailable", 503, "valid-id"); });
  assert.ok(failure.nextQuestion.length > 0);
  assert.equal(failure.interviewComplete, false);
  assert.deepEqual(failure.readiness, fallbackInterview(input).readiness);
});

test("ceiling stops before inference even on AI failure and cannot ask question 13", async () => {
  const input = make(Array(12).fill("Not sure yet"));
  let calls = 0;
  const result = await advanceInterview(input, async () => { calls++; throw new Error("unavailable"); });
  assert.equal(calls, 0);
  assert.equal(result.interviewComplete, true);
  assert.equal(result.nextQuestion, "");
  assert.equal(result.readyToDraft, true);
  assert.equal(inputSchema.safeParse({ ...input, turns: [...input.turns, input.turns[0]] }).success, false);
});

test("final draft is separate 2048-token operation and filters unsupported claims", async () => {
  const input = make(["Manual requests delay customers."]);
  const result = await generateInterviewDraft(input, async request => {
    assert.equal(request.feature, "guided-interview-draft");
    assert.equal(request.maxOutputTokens, FINAL_DRAFT_TOKENS);
    assert.ok(Object.hasOwn(request.schema.properties!, "draft"));
    return { data: { ...draft(input), draft: {
      ...draft(input).draft, expectedValue: "Saves $5 million yearly", risks: "Requires 20% more staff" } } };
  });
  assert.equal(result.draft.problemStatement, input.turns[0].answer);
  assert.equal(result.draft.expectedValue, "Value not yet quantified");
  assert.equal(result.draft.risks, "");
  assert.equal(result.knownFacts[0].source, "user");
  assert.equal(typeof result.readiness.score, "number");
});

test("final AI-drafted prose cannot assert invented dates, headcounts, metrics or qualitative risks", async () => {
  const input = make(["Manual email requests delay customer responses."]);
  const invented = await generateInterviewDraft(input, success({ ...draft(input), draft: {
    problemStatement: "Manual email requests delay customer responses by next Friday.",
    currentProcess: "Twenty new hires will manually route requests.",
    desiredOutcome: "Complete migration in July.",
    expectedValue: "Add 15 staff and save 40 hours.",
    successMetric: "95% of requests resolved within 2 days",
    risks: "The service may expose private customer records.",
  } }));
  assert.equal(invented.draft.problemStatement, "");
  assert.equal(invented.draft.currentProcess, "");
  assert.equal(invented.draft.desiredOutcome, "");
  assert.equal(invented.draft.expectedValue, "Value not yet quantified");
  assert.equal(invented.draft.successMetric, "");
  assert.equal(invented.draft.risks, "");
  assert.ok(invented.unknowns.includes("Success metric not established"));
  assert.ok(invented.unknowns.includes("Risks need confirmation"));
  const qualitative = await generateInterviewDraft(input, success({ ...draft(input), draft: {
    ...draft(input).draft,
    problemStatement: "Manual email requests delay customer responses and create a privacy breach.",
    risks: "Security compliance risk is important",
  } }));
  assert.equal(qualitative.draft.problemStatement, "");
  assert.equal(qualitative.draft.risks, "");
  const supported = make(["Manual email requests delay customer responses. We measure resolution time weekly. Security compliance risk is important."]);
  const grounded = await generateInterviewDraft(supported, success({ ...draft(supported), draft: {
    ...draft(supported).draft,
    successMetric: "We measure resolution time weekly",
    risks: "Security compliance risk is important",
  } }));
  assert.equal(grounded.draft.successMetric, "We measure resolution time weekly");
  assert.equal(grounded.draft.risks, "Security compliance risk is important");
});

test("final fallback is deterministic, preserves context and known facts", async () => {
  const input = make(["Manual email handoffs delay customers."]);
  input.knownFacts = [{ category: "problem", value: input.turns[0].answer,
    evidence: input.turns[0].answer, source: "user" }];
  const result = await generateInterviewDraft(input, async () => { throw new PlatformServiceError("unavailable"); });
  assert.equal(result.draft.problemStatement, input.turns[0].answer);
  assert.deepEqual(result.knownFacts, input.knownFacts);
});

test("incoming facts cannot introduce another user's Jira context or unsupported claims", async () => {
  const input = make(["Manual routing causes delays."]);
  input.knownFacts = [
    { category: "impact", value: "$5m savings", evidence: "$5m savings", source: "user" },
    { category: "problem", value: "Private Jira", evidence: "Private Jira", source: "jira" },
  ];
  const messages = buildInterviewMessages(input)!;
  assert.equal(messages.length, 1);
  const result = await generateInterviewDraft(input, success(draft(input)));
  assert.equal(result.knownFacts.length, 1);
  assert.equal(result.knownFacts[0].evidence, input.turns[0].answer);
});

test("long transcript retained verbatim; oversized context explicitly rejected", () => {
  const input = make(Array.from({ length: 12 }, (_, i) => `${i}`.repeat(900)));
  const messages = buildInterviewMessages(input)!;
  assert.equal(messages.length, 12);
  input.turns.forEach((t, i) => assert.equal(JSON.parse(messages[i].content).answer, t.answer));
  const over = make(Array(12).fill("a".repeat(1000)));
  over.turns.forEach(t => { t.question = "q".repeat(600); });
  over.jira = { summary: "s".repeat(500), description: "d".repeat(4000) };
  assert.equal(buildInterviewMessages(over), null);
  assert.ok(INTERVIEW_TURN_TOKENS < FINAL_DRAFT_TOKENS && FINAL_DRAFT_TOKENS <= 2048);
});

test("retry malformed data once and report bounded correlation, no content", async () => {
  const input = make(["Need better request tracking."]);
  let calls = 0;
  const events: string[] = [];
  await advanceInterview(input, async () => {
    calls++;
    return { data: calls === 1 ? { unexpected: true } : compact(input) };
  }, (_n, category) => events.push(category));
  assert.equal(calls, 2);
  assert.match(events[0], /output_schema/);
  assert.deepEqual(safePlatformErrorMetadata(new PlatformServiceError("invalid_response", 503, "invalid\nid")),
    { code: "invalid_response", requestId: undefined, status: 503 });
});

test("routes expose advance and draft; reject malformed context before inference", async () => {
  const post = async (path: string, body: unknown) => {
    const route = (interviewRouter as any).stack.find((layer: any) => layer.route?.path === path);
    assert.ok(route, path);
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      let status = 200;
      const res = { status(n: number) { status = n; return this; },
        json(body: any) { resolve({ status, body }); return this; } };
      Promise.resolve(route.route.stack[0].handle({ body, log: { warn() {}, info() {} } }, res, reject)).catch(reject);
    });
  };
  assert.equal((await post("/interview/advance", { turns: [], jira: null })).status, 400);
  assert.equal((await post("/interview/draft", { turns: [], jira: null })).status, 400);
  const over = make(Array(12).fill("a".repeat(1000)));
  over.turns.forEach(t => { t.question = "q".repeat(600); });
  over.jira = { summary: "s".repeat(500), description: "d".repeat(4000) };
  assert.equal((await post("/interview/advance", over)).body.interviewComplete, true);
  assert.equal(typeof (await post("/interview/draft", over)).body.draft.problemStatement, "string");
});