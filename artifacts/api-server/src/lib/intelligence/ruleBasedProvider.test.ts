import assert from "node:assert/strict";
import { test } from "node:test";
import type { InitiativeBrief } from "@workspace/initiative-brief";
import { RuleBasedRecommendationProvider } from "./ruleBasedProvider";
import type { InitiativeForRecommendations } from "./types";

const provider = new RuleBasedRecommendationProvider();
const text = (value: string) => ({ text: value, source: "reviewed" as const });
const brief: InitiativeBrief = {
  metadata: {
    title: "Application inventory", type: "Technology", department: "Operations",
    submitter: "Submitter", businessOwner: "", executiveSponsor: "",
    generatedAt: "2026-09-30T12:00:00.000Z", status: "Draft", jiraKey: "",
  },
  executiveSummary: text("An inventory of applications."),
  businessNeed: { problem: text("Ownership is unclear."), currentState: text("Separate spreadsheets.") },
  futureState: { outcome: text("Shared ownership visibility."), approach: text("Consolidate records.") },
  expectedValue: { qualitative: text("Clear accountability and fewer duplicate renewals."), quantified: [] },
  successMeasures: { drafted: text("Not yet established"), candidates: [] },
  risks: text("Unverified owners may delay renewal decisions."),
  unknowns: [{ text: "Who will own the inventory?", priority: "critical" }],
  nextSteps: text("Validate ownership with affected teams before deciding the pilot scope."),
  assessment: { score: 45, priority: "Low", readiness: "83% — Strong Business Context", factors: [] },
  supportingContext: { facts: [], jiraKey: "" },
};

function initiative(overrides: Partial<InitiativeForRecommendations> = {}): InitiativeForRecommendations {
  // Only fields read by this provider are needed; no database or route is involved.
  return {
    id: 17, title: "Application inventory", category: "Technology", department: "Operations",
    status: "Idea", problemStatement: "Application ownership is unclear",
    currentProcess: "Separate spreadsheets", aiConcept: "Consolidate records",
    prototypeGoal: "", successMetric: "", score: 45, priority: "Low",
    technicalComplexity: "Medium", complianceRisk: "High", aiReadiness: "Low",
    executiveSponsor: null, businessOwner: null, estimatedCostSavings: 0,
    estimatedRevenueOpportunity: 0, estimatedHoursSavedMonthly: 0,
    ...overrides,
  } as InitiativeForRecommendations;
}

test("reviewed qualitative value, risk and next steps remain authoritative", async () => {
  const item = initiative({ reviewedBrief: brief });
  const result = await provider.generateRecommendations({ initiative: item, allInitiatives: [item] });
  assert.match(result.expectedBusinessValue, /Clear accountability and fewer duplicate renewals/);
  assert.match(result.expectedBusinessValue, /Financial value not yet quantified/);
  assert.equal(result.expectedAnnualValue, 0);
  assert.deepEqual(result.risks, [brief.risks.text]);
  assert.equal(result.nextAction, brief.nextSteps.text);
  assert.match(result.governanceNextAction ?? "", /Who will own the inventory/);
  assert.doesNotMatch(JSON.stringify(result), /legal and security sign-off required|review gates/);
  assert.match(result.confidenceDescription, /Not a measured probability/);
});

test("legacy rows fall back to evidence-backed rules without claiming mandatory sign-off", async () => {
  const item = initiative({ reviewedBrief: null });
  const result = await provider.generateRecommendations({ initiative: item, allInitiatives: [] });
  assert.match(result.expectedBusinessValue, /Value not yet quantified/);
  assert.match(result.risks.join(" "), /Self-reported High compliance risk/);
  assert.doesNotMatch(result.risks.join(" "), /sign-off required/);
  assert.deepEqual(result.teamRoles, []);
  assert.match(result.nextAction, /business owner/);
  assert.equal(result.governanceNextAction, undefined);
});

test("INI-0018 planning prompts follow stated onboarding evidence, not generic staffing or gates", async () => {
  // Representative values from the read-only production INI-0018 inspection.
  const item = initiative({
    id: 18, title: "Unified Client Onboarding Visibility Platform",
    department: "Information Technology", category: "Customer Experience",
    problemStatement: "Client onboarding spans multiple departments, systems, and approval stages without a centralized view of progress, ownership, or blockers.",
    currentProcess: "Onboarding is managed across disconnected departments and systems, with tasks, approvals, and handoffs tracked in multiple places.",
    desiredOutcome: "Show progress, ownership, dependencies, blockers, and readiness.",
    aiConcept: "", prototypeGoal: "", successMetric: "", complianceRisk: "Medium",
    technicalComplexity: "Medium", aiReadiness: "High", score: 58, priority: "Medium",
    reviewedBrief: {
      ...brief,
      risks: text("Not yet established"),
      nextSteps: text("Confirm the accountable business owner and department."),
      unknowns: [{ text: "Success metric not established", priority: "critical" }],
      expectedValue: { qualitative: text("Reduce manual status gathering and identify blockers sooner."), quantified: [] },
      supportingContext: {
        facts: [{ category: "Stakeholders", source: "user",
          value: "Leadership, account management, operations and technology can see onboarding status." }],
        jiraKey: "",
      },
    },
  });
  const result = await provider.generateRecommendations({ initiative: item, allInitiatives: [item] });
  assert.equal(result.engine, "rules-v1");
  assert.equal(result.sourceLabel, "Rule Engine v1");
  assert.equal(result.estimatedPrototypeDurationDays, 0);
  assert.match(result.prototypeScope, /prototype has not been defined/);
  assert.deepEqual(result.teamRoles, []);
  assert.deepEqual(result.risks, [
    "Current process describes disconnected departments or systems and handoffs/dependencies — assess how blockers and ownership will be visible",
  ]);
  assert.match(result.expectedBusinessValue, /Reduce manual status gathering/);
  assert.equal(result.expectedAnnualValue, 0);
  assert.equal(result.nextAction, "Confirm the accountable business owner and department.");
  assert.match(result.governanceNextAction ?? "", /Success metric not established/);
  assert.doesNotMatch(JSON.stringify({ risks: result.risks, teamRoles: result.teamRoles, governanceNextAction: result.governanceNextAction }), /mandatory|legal|security|sponsor|compliance review|sign-off/i);
});

test("no stakeholder roles or generic risk appear without specific evidence", async () => {
  const item = initiative({
    complianceRisk: "Medium", technicalComplexity: "Medium", businessOwner: "Owner",
    executiveSponsor: null, currentProcess: "An existing process.", problemStatement: "A delay.",
    reviewedBrief: { ...brief, risks: text("Not yet established"),
      supportingContext: { facts: [], jiraKey: "" }, unknowns: [], nextSteps: text("") },
  });
  const result = await provider.generateRecommendations({ initiative: item, allInitiatives: [] });
  assert.deepEqual(result.risks, []);
  assert.deepEqual(result.teamRoles, []);
  assert.doesNotMatch(result.nextAction, /sponsor/);
});

test("only stakeholder-named roles are possible roles, never automatic assignments", async () => {
  const item = initiative({ reviewedBrief: {
    ...brief,
    supportingContext: { jiraKey: "", facts: [
      { category: "Stakeholders", source: "user", value: "Project Manager and Business Analyst involved." },
      { category: "Problem Statement", source: "user", value: "A Data Engineer may be useful." },
    ] },
  } });
  const result = await provider.generateRecommendations({ initiative: item, allInitiatives: [] });
  assert.deepEqual(result.teamRoles, ["Business Analyst", "Project Manager"]);
});

test("current state and decision-critical context take precedence over low score", async () => {
  const candidate = initiative({ reviewedBrief: { ...brief, nextSteps: text("Not yet established") } });
  const critical = await provider.generateRecommendations({ initiative: candidate, allInitiatives: [] });
  assert.match(critical.nextAction, /Who will own the inventory/);
  const withoutUnknowns = { ...brief, unknowns: [] };
  const approved = await provider.generateRecommendations({
    initiative: initiative({ status: "Approved", score: 0, reviewedBrief: { ...withoutUnknowns, nextSteps: text("") } }),
    allInitiatives: [],
  });
  assert.match(approved.nextAction, /Agree the delivery approach/);
  const inReview = await provider.generateRecommendations({
    initiative: initiative({ status: "Review", businessOwner: "Owner", executiveSponsor: "Sponsor",
      reviewedBrief: { ...withoutUnknowns, nextSteps: text(""), assessment: { ...brief.assessment, readiness: "Low" } } }),
    allInitiatives: [],
  });
  assert.match(inReview.nextAction, /intake context/);
});

test("stored intake labels and current assessment drive Review governance, not stale brief priority", async () => {
  const withoutUnknowns = { ...brief, unknowns: [], nextSteps: text("") };
  const review = (priority: string, readiness: string, stalePriority = "Low") =>
    provider.generateRecommendations({
      initiative: initiative({
        status: "Review", priority, businessOwner: "Owner", executiveSponsor: "Sponsor",
        reviewedBrief: { ...withoutUnknowns, assessment: { ...brief.assessment, priority: stalePriority, readiness } },
      }),
      allInitiatives: [],
    });
  const building = await review("High", "23% — Building Context");
  assert.match(building.nextAction, /gathering more intake context/);
  const understanding = await review("High", "54% — Understanding the Opportunity");
  assert.match(understanding.nextAction, /gathering more intake context/);
  const strong = await review("High", "83% — Strong Business Context");
  assert.equal(strong.nextAction, "Present at the next innovation review meeting");
  const enough = await review("High", "72% — Enough to Draft");
  assert.equal(enough.nextAction, strong.nextAction);
  const rescored = await review("Low", "83% — Strong Business Context", "High");
  assert.equal(rescored.nextAction, "Review the assessment and decide whether to advance or defer");
  assert.doesNotMatch(building.nextAction, /required|must|before advancing/i);
});

test("similarity never returns the current initiative, even if present in the candidates", () => {
  const item = initiative();
  const another = initiative({ id: 18, title: "Application ownership inventory" });
  const matches = provider.findSimilarInitiatives({
    initiative: item, allInitiatives: [item, { ...item }, another],
  });
  assert.deepEqual(matches.map(match => match.id), [18]);
});