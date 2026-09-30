import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { cleanBriefProse, synthesizeBriefNarrative, qualifyDraftBenefits } from "@workspace/initiative-brief";
import { buildDraft, computeScore, derivePriority } from "@/services/aiInterviewService";
import {
  prioritizeUnknowns, candidateMeasures, serializeForSave, initialNarrative,
  mergeReviewIntoDraft, buildReviewBrief, SAVE_LABELS, type ReviewAIResult,
  finalizeInterviewDraft,
} from "./review-model";

const LONG = "Applications are tracked across spreadsheets, email threads and team wikis. ".repeat(20);
const CAPTURE_PATH = new URL("../../../../../attached_assets/generated/application-inventory-neutral-validation-fresh.json", import.meta.url);
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

test("whole interview establishes qualitative value and risks outside named fields, without inventing quantities", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "Application information is fragmented and depends on institutional knowledge.";
  draft.fields.currentProcess = "Teams consult spreadsheets and colleagues.";
  draft.fields.desiredOutcome = "A reliable application inventory would begin with ownership and business purpose, administered by IT and validated by business owners.";
  draft.executiveSummary = `${draft.fields.title} addresses: ${draft.fields.problemStatement}.. Desired outcome: ${draft.fields.desiredOutcome}.`;
  draft.canvas.expectedValue = "Value not yet quantified.";
  draft.canvas.risks = "Risks not yet known.";
  const evidence = [
    "Time is wasted rediscovering information; troubleshooting and onboarding are slower, and renewals and changes are harder.",
    "Unclear ownership and dependencies create security and compliance exposure.",
    "Credential-management visibility is limited and knowledge is lost when people leave.",
  ].map(value => ({ value, source: "user" as const }));
  const n = synthesizeBriefNarrative({ draft, evidence });
  assert.match(n.expectedValue, /troubleshooting and onboarding/);
  assert.match(n.risks, /security and compliance exposure/);
  assert.match(n.risks, /knowledge is lost/);
  assert.doesNotMatch(n.executiveSummary, /addresses:|Desired outcome:|\.\./);
  assert.doesNotMatch(n.nextSteps, /scor|priority/i);
  const brief = buildReviewBrief({ draft, fields: draft.fields, scoring: draft.scoring, narrative: n, ai: null, score: 45, priority: "Low" });
  assert.equal(brief.assessment.score, 45);
  assert.equal(brief.assessment.priority, "Low");
  assert.ok(brief.expectedValue.quantified.every(q => q.status === "unknown"));
  assert.notEqual(brief.expectedValue.qualitative.text, "Not yet established");
});

test("unrelated warehouse scenario uses its own evidence and retains natural Platform prose", () => {
  const { draft } = fixture();
  draft.fields.title = "Improve warehouse picking";
  draft.fields.problemStatement = "Pickers repeatedly walk back to collect missed items.";
  draft.fields.currentProcess = "Pick lists are printed in order-entry sequence.";
  draft.fields.desiredOutcome = "Group picks by location to reduce unnecessary walking.";
  draft.canvas.expectedValue = "Value not yet quantified.";
  draft.canvas.risks = "";
  draft.executiveSummary = "";
  const summary = "Repeated trips for missed items delay dispatch. Grouping picks by location would reduce unnecessary walking and make orders easier to complete.";
  const n = synthesizeBriefNarrative({ draft, aiResult: {
    draft: { executiveSummary: summary, expectedValue: "Less unnecessary walking would help pickers complete orders with fewer interruptions." },
    knownFacts: [{ category: "risk", value: "Missed items delay dispatch.", source: "user" }],
  }, evidence: [{ value: "Missed items delay dispatch.", source: "user" }] });
  assert.equal(n.executiveSummary, summary);
  assert.match(n.expectedValue, /pickers/);
  assert.equal(n.risks, "Missed items delay dispatch.");
  assert.doesNotMatch(JSON.stringify(n), /application|inventory|credential|compliance/i);
});

test("editorial cleanup removes duplicate sentences and punctuation without changing decimals or facts", () => {
  assert.equal(cleanBriefProse("Savings are 12.5 hours.. Savings are 12.5 hours.  Owner is unknown!!"),
    "Savings are 12.5 hours. Owner is unknown!");
});

test("baseline notes remain evidence, not question text in document fields; reviewed prose stays authoritative", () => {
  const { draft } = fixture();
  const baseline = buildDraft({
    idea: "Improve request handling",
    problem: "Requests are scattered across mailboxes.",
    success: "A shared queue would clarify responsibility.",
    notes: "What would improve if this Initiative succeeds?: Teams could find the responsible owner.",
  }, "", { category: "Operations", label: "Operations", suggestedInitiativeCategory: "Operations" });
  assert.match(baseline.fields.desiredOutcome, /A shared queue would clarify responsibility/);
  assert.match(baseline.fields.desiredOutcome, /Teams could find the responsible owner/);
  assert.doesNotMatch(baseline.fields.desiredOutcome, /What would improve if this Initiative succeeds/);
  const completed = finalizeInterviewDraft(baseline, null, { knownFacts: [], inferredSuggestions: [], unknowns: [] }, [
    { value: "Teams could find the responsible owner.", source: "user" },
  ]);
  assert.doesNotMatch(JSON.stringify(completed.canvas), /What would improve if this Initiative succeeds|Additional notes:/);
  const final = {
    knownFacts: [], inferredSuggestions: [], unknowns: [],
    draft: { problemStatement: "", currentProcess: "",
      desiredOutcome: "The shared queue would clarify responsibility.", expectedValue: "",
      successMetric: "", risks: "", executiveSummary: "" },
  };
  const withFinal = finalizeInterviewDraft(baseline, final, final, [
    { value: "Teams could find the responsible owner.", source: "user" },
  ]);
  const brief = buildReviewBrief({ draft: withFinal, fields: withFinal.fields, scoring: withFinal.scoring,
    narrative: initialNarrative(withFinal, final), ai: final, score: 45, priority: "Low" });
  assert.match(brief.futureState.outcome.text, /Teams could find the responsible owner/);
  const edited = mergeReviewIntoDraft(draft, draft.fields, draft.scoring, {
    executiveSummary: "Question: this is an intentional reviewer quotation.",
    expectedValue: "", risks: "", nextSteps: "",
  });
  assert.equal(initialNarrative(edited).executiveSummary, "Question: this is an intentional reviewer quotation.");
});

test("completed labeled outcome keeps unique answer alongside sourced scope", () => {
  const { draft } = fixture();
  const completed = {
    knownFacts: [{ category: "scope", value: "Teams would validate the shared queue.",
      source: "user" as const, evidence: "Teams would validate the shared queue." }],
    inferredSuggestions: [], unknowns: [],
    draft: {
      problemStatement: "", currentProcess: "",
      desiredOutcome: "Additional notes: What would improve if this Initiative succeeds?: The queue would expose who handles escalations.",
      expectedValue: "", successMetric: "", risks: "", executiveSummary: "",
    },
  };
  const merged = finalizeInterviewDraft(draft, completed, completed, [
    { value: "The queue would expose who handles escalations.", source: "user" },
  ]);
  const brief = buildReviewBrief({ draft: merged, fields: merged.fields, scoring: merged.scoring,
    narrative: initialNarrative(merged, completed), ai: completed, score: 45, priority: "Low" });
  assert.match(brief.futureState.outcome.text, /queue would expose who handles escalations/);
  assert.match(brief.futureState.outcome.text, /Teams would validate the shared queue/);
  assert.doesNotMatch(brief.futureState.outcome.text, /Additional notes|What would improve if this Initiative succeeds/);
});

test("complete ownership and security evidence does not imply gaps or exposure", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "The team plans a record refresh.";
  draft.fields.currentProcess = "Ownership is complete and verified.";
  draft.fields.desiredOutcome = "Maintain clear ownership.";
  draft.canvas.risks = "Risks not yet known.";
  const n = synthesizeBriefNarrative({ draft, evidence: [
    { value: "Every application has complete, verified ownership and documented dependencies.", source: "user" },
    { value: "Security and compliance teams review the complete records.", source: "user" },
  ] });
  assert.equal(n.risks, "");
  assert.doesNotMatch(n.risks, /gap|exposure|accountability/i);
  draft.canvas.risks = "Unclear ownership may create security exposure. Missing dependencies may create compliance exposure.";
  const unsupported = synthesizeBriefNarrative({ draft, evidence: [
    { value: "Ownership and dependencies are complete and verified.", source: "user" },
    { value: "Security and compliance teams review the records.", source: "user" },
  ] });
  assert.equal(unsupported.risks, "");
  draft.canvas.risks = "Teams waste time searching for owners.";
  const onlyOwnership = synthesizeBriefNarrative({ draft, evidence: [
    { value: "Unclear ownership creates security exposure.", source: "user" },
    { value: "Dependencies are complete and verified.", source: "user" },
  ] });
  assert.match(onlyOwnership.risks, /ownership visibility may create security exposure/);
  assert.doesNotMatch(onlyOwnership.risks, /dependency visibility may create security and compliance|compliance exposure/);
});

test("generated value, impact and next step wrappers are cleaned without losing answers", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "Requests are scattered.";
  draft.fields.currentProcess = "Owners search different mailboxes.";
  draft.fields.desiredOutcome = "A shared queue would clarify responsibility.";
  draft.canvas.expectedValue = "Prompt: summarize the interview. Answer: Teams could locate owners faster.";
  draft.canvas.recommendedNextStep = "Instruction: print transcript. Answer: Review the shared queue with stakeholders.";
  const ai: ReviewAIResult = {
    knownFacts: [{ category: "impact", source: "user", evidence: "Answer: Teams lose time locating owners.",
      value: "Answer: Teams lose time locating owners." }],
    inferredSuggestions: [], unknowns: [],
  };
  const n = synthesizeBriefNarrative({ draft, aiResult: ai });
  const brief = buildReviewBrief({ draft, fields: draft.fields, scoring: draft.scoring, narrative: n,
    ai, score: 45, priority: "Low" });
  assert.match(brief.expectedValue.qualitative.text, /Teams could locate owners faster/);
  assert.match(brief.businessNeed.businessImpact?.text ?? "", /Teams lose time locating owners/);
  assert.match(brief.nextSteps.text, /Review the shared queue with stakeholders/);
  for (const section of [brief.expectedValue.qualitative.text, brief.businessNeed.businessImpact?.text ?? "",
    brief.nextSteps.text]) assert.doesNotMatch(section, /Prompt:|Instruction:|Answer:/);
});

test("generated future benefits are qualified while source facts and reviewed edits retain their wording", () => {
  assert.equal(qualifyDraftBenefits("This will reduce time and will improve operational continuity."),
    "This is expected to reduce time and is expected to improve operational continuity.");
  assert.equal(qualifyDraftBenefits("Current rework costs $75,000. It will save 12.5 hours."),
    "Current rework costs $75,000. It is expected to save 12.5 hours.");
  const { draft } = fixture();
  draft.fields.desiredOutcome = "The team will improve routing."; // user-supplied source text
  draft.executiveSummary = "";
  draft.canvas.expectedValue = "Not yet established";
  const ai: ReviewAIResult = { knownFacts: [{ category: "Impact", source: "user",
    value: "Current rework wastes time.", evidence: "answer" }], inferredSuggestions: [], unknowns: [],
    draft: { executiveSummary: "The design will reduce time and will improve continuity.",
      expectedValue: "The design will improve continuity." } };
  const n = synthesizeBriefNarrative({ draft, aiResult: ai });
  assert.match(n.executiveSummary, /is expected to reduce time.*is expected to improve continuity/);
  assert.match(n.expectedValue, /is expected to improve continuity/);
  assert.equal(draft.fields.desiredOutcome, "The team will improve routing.");
  const reviewed = mergeReviewIntoDraft(draft, draft.fields, draft.scoring,
    { ...n, expectedValue: "Our signed pilot will improve service." });
  assert.equal(initialNarrative(reviewed, ai).expectedValue, "Our signed pilot will improve service.");
  const completed = finalizeInterviewDraft(draft, { ...ai, draft: {
    problemStatement: "Current rework wastes time.", currentProcess: "Today there is rework.",
    desiredOutcome: "This will reduce time.", successMetric: "It will improve completion time.",
    expectedValue: "This will improve continuity.", risks: "Ownership needs validation.",
    executiveSummary: "The proposal will reduce time.",
  } }, ai, []);
  assert.match(completed.fields.desiredOutcome, /is expected to reduce time/);
  assert.match(completed.fields.successMetric, /is expected to improve completion time/);
  assert.match(completed.canvas.expectedValue, /is expected to improve continuity/);
  assert.match(completed.executiveSummary, /is expected to reduce time/);
  assert.equal(completed.fields.problemStatement, "Current rework wastes time.");
});

test("captured synthetic final completion is replayed through baseline and review before export", async () => {
  const capture = JSON.parse(await readFile(CAPTURE_PATH, "utf8"));
  const evidence = capture.input.turns.map((turn: { answer: string }) => ({ value: turn.answer, source: "user" as const }));
  const completed = finalizeInterviewDraft(capture.baseline, capture.final, capture.final, evidence);
  const narrative = initialNarrative(completed, capture.final);
  const brief = buildReviewBrief({
    draft: completed, fields: completed.fields, scoring: completed.scoring,
    narrative, ai: capture.final, score: completed.score, priority: completed.priority,
    generatedAt: capture.brief.metadata.generatedAt,
  });
  assert.doesNotMatch(brief.executiveSummary.text, /\bwill (?:reduce|improve|accelerate)\b/i);
  assert.doesNotMatch(brief.expectedValue.qualitative.text, /\bwill (?:reduce|improve|accelerate)\b/i);
  assert.match(brief.expectedValue.qualitative.text, /is expected to improve operational continuity/);
  assert.equal(brief.businessNeed.problem.text, completed.fields.problemStatement);
  assert.ok(brief.futureState.outcome.text.includes("A reliable system of record for applications") &&
    brief.futureState.outcome.text.includes("Phase 1 should start with application ownership"),
    "fallback retains the source-backed outcome meaning alongside sourced scope");
  assert.ok(brief.supportingContext.facts.length > 0);
  if (process.env["WRITE_REPRESENTATIVE_BRIEF_SAMPLE"] === "1")
    await writeFile("/tmp/innovation-representative-part-a-brief.json", JSON.stringify(brief));
});

test("raw interview and impact-only completion pass the actual baseline, merge and review quality gate", async () => {
  const capture = JSON.parse(await readFile(CAPTURE_PATH, "utf8"));
  const turns = capture.input.turns as { question: string; answer: string }[];
  const answers = {
    idea: "Centralized Application Inventory", problem: turns[0].answer,
    loss: turns[1].answer, success: turns[2].answer,
    notes: `What would improve if this Initiative succeeds?: ${turns[2].answer} ${turns[3].answer}`,
  };
  const baseline = buildDraft(answers, "", {
    category: "Operations", label: "Operations", suggestedInitiativeCategory: "Internal Productivity",
  });
  baseline.fields.title = "Centralized Application Inventory";
  // The richer raw answers produce 10/10 rather than the prior reconstruction's
  // 8/7 alignment/confidence. Replay the original representative input components,
  // not an overwritten score; Review always recalculates from these components.
  assert.equal(capture.baseline.scoring.strategicAlignment, 8);
  assert.equal(capture.baseline.scoring.prototypeConfidence, 7);
  baseline.scoring = { ...capture.baseline.scoring };
  baseline.score = computeScore(baseline.scoring);
  baseline.priority = derivePriority(baseline.score);
  assert.equal(baseline.score, 45);
  const readiness = {
    ...capture.final.readiness, score: 83,
    dimensions: capture.final.readiness.dimensions.map((dimension: {
      key: string; points: number; status: string;
    }) => dimension.key === "constraints" ? { ...dimension, status: "partial", points: 5 } : dimension),
  };
  assert.equal(readiness.dimensions.reduce((sum: number, dimension: { points: number }) => sum + dimension.points, 0), 83);
  const readinessText = `${readiness.score}% — ${readiness.label}`;
  const final = structuredClone(capture.final);
  final.suggestedTitle = "Centralized Application Inventory";
  final.draft.desiredOutcome = "";
  final.draft.executiveSummary = `Additional notes: What would improve if this Initiative succeeds?: ${turns[2].answer}`;
  final.draft.risks = "IT and business teams waste time during troubleshooting, onboarding, renewals and changes, and this creates security and compliance risk when ownership or dependencies are unclear.";
  const evidence = turns.map(t => ({ value: t.answer, source: "user" as const }));
  const completed = finalizeInterviewDraft(baseline, final, final, evidence);
  const narrative = initialNarrative(completed, final);
  const liveScore = computeScore(completed.scoring);
  const livePriority = derivePriority(liveScore);
  assert.equal(liveScore, 45);
  const brief = buildReviewBrief({
    draft: completed, fields: completed.fields, scoring: completed.scoring, narrative, ai: final,
    score: liveScore, priority: livePriority, readiness: readinessText,
    generatedAt: "2026-01-15T12:00:00.000Z",
  });
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const html = renderToStaticMarkup(React.createElement(InitiativeReview, {
    draft: completed, aiResult: final, jira: null, submitterName: "Reviewer",
    departments: ["IT"], categories: ["Internal Productivity"], levels: ["Low", "Medium", "High"],
    saving: false, readiness: readinessText,
    onBack: () => {}, onDraftChange: () => {}, onSave: () => {},
  }));
  assert.match(html, /data-testid="text-live-score">45<\/span>/);
  assert.match(html, /data-testid="text-brief-readiness">83% — Strong Business Context<\/dd>/);
  for (const section of [brief.executiveSummary.text, brief.futureState.outcome.text, brief.risks.text]) {
    assert.doesNotMatch(section, /Additional notes:|What would improve if this Initiative succeeds\?|Question:|Answer:/i);
  }
  assert.match(brief.futureState.outcome.text, /ownership|business purpose/i);
  assert.doesNotMatch(brief.businessNeed.problem.text, /waste time rediscovering|operational continuity risk/i);
  assert.doesNotMatch(brief.businessNeed.currentState.text, /must rediscover information for each/i);
  assert.match(brief.businessNeed.businessImpact?.text ?? "", /waste time rediscovering/);
  assert.match(brief.risks.text, /continuity risk/);
  for (const signal of [/institutional knowledge/i, /accountability/i, /dependency visibility/i,
    /security and compliance/i, /credential-management/i]) assert.match(brief.risks.text, signal);
  assert.doesNotMatch(brief.risks.text, /waste time during troubleshooting/i);
  assert.notEqual(brief.risks.text, turns[1].answer);
  assert.equal(brief.metadata.title, "Centralized Application Inventory");
  assert.equal(brief.assessment.score, 45);
  assert.equal(brief.assessment.readiness, readinessText);
  assert.ok(brief.expectedValue.quantified.every(q => q.status === "unknown"));
  if (process.env["WRITE_V167_REPLAY"] === "1")
    await writeFile("/tmp/innovation-v167-corrected-state.json", JSON.stringify({
      reconstructed: true, liveAiCalls: 0, title: brief.metadata.title,
      declaredScore: liveScore, declaredReadiness: readinessText,
      rawSource: { turns, answers }, baseline, final, narrative, brief,
      state: {
        phase: "review", jira: null, answers: {}, plan: [{
          id: "idea", prompt: "What business problem should this idea address?", hint: "", placeholder: "",
        }], currentIndex: 0, input: "", messages: [], fallback: false,
        aiResult: { ...final, readiness, readyToDraft: true, nextQuestion: "",
          nextQuestionValue: "low", missingCriticalContext: final.unknowns },
        readyToReview: true, draft: completed, finalResult: final,
      },
    }, null, 2));
});

test("unquantified amounts in the same answer do not erase established qualitative impacts", () => {
  const { draft } = fixture();
  draft.canvas.expectedValue = "Value not yet quantified.";
  const n = synthesizeBriefNarrative({ draft, evidence: [{
    value: "Repeated rework wastes time, but the hours are not yet quantified.", source: "user",
  }] });
  assert.match(n.expectedValue, /Repeated rework wastes time/);
});

test("completion merge restores source-backed future state when final grounding leaves outcome blank", () => {
  const { draft } = fixture();
  draft.fields.desiredOutcome = "Baseline future state";
  draft.fields.successMetric = "Baseline aspiration, not an agreed measure";
  const completed = {
    suggestedTitle: "Reliable system of record", inferredSuggestions: [], unknowns: [],
    knownFacts: [
      { category: "scope", value: "Start with ownership and business purpose. IT administers and business owners validate.", evidence: "", source: "user" as const },
      { category: "desiredOutcome", value: "A reliable system of record would clarify accountability.", evidence: "", source: "user" as const },
    ],
    draft: { problemStatement: "Fragmented information delays work.", currentProcess: "", desiredOutcome: "",
      expectedValue: "Less rediscovery.", successMetric: "", risks: "", executiveSummary: "A shared record would clarify accountability." },
  };
  const result = finalizeInterviewDraft(draft, completed, completed, []);
  assert.match(result.fields.desiredOutcome, /IT administers/);
  assert.match(result.fields.desiredOutcome, /reliable system of record/);
  assert.equal(result.fields.successMetric, "");
  assert.equal(draft.fields.desiredOutcome, "Baseline future state", "baseline not mutated");
  const withoutFacts = { ...completed, knownFacts: [] };
  assert.equal(finalizeInterviewDraft(draft, withoutFacts, withoutFacts, []).fields.desiredOutcome, "Baseline future state");
});

test("risk containment deduplication retains supplied prose and leaves room for distinct credential evidence", () => {
  const { draft } = fixture();
  draft.canvas.risks = "Unclear application ownership and dependencies create security and compliance exposure. Dependence on institutional knowledge creates a risk of knowledge loss when people leave.";
  const n = synthesizeBriefNarrative({ draft, evidence: [
    "Ownership and dependencies are unclear.",
    "Unclear application ownership and dependencies create security and compliance exposure.",
    "We depend on institutional knowledge and lose knowledge when people leave.",
    "Later it could extend to integrations, dependencies, licensing, cost and credential-management visibility.",
    "Credential-management visibility is limited.",
  ].map(value => ({ value, source: "user" as const })) });
  assert.match(n.risks, /Credential-management visibility is limited/);
  assert.doesNotMatch(n.risks, /Ownership and dependencies are unclear/);
  assert.doesNotMatch(n.risks, /We depend on institutional knowledge/);
  assert.doesNotMatch(n.risks, /Later it could extend/);
  assert.ok(n.risks.startsWith(draft.canvas.risks));
});

test("risk synthesis drops verbatim problem/impact copy and repeated clauses without inventing exposure", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "Delayed handoffs waste time. Unclear ownership creates accountability risk.";
  draft.fields.currentProcess = "Teams use disconnected request queues.";
  draft.canvas.risks = "Delayed handoffs waste time. Unclear ownership creates accountability risk; unclear ownership creates accountability risk. Missed escalations delay customer response. Missed escalations delay customer response.";
  const n = synthesizeBriefNarrative({ draft, aiResult: { knownFacts: [
    { category: "risk", value: "Missed escalations delay customer response.", source: "user" },
  ] } });
  assert.doesNotMatch(n.risks, /Delayed handoffs waste time/);
  assert.equal((n.risks.match(/accountability risk/g) ?? []).length, 1);
  assert.equal((n.risks.match(/Missed escalations delay customer response/g) ?? []).length, 1);
  assert.doesNotMatch(n.risks, /security|compliance|financial/i);
});

test("a copied problem alone is not presented as a risk; independent supported delivery risk is", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "The old process relies on handwritten labels.";
  draft.fields.currentProcess = "";
  draft.canvas.risks = draft.fields.problemStatement;
  assert.equal(synthesizeBriefNarrative({ draft }).risks, "");
  const supported = synthesizeBriefNarrative({ draft, aiResult: { knownFacts: [
    { category: "constraint", value: "The trial depends on supplier approval.", source: "jira" },
  ] } });
  assert.equal(supported.risks, "The trial depends on supplier approval.");
});

test("an impact fact copied into draft risks yields to independently evidenced risk", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "Requests are handled manually.";
  draft.canvas.risks = "Teams waste time rekeying requests. Supplier delays create a delivery risk.";
  const n = synthesizeBriefNarrative({ draft, aiResult: { knownFacts: [
    { category: "impact", value: "Teams waste time rekeying requests.", source: "user" },
    { category: "risk", value: "Supplier delays create a delivery risk.", source: "jira" },
  ] } });
  assert.equal(n.risks, "Supplier delays create a delivery risk.");
});

test("four distinct source-backed considerations are retained rather than truncating the final security risk", () => {
  const { draft } = fixture();
  draft.fields.problemStatement = "The handoff process is fragmented.";
  draft.canvas.risks = "Unclear ownership creates accountability risk. Supplier dependence creates continuity risk. Incomplete records complicate change management. Limited access visibility creates security exposure.";
  const n = synthesizeBriefNarrative({ draft });
  assert.equal(n.risks, draft.canvas.risks);
});

test("available captured application-inventory facts give distinct risks; the requested 83% original capture is unavailable", async () => {
  // This prior browser fixture has score 45 and readiness 90, not the requested
  // original 45/83 document. It validates the available source facts only.
  const capture = JSON.parse(await readFile(CAPTURE_PATH, "utf8"));
  assert.equal(capture.baseline.score, 45);
  assert.equal(capture.final.readiness.score, 90);
  const evidence = capture.input.turns.map((turn: { answer: string }) => ({ value: turn.answer, source: "user" as const }));
  const completed = finalizeInterviewDraft(capture.baseline, capture.final, capture.final, evidence);
  const n = initialNarrative(completed, capture.final);
  assert.match(n.risks, /security and compliance exposure/);
  assert.match(n.risks, /Credential-management visibility is limited/);
  assert.match(n.risks, /knowledge loss when people leave/);
  assert.doesNotMatch(n.risks, /waste time rediscovering|fragmented across spreadsheets/);
  assert.equal((n.risks.match(/security and compliance exposure/g) ?? []).length, 1);
});

test("live-style compliance details stay discovery and completion benefits become suggested measurable indicators", () => {
  const classified = prioritizeUnknowns(["What are the specific compliance and audit requirements that must be addressed?"]);
  assert.equal(classified.critical.length, 0);
  assert.equal(classified.discovery.length, 1);
  const { draft, ai } = fixture();
  ai.inferredSuggestions = [
    "Faster completion of troubleshooting and onboarding through validated ownership data",
    "Improved security and compliance posture",
    "Reduce processing time by 50%",
  ];
  assert.deepEqual(candidateMeasures(draft, ai), ["Time to complete troubleshooting and onboarding"]);
});

test("discovery questions are not promoted to critical unknowns to fill a quota", () => {
  const result = prioritizeUnknowns([
    "Who is the business owner?", "What budget is available?", "What baseline should validate value?",
    "What is the exact compliance requirement?", "What is the validation cadence?",
    "What is detailed Phase 2 scope?", "Which source systems are used?", "What is the implementation timeline?",
  ]);
  assert.equal(result.critical.length, 3);
  assert.ok(result.critical.every(s => !/exact|cadence|Phase 2|timeline/i.test(s)));
  assert.ok(result.discovery.some(s => /cadence/.test(s)));
  assert.deepEqual(prioritizeUnknowns(["What is the validation cadence?"]).critical, []);
});

test("cleared review edits stay cleared on resume and final save retry despite older AI evidence", () => {
  const { draft, ai } = fixture();
  const n = { executiveSummary: "", expectedValue: "", risks: "", nextSteps: "" };
  const reviewed = mergeReviewIntoDraft(draft, draft.fields, draft.scoring, n);
  assert.deepEqual(initialNarrative(reviewed, ai), n);
  const brief = buildReviewBrief({ draft: reviewed, fields: reviewed.fields, scoring: reviewed.scoring,
    narrative: initialNarrative(reviewed, ai), ai, score: 45, priority: "Low" });
  assert.equal(brief.expectedValue.qualitative.text, "Not yet established");
  assert.equal(brief.risks.text, "Not yet established");
  assert.deepEqual(serializeForSave(reviewed.fields, n), serializeForSave(reviewed.fields, initialNarrative(reviewed, ai)));
});

test("required Department and unfinalized success measures are visible before Save", async () => {
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const { draft, ai } = fixture();
  draft.fields.department = "";
  draft.fields.successMetric = "";
  const html = renderToStaticMarkup(<InitiativeReview draft={draft} aiResult={ai} jira={null}
    submitterName="Reviewer" departments={["IT"]} categories={["Operations"]} levels={["Low", "Medium", "High"]}
    saving={false} onBack={() => {}} onSave={() => {}} onDraftChange={() => {}} />);
  assert.match(html, /Required before Save Initiative: select a Department/);
  assert.match(html, /data-testid="required-department-notice" data-print-hide/);
  assert.match(html, /class="brief-print-text brief-prose" aria-hidden="true"><\/div>/,
    "empty narrative prints no edit prompt");
  assert.doesNotMatch(html, /class="brief-print-text brief-prose" aria-hidden="true">Add an agreed success measure/);
  assert.match(html, /Success measures have not yet been finalized/);
  assert.match(html, /Potential Success Measures/);
  assert.doesNotMatch(html, /\[ai-draft\]/);
});

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
