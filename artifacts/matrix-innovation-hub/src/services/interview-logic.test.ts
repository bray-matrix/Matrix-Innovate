import test from "node:test";
import assert from "node:assert/strict";
import { interviewEngine, mapConversationToFallback, nextFallbackQuestion } from "./interviewEngine";
import {
  answersForReview, buildDraft, computeScore, countTranscriptAnswers, discardActiveInterviewDraft,
  INTERVIEW_DRAFT_KEY, toTitle, validateInitiativeDraft,
  type InitiativeDraftFields,
} from "./aiInterviewService";

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

test("Start Over discards only the active interview including Jira and transcript; saved Initiatives remain", () => {
  const values = new Map([
    [INTERVIEW_DRAFT_KEY, JSON.stringify({ jira: { jiraIssueId: "123" }, answers: { idea: "Draft" }, messages: [{ role: "user", text: "Draft" }] })],
    ["saved-initiatives", JSON.stringify([{ id: 7, title: "Previously saved" }])],
  ]);
  discardActiveInterviewDraft({ removeItem: key => { values.delete(key); } });
  assert.equal(values.has(INTERVIEW_DRAFT_KEY), false);
  assert.deepEqual(JSON.parse(values.get("saved-initiatives")!), [{ id: 7, title: "Previously saved" }]);
  assert.equal(interviewEngine.planQuestions({})[0].id, "idea");
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