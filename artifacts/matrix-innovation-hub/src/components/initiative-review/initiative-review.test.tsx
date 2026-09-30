import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDraft, computeScore, derivePriority } from "@/services/aiInterviewService";
import {
  prioritizeUnknowns, candidateMeasures, serializeForSave, initialNarrative,
  mergeReviewIntoDraft, buildReviewBrief, SAVE_LABELS, type ReviewAIResult,
} from "./review-model";

const LONG = "Applications are tracked across spreadsheets, email threads and team wikis. ".repeat(20);
function fixture() {
  const draft = buildDraft({
    idea: "Centralized Application Inventory and Ownership System",
    problem: LONG, success: "Every application has a named owner and validated purpose.",
  }, "", { category: "Operations", label: "Operations", suggestedInitiativeCategory: "Operations" });
  draft.fields.title = "Centralized Application Inventory and Ownership System";
  draft.executiveSummary = LONG;
  const ai: ReviewAIResult = {
    knownFacts: [{ category: "problem", value: "Ownership is unclear for many apps", evidence: "a1", source: "user" }],
    inferredSuggestions: ["Track percentage of applications with an identified owner", "Reduce applications by 40%", "Consider a CMDB integration"],
    unknowns: ["Who is the executive sponsor?", "Who is the executive sponsor", "What is the budget?; Which SSO provider is used?", "What is the cost savings?"],
  };
  return { draft, ai };
}

test("unknowns are deduped, concise and split into critical vs discovery", () => {
  const { critical, discovery } = prioritizeUnknowns(fixture().ai.unknowns);
  assert.equal(critical.filter(u => /sponsor/i.test(u)).length, 1);
  assert.ok(critical.length <= 4 && discovery.length <= 3);
  assert.ok(critical.some(u => /budget/i.test(u)));
});

test("candidate measures are suggestions without invented numbers", () => {
  const { draft, ai } = fixture();
  const m = candidateMeasures(draft, ai);
  assert.ok(m.some(x => /identified owner/.test(x)));
  assert.ok(m.every(x => !/\d/.test(x)));
});

test("all narrative edits persist through autosave draft and final save payload", () => {
  const { draft } = fixture();
  const n = { ...initialNarrative(draft), executiveSummary: "Edited summary", nextSteps: "Confirm sponsor", expectedValue: "Fewer orphaned apps", risks: "Data quality" };
  const merged = mergeReviewIntoDraft(draft, draft.fields, draft.scoring, n);
  assert.equal(merged.executiveSummary, "Edited summary");
  assert.equal(merged.canvas.recommendedNextStep, "Confirm sponsor");
  assert.deepEqual(initialNarrative(merged), n);
  const out = serializeForSave(draft.fields, n, { critical: ["Who is the sponsor?"] });
  const saved = out.fields;
  assert.equal(out.executiveSummary, "Edited summary");
  assert.ok(!saved.desiredOutcome.includes("Edited summary"), "summary not duplicated");
  for (const key of ["expectedValue", "risks", "nextSteps"] as const)
    assert.ok(saved.desiredOutcome.includes(`${SAVE_LABELS[key]}: ${n[key]}`));
  assert.ok(saved.desiredOutcome.includes("Critical unknowns:\n- Who is the sponsor?"));
  assert.ok(saved.desiredOutcome.startsWith(draft.fields.desiredOutcome.trim()));
});

test("semantic brief uses edited narrative and never invents quantified value", () => {
  const { draft, ai } = fixture();
  const n = { ...initialNarrative(draft), executiveSummary: "Edited" };
  const brief = buildReviewBrief({ draft, fields: draft.fields, scoring: draft.scoring, narrative: n, ai, score: 45, priority: "Low" });
  assert.equal(brief.executiveSummary.text, "Edited");
  assert.ok(brief.expectedValue.quantified.every(q => q.status === "unknown"));
});

test("review renders one document with auto-expanding narrative and hidden scoring controls", async () => {
  // Test runner may compile JSX with the classic runtime.
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const { draft, ai } = fixture();
  const html = renderToStaticMarkup(React.createElement(InitiativeReview, {
    draft, aiResult: ai, jira: null, submitterName: "Pat Rivera",
    departments: ["IT"], categories: ["Operations"], levels: ["Low", "Medium", "High"], saving: false,
    onBack: () => {}, onDraftChange: () => {}, onSave: () => {},
  }));
  assert.ok(html.includes("Export Word") && html.includes("Export PDF"));
  assert.ok(html.includes("Edit Assessment"));
  assert.ok(!html.includes("input-score-businessValue"), "scoring inputs hidden by default");
  assert.ok(!html.includes("Innovation Canvas") && !html.includes("What we heard") && !html.includes("Ideas to consider"));
  assert.ok(html.includes('id="review-title"') && html.includes('id="review-problemStatement"'));
  assert.ok(html.includes('id="review-executiveSummary"') && html.includes('id="review-nextSteps"'));
  const areas: string[] = html.match(/<textarea[^>]*>/g) ?? [];
  assert.ok(areas.length > 5 && areas.every(t => t.includes('data-autoexpand="true"') && t.includes("brief-edit")));
  assert.ok(html.includes("Not yet established"));
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

test("parity: every non-input text shown equals the exported semantic brief", async () => {
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const { draft, ai } = fixture();
  draft.review = { confirmedZeroFields: ["estimatedCostSavings"] };
  draft.fields.estimatedHoursSavedMonthly = 120;
  const generatedAt = "2026-01-15T12:00:00.000Z";
  const html = renderToStaticMarkup(React.createElement(InitiativeReview, {
    draft, aiResult: ai, jira: { jiraIssueKey: "INV-42", summary: "App inventory" }, submitterName: "Pat Rivera",
    departments: ["IT"], categories: ["Operations"], levels: ["Low", "Medium", "High"], saving: false,
    readiness: "83% \u2014 Strong Business Context", generatedAt,
    onBack: () => {}, onDraftChange: () => {}, onSave: () => {},
  }));
  const score = computeScore(draft.scoring);
  const brief = buildReviewBrief({ draft, fields: { ...draft.fields, submitterName: draft.fields.submitterName || "Pat Rivera" },
    scoring: draft.scoring, narrative: initialNarrative(draft), ai, jiraKey: "INV-42", score, priority: derivePriority(score),
    readiness: "83% \u2014 Strong Business Context", confirmedZeroFields: ["estimatedCostSavings"], generatedAt });
  const shown: string[] = [
    brief.metadata.status, brief.metadata.jiraKey, brief.assessment.readiness, String(brief.assessment.score),
    `${brief.assessment.priority} priority`,
    ...brief.assessment.factors.flatMap(f => [f.label, f.value]),
    ...brief.expectedValue.quantified.flatMap(q => [q.label, q.text]),
    ...brief.successMeasures.candidates.map(c => c.text),
    ...brief.unknowns.map(u => u.text),
    ...brief.supportingContext.facts.map(f => f.value),
    brief.executiveSummary.text, brief.businessNeed.problem.text, brief.expectedValue.qualitative.text,
    ...(brief.businessNeed.businessImpact ? [brief.businessNeed.businessImpact.text] : []),
  ];
  for (const t of shown) assert.ok(html.includes(esc(t)), `shown text missing: ${t}`);
  assert.ok(brief.expectedValue.quantified.some(q => q.label === "Cost savings" && q.status !== "unknown"), "explicit zero kept");
  assert.ok(brief.expectedValue.quantified.some(q => q.label === "Revenue opportunity" && q.status === "unknown"));
  // Facts shown are exactly the model facts (no separate dump).
  const factItems = html.split('data-testid="list-known-facts"')[1]?.split("</ul>")[0].match(/<li>/g)?.length ?? 0;
  assert.equal(factItems, brief.supportingContext.facts.length);
});

test("final save includes suggested measures labelled as suggestions", () => {
  const { draft } = fixture();
  const out = serializeForSave(draft.fields, initialNarrative(draft), { candidates: ["Share of apps with an owner"] });
  assert.ok(out.fields.desiredOutcome.includes(`${SAVE_LABELS.candidates}:\n- Share of apps with an owner`));
});

test("retrying a final save keeps the private draft unflattened and avoids repeated sections", () => {
  const { draft } = fixture();
  const narrative = { ...initialNarrative(draft), expectedValue: "Clear ownership", nextSteps: "Confirm sponsor" };
  const privateDraft = mergeReviewIntoDraft(draft, draft.fields, draft.scoring, narrative);
  const first = serializeForSave(privateDraft.fields, initialNarrative(privateDraft));
  const retry = serializeForSave(privateDraft.fields, initialNarrative(privateDraft));
  assert.equal(privateDraft.fields.desiredOutcome, draft.fields.desiredOutcome);
  assert.deepEqual(first, retry);
  assert.equal(retry.fields.desiredOutcome.split(SAVE_LABELS.nextSteps).length - 1, 1);
});
