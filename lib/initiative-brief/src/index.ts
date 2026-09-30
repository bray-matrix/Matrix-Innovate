/** A single semantic, reviewable source for browser, Word and PDF. No network or scoring. */
export type Provenance = "user" | "jira" | "ai-draft" | "suggestion" | "reviewed";
export interface BriefText { text: string; source: Provenance }
export interface BriefMeasure extends BriefText { label: string; status: "estimated" | "confirmed" | "unknown" }
export interface BriefUnknown { text: string; priority: "critical" | "discovery" }
export interface InitiativeBrief {
  metadata: {
    title: string; type: string; department: string; submitter: string;
    businessOwner: string; executiveSponsor: string; generatedAt: string;
    status: string; jiraKey: string;
  };
  executiveSummary: BriefText;
  businessNeed: { problem: BriefText; currentState: BriefText; businessImpact?: BriefText };
  futureState: { outcome: BriefText; approach: BriefText; prototype?: BriefText };
  expectedValue: { qualitative: BriefText; quantified: BriefMeasure[] };
  successMeasures: { drafted: BriefText; candidates: BriefText[] };
  risks: BriefText;
  unknowns: BriefUnknown[];
  nextSteps: BriefText;
  assessment: {
    score: number; priority: string; readiness: string;
    factors: { label: string; value: string }[];
  };
  supportingContext: { facts: { category: string; value: string; source: "user" | "jira" }[]; jiraKey: string };
}

export interface BriefDraft {
  fields: {
    title: string; category: string; department: string; submitterName: string;
    businessOwner: string; executiveSponsor: string; problemStatement: string;
    currentProcess: string; desiredOutcome: string; aiConcept: string;
    prototypeGoal: string; successMetric: string;
    estimatedHoursSavedMonthly: number; estimatedRevenueOpportunity: number;
    estimatedCostSavings: number; customerImpact: string; complianceRisk: string;
    technicalComplexity: string; aiReadiness: string;
  };
  canvas: { expectedValue: string; risks: string; recommendedNextStep: string };
  executiveSummary: string;
  score: number; priority: string;
  detectedCategoryLabel?: string;
  scoring?: Record<string, number>;
}
export interface BriefAIResult {
  knownFacts?: { category: string; value: string; source: "user" | "jira"; evidence?: string }[];
  inferredSuggestions?: string[];
  unknowns?: string[];
  draft?: { expectedValue?: string; risks?: string; successMetric?: string };
}
export interface BriefReviewMetadata {
  /** For values where an explicit zero is known, list field names here. Otherwise zero from legacy drafts means unknown. */
  confirmedZeroFields?: ("estimatedHoursSavedMonthly" | "estimatedRevenueOpportunity" | "estimatedCostSavings")[];
  candidateSuccessMeasures?: string[];
  criticalUnknowns?: string[];
  discoveryUnknowns?: string[];
  readiness?: string;
}
export interface BuildInitiativeBriefInput {
  draft: BriefDraft;
  aiResult?: BriefAIResult | null;
  jira?: { jiraIssueKey?: string; key?: string } | null;
  generatedAt?: string;
  review?: BriefReviewMetadata;
}
const clean = (value: string | undefined | null): string => (value ?? "").trim();
const notKnown = (text: string): boolean =>
  !text || /^(?:not yet (?:known|established|quantified)|unknown|tbd|n\/a|none[.!]?)$/i.test(text);
const text = (value: string | undefined, source: Provenance): BriefText => ({
  text: notKnown(clean(value)) ? "Not yet established" : clean(value), source,
});
function unique(items: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  return items.map(clean).filter(item => {
    const key = item.toLowerCase().replace(/[?.!;:\s]+/g, " ").trim();
    if (!key || seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    return true;
  });
}
function shortUnknown(value: string): string {
  const first = value.split(/[;\n]/)[0].trim();
  return first.length > 230 ? `${first.slice(0, 227).trimEnd()}…` : first;
}
function validNarrative(value: string): boolean {
  const trimmed = clean(value);
  return !notKnown(trimmed) && !/^(?:risks not yet known|value not yet quantified)/i.test(trimmed);
}
export function buildInitiativeBrief({
  draft, aiResult, jira, generatedAt, review,
}: BuildInitiativeBriefInput): InitiativeBrief {
  const f = draft.fields;
  const narrative = [f.problemStatement, f.currentProcess, f.desiredOutcome, f.successMetric]
    .map(value => clean(value).toLowerCase());
  const impactFact = (aiResult?.knownFacts ?? []).find(fact =>
    /^(business )?impact$/i.test(clean(fact.category)) && validNarrative(fact.value) &&
    !narrative.includes(clean(fact.value).toLowerCase()));
  const facts = (aiResult?.knownFacts ?? []).filter(fact =>
    fact !== impactFact && clean(fact.value) && !narrative.includes(clean(fact.value).toLowerCase()))
    .slice(0, 4).map(({ category, value, source }) => ({ category, value, source }));
  // The edited canvas is the only current value. A cleared edit must not resurrect
  // stale AI language or duplicate the entire desired outcome as a "value" claim.
  const qualitative = validNarrative(draft.canvas.expectedValue)
    ? draft.canvas.expectedValue : "Not yet established";
  const quantityFields = [
    ["Monthly hours saved", "estimatedHoursSavedMonthly", f.estimatedHoursSavedMonthly, "hours/month"],
    ["Revenue opportunity", "estimatedRevenueOpportunity", f.estimatedRevenueOpportunity, "USD"],
    ["Cost savings", "estimatedCostSavings", f.estimatedCostSavings, "USD"],
  ] as const;
  const quantified: BriefMeasure[] = quantityFields.map(([label, key, amount, unit]) => {
    const explicitZero = review?.confirmedZeroFields?.includes(key);
    const known = Number.isFinite(amount) && (amount > 0 || (amount === 0 && explicitZero));
    return {
      label, text: known ? `${amount.toLocaleString("en-US")} ${unit}` : "Not yet established",
      source: known ? "user" : "reviewed", status: known ? "estimated" : "unknown",
    };
  });
  const rawUnknowns = (aiResult?.unknowns ?? []).map(shortUnknown);
  const discoveryPattern = /\b(?:implementation|integration|rollout|deployment|technical design|vendor|project plan)\b/i;
  const unknowns: BriefUnknown[] = [
    ...unique(review?.criticalUnknowns ?? rawUnknowns.filter(v => !discoveryPattern.test(v)), 4)
      .map(item => ({ text: item, priority: "critical" as const })),
    ...unique(review?.discoveryUnknowns ?? rawUnknowns.filter(v => discoveryPattern.test(v)), 3)
      .map(item => ({ text: item, priority: "discovery" as const })),
  ].filter((item, index, all) =>
    all.findIndex(other => other.text.toLowerCase() === item.text.toLowerCase()) === index);
  const candidates = unique(review?.candidateSuccessMeasures ?? [], 4).map(item => text(item, "suggestion"));
  const jiraKey = clean(jira?.jiraIssueKey || jira?.key);
  const scoring = draft.scoring;
  const factor = (key: string, maximum: number) =>
    Number.isFinite(scoring?.[key]) ? `${scoring![key]}/${maximum}` : "Not assessed";
  const complexity = scoring?.technicalComplexityPenalty;
  const risk = scoring?.riskPenalty;
  const combinedRisk = Number.isFinite(complexity) && Number.isFinite(risk)
    ? `${complexity! + risk!} (complexity ${complexity}, risk ${risk})`
    : "Not assessed";
  return {
    metadata: {
      title: clean(f.title) || "Untitled initiative", type: clean(f.category),
      department: clean(f.department), submitter: clean(f.submitterName),
      businessOwner: clean(f.businessOwner), executiveSponsor: clean(f.executiveSponsor),
      generatedAt: generatedAt ?? new Date().toISOString(), status: "Draft",
      jiraKey,
    },
    executiveSummary: text(draft.executiveSummary, "ai-draft"),
    businessNeed: {
      problem: text(f.problemStatement, "ai-draft"),
      currentState: text(f.currentProcess, "ai-draft"),
      ...(impactFact ? { businessImpact: text(impactFact.value, impactFact.source) } : {}),
    },
    futureState: {
      outcome: text(f.desiredOutcome, "ai-draft"),
      approach: text(f.aiConcept, "ai-draft"),
      ...(clean(f.prototypeGoal) ? { prototype: text(f.prototypeGoal, "ai-draft") } : {}),
    },
    expectedValue: { qualitative: text(qualitative, "ai-draft"), quantified },
    successMeasures: {
      drafted: text(f.successMetric, "ai-draft"), candidates,
    },
    risks: text(draft.canvas.risks, "ai-draft"),
    unknowns,
    nextSteps: text(draft.canvas.recommendedNextStep, "ai-draft"),
    assessment: {
      score: draft.score, priority: draft.priority, readiness: review?.readiness ?? f.aiReadiness,
      factors: [
        { label: "Business value", value: factor("businessValue", 25) },
        { label: "Strategic alignment", value: factor("strategicAlignment", 10) },
        { label: "Readiness score", value: factor("aiReadinessScore", 10) },
        { label: "Delivery confidence", value: factor("prototypeConfidence", 10) },
        { label: "Risk / complexity", value: combinedRisk },
        { label: "Customer impact score", value: factor("customerImpactScore", 15) },
        { label: "Revenue potential score", value: factor("revenuePotential", 15) },
        { label: "Cost savings score", value: factor("costSavingsScore", 15) },
        { label: "AI readiness category", value: f.aiReadiness || "Not assessed" },
        { label: "Technical complexity", value: f.technicalComplexity || "Not assessed" },
        { label: "Compliance risk", value: f.complianceRisk || "Not assessed" },
      ],
    },
    supportingContext: { facts, jiraKey },
  };
}

/** Validate untrusted export input, including nested text and collection bounds. */
export function parseInitiativeBrief(input: unknown): InitiativeBrief {
  if (!input || typeof input !== "object") throw new Error("Initiative Brief must be an object");
  const brief = input as InitiativeBrief;
  const str = (v: unknown, max = 12000): v is string => typeof v === "string" && v.length <= max;
  const entry = (v: BriefText): boolean => !!v && str(v.text) &&
    ["user", "jira", "ai-draft", "suggestion", "reviewed"].includes(v.source);
  const m = brief.metadata;
  if (!m || !str(m.title, 240) || !m.title.trim() ||
    ![m.type, m.department, m.submitter, m.businessOwner, m.executiveSponsor,
      m.generatedAt, m.status, m.jiraKey].every(v => str(v, 240)) ||
    !Number.isFinite(Date.parse(m.generatedAt)) ||
    !entry(brief.executiveSummary) ||
    !brief.businessNeed || !entry(brief.businessNeed.problem) ||
    !entry(brief.businessNeed.currentState) ||
    (brief.businessNeed.businessImpact !== undefined && !entry(brief.businessNeed.businessImpact)) ||
    !brief.futureState || !entry(brief.futureState.outcome) || !entry(brief.futureState.approach) ||
    (brief.futureState.prototype !== undefined && !entry(brief.futureState.prototype)) ||
    !brief.expectedValue || !entry(brief.expectedValue.qualitative) ||
    !Array.isArray(brief.expectedValue.quantified) || brief.expectedValue.quantified.length > 10 ||
    !brief.expectedValue.quantified.every(v => entry(v) && str(v.label, 120) &&
      ["estimated", "confirmed", "unknown"].includes(v.status)) ||
    !brief.successMeasures || !entry(brief.successMeasures.drafted) ||
    !Array.isArray(brief.successMeasures.candidates) || brief.successMeasures.candidates.length > 8 ||
    !brief.successMeasures.candidates.every(entry) ||
    !entry(brief.risks) || !entry(brief.nextSteps) ||
    !Array.isArray(brief.unknowns) || brief.unknowns.length > 12 ||
    !brief.unknowns.every(v => str(v.text, 1000) && ["critical", "discovery"].includes(v.priority)) ||
    !brief.assessment || !Number.isFinite(brief.assessment.score) ||
    brief.assessment.score < 0 || brief.assessment.score > 100 ||
    !str(brief.assessment.priority, 80) || !str(brief.assessment.readiness, 120) ||
    !Array.isArray(brief.assessment.factors) || brief.assessment.factors.length > 20 ||
    !brief.assessment.factors.every(v => str(v.label, 120) && str(v.value, 120)) ||
    !brief.supportingContext || !str(brief.supportingContext.jiraKey, 120) ||
    !Array.isArray(brief.supportingContext.facts) || brief.supportingContext.facts.length > 24 ||
    !brief.supportingContext.facts.every(v => str(v.category, 120) && str(v.value, 1500) &&
      ["user", "jira"].includes(v.source))) {
    throw new Error("Invalid or oversized Initiative Brief");
  }
  return brief;
}