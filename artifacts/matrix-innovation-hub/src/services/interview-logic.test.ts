import test from "node:test";
import assert from "node:assert/strict";
import { interviewEngine } from "./interviewEngine";
import {
  buildDraft, computeScore, toTitle, validateInitiativeDraft,
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