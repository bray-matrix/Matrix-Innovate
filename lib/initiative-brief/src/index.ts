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
  draft?: { expectedValue?: string; risks?: string; successMetric?: string; executiveSummary?: string };
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
/** Conservative editorial cleanup: never rewrite quantities or factual clauses. */
export function cleanBriefProse(value: string | undefined | null): string {
  const normalized = (value ?? "").trim().replace(/[ \t]+/g, " ")
    .replace(/\.{2,}/g, ".").replace(/([!?])\1+/g, "$1").replace(/([.!?])\s*[.!?](?=\s|$)/g, "$1");
  const seen = new Set<string>();
  return normalized.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/).filter(sentence => {
    const key = sentence.toLowerCase().replace(/[.!?\s]+$/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" ");
}
const clean = cleanBriefProse;
const notKnown = (text: string): boolean =>
  !text || /^(?:not yet (?:known|established|quantified)|unknown|tbd|n\/a|none)[.!]?$/i.test(text);
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

export interface BriefSynthesisInput {
  draft: Pick<BriefDraft, "fields" | "canvas" | "executiveSummary">;
  aiResult?: BriefAIResult | null;
  /** Answers only, not interviewer questions. Keep the full transcript in its original storage. */
  evidence?: readonly { value: string; source: "user" | "jira" }[];
}
export interface SynthesizedBriefNarrative {
  executiveSummary: string; expectedValue: string; risks: string; nextSteps: string;
}
const sentences = (value: string): string[] =>
  clean(value).split(/(?<=[.!?])\s+(?=[A-Z])/).filter(validNarrative);
const prose = (items: string[]): string => clean(unique(items, 4).map(item =>
  /[.!?]$/.test(item) ? item : `${item}.`).join(" "));
const impactSignal = /\b(?:wast(?:e|ed|ing)|slow(?:er|s)?|delay(?:s|ed)?|inefficien\w*|time.consuming|harder|difficult|burden|rework|depend(?:ence|ency)|bottleneck)\b/i;
const benefitSignal = /\b(?:reduc(?:e|ed|ing|tion)|improv(?:e|ed|ing|ement)|faster|clearer|better|reliable|streamlin\w*|save|saving|avoid|enable)\b/i;
const riskSignal = /\b(?:risk|exposure|unclear|unknown ownership|lack of|knowledge loss|dependence|dependent on|lost when|lose.*(?:leave|leaves)|security|compliance|credential)\b/i;
const adverseSignal = /\b(?:risk|exposure|unclear|unknown ownership|lack|loss|lost|lose|limited|dependence|dependent|concern|gap|vulnerab\w*)\b/i;
const unresolved = /^(?:(?:i|we) (?:am |are )?)?(?:not yet (?:known|established|quantified)|do not know|don't know|unsure|tbd)\b/i;
/** Conservative word-set containment handles reordered/subsumed risk facts,
 * while keeping the supplied wording. No rewritten facts or inferred risks. */
function distinctRisks(items: string[]): string[] {
  const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter(w => !/^(?:a|an|the|we|they|and|or|of|on|in|to|for|from|with|is|are|was|were|be|being|has|have|creates?|causes?|risk|risks|application|applications)$/.test(w))
    .map(w => /^(?:depend|depends|dependent|dependence)$/.test(w) ? "depend"
      : /^(?:loss|lose|loses|lost)$/.test(w) ? "loss"
      : w.replace(/(?:ing|ed|s)$/, "")));
  const selected: string[] = [];
  const keys: Set<string>[] = [];
  for (const item of unique(items, Number.MAX_SAFE_INTEGER)) {
    const key = tokens(item);
    if (keys.some(other => {
      const smaller = key.size <= other.size ? key : other;
      const larger = key.size <= other.size ? other : key;
      return smaller.size >= 3 && [...smaller].every(word => larger.has(word));
    })) continue;
    selected.push(item); keys.push(key);
    if (selected.length === 3) break;
  }
  return selected;
}

/** Measures remain suggestions, never accepted targets or promised outcomes. */
export function potentialSuccessMeasures(items: readonly string[]): string[] {
  return unique(items.map(clean).filter(s => !/\d|\$/.test(s)).flatMap(s => {
    if (/^faster completion of /i.test(s)) {
      return [`Time to complete ${s.replace(/^faster completion of /i, "").split(/\s+through\s+/i)[0]}`];
    }
    if (/\b(?:measure|metric|track|rate|percentage|reduction|reduce|increase|time to|number of|share of)\b/i.test(s)) return [s];
    return [];
  }), 4);
}

/**
 * Completion-only synthesis. Reviewed/cleared edits must not be passed here.
 * Platform prose is preferred; evidence extraction is an explicit deterministic
 * fallback, not a substitute for semantic AI. No scenario-specific vocabulary.
 */
export function synthesizeBriefNarrative({ draft, aiResult, evidence = [] }: BriefSynthesisInput): SynthesizedBriefNarrative {
  const f = draft.fields;
  const facts = aiResult?.knownFacts ?? [];
  const evidenceSentences = unique([
    ...facts.flatMap(fact => sentences(fact.value)),
    ...evidence.flatMap(item => sentences(item.value)),
    ...[f.problemStatement, f.currentProcess, f.desiredOutcome].flatMap(sentences),
  ], Number.MAX_SAFE_INTEGER).filter(s => !unresolved.test(s) && !s.endsWith("?"));
  const valueFacts = facts.filter(fact => /\b(?:value|benefit|impact)\b/i.test(fact.category))
    .flatMap(fact => sentences(fact.value));
  const benefits = evidenceSentences.filter(s => benefitSignal.test(s) && !impactSignal.test(s));
  const impacts = unique([...valueFacts.filter(s => impactSignal.test(s)), ...evidenceSentences.filter(s => impactSignal.test(s))], 2);
  const suppliedValue = validNarrative(draft.canvas.expectedValue) ? draft.canvas.expectedValue : aiResult?.draft?.expectedValue ?? "";
  // Numbers alone are not qualitative value.
  const qualitativeValue = validNarrative(suppliedValue) && !/^(?:estimated )?(?:~?\d|\$)/i.test(suppliedValue)
    ? clean(suppliedValue)
    : prose([
      ...valueFacts.filter(s => !impactSignal.test(s)).slice(0, 2),
      ...(impacts.length ? [`The business case rests on addressing these reported impacts: ${impacts.map(s => s.replace(/[.!?]$/, "")).join("; ")}`] : benefits.slice(0, 2)),
    ]);
  const suppliedRisks = draft.canvas.risks;
  const knownRisks = facts.filter(fact => /\b(?:risk|constraint|consideration)\b/i.test(fact.category))
    .flatMap(fact => sentences(fact.value)).filter(s => !unresolved.test(s));
  const risks = prose(distinctRisks([
    ...(validNarrative(suppliedRisks) && !/^Compliance:.*Complexity:/i.test(suppliedRisks) ? sentences(suppliedRisks) : []),
    ...knownRisks, ...evidenceSentences.filter(s => riskSignal.test(s) && adverseSignal.test(s) && !benefitSignal.test(s)),
  ]));
  const suppliedSummary = aiResult?.draft?.executiveSummary || draft.executiveSummary;
  const mechanical = /\b(?:addresses:|Desired outcome:|Classified as|Value not yet quantified|scores \d+\/100)/i;
  const problem = sentences(f.problemStatement)[0];
  const outcome = sentences(f.desiredOutcome)[0];
  const summary = validNarrative(suppliedSummary) && !mechanical.test(suppliedSummary)
    ? clean(suppliedSummary)
    : prose([problem, outcome,
      ...sentences(qualitativeValue).filter(s => s !== outcome && s !== problem).slice(0, 1)].filter(Boolean));
  const existingNext = draft.canvas.recommendedNextStep;
  const nextSteps = validNarrative(existingNext) && !/\b(?:refine scoring|priority|score \d|fast-track)\b/i.test(existingNext)
    ? clean(existingNext)
    : prose([
      !f.department || !f.businessOwner ? "Confirm the accountable business owner and department" : "Review the proposal with the business owner and affected stakeholders",
      aiResult?.unknowns?.length ? "Resolve the critical unknowns that affect the decision to advance" : "",
      [f.estimatedHoursSavedMonthly, f.estimatedRevenueOpportunity, f.estimatedCostSavings].every(n => !n)
        ? "Validate the qualitative benefits and develop value estimates where useful" : "Validate the value estimates with the affected teams",
      "Decide whether to advance to Project evaluation",
    ].filter(Boolean));
  return { executiveSummary: summary, expectedValue: qualitativeValue, risks, nextSteps };
}

/** Implementation details are not promoted to decision blockers merely to fill a quota. */
export function classifyBriefUnknowns(items: readonly string[]): { critical: string[]; discovery: string[] } {
  const discoveryPattern = /\b(?:cadence|phase\s*(?:2|two)|exact|specific (?:compliance|audit)|detailed|total number|source systems?|implementation|integration|rollout|deployment|technical design|vendor|project plan|resource plan|timeline)\b/i;
  const criticalPattern = /\b(?:owner|sponsor|budget|cost|saving|revenue|value|metric|measure|success|scope|deadline|compliance|risk|security|decision|approval|baseline)\b/i;
  const all = unique(items.map(shortUnknown), Number.MAX_SAFE_INTEGER);
  return {
    critical: all.filter(s => !discoveryPattern.test(s) && criticalPattern.test(s)).slice(0, 4),
    discovery: all.filter(s => discoveryPattern.test(s) || !criticalPattern.test(s)).slice(0, 3),
  };
}
export function buildInitiativeBrief({
  draft, aiResult, jira, generatedAt, review,
}: BuildInitiativeBriefInput): InitiativeBrief {
  const f = draft.fields;
  const narrative = [draft.executiveSummary, f.problemStatement, f.currentProcess, f.desiredOutcome, f.successMetric,
    draft.canvas.expectedValue, draft.canvas.risks].flatMap(sentences)
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
  const rawUnknowns = (aiResult?.unknowns ?? []).filter(item =>
    !(validNarrative(draft.canvas.risks) && /^(?:risks need confirmation|risks (?:unknown|not (?:yet )?known))\.?$/i.test(item)) &&
    !(validNarrative(qualitative) && /^(?:qualitative )?value (?:unknown|not (?:yet )?established)\.?$/i.test(item))
  ).map(shortUnknown);
  const classified = classifyBriefUnknowns(rawUnknowns);
  const unknowns: BriefUnknown[] = [
    ...unique(review?.criticalUnknowns ?? classified.critical, 4)
      .map(item => ({ text: item, priority: "critical" as const })),
    ...unique(review?.discoveryUnknowns ?? classified.discovery, 3)
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