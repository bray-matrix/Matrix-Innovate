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
/** Completion-only treatment of transcript wrappers; never apply to reviewed prose. */
export function editorialAnswer(value: string): string {
  return cleanBriefProse(value
    .replace(/\b(?:System prompt|Prompt|Instruction|Transcript metadata)\s*:\s*[^\n]*?(?=\b(?:Additional notes|Interview answer|Answer)\s*:|\n|$)/gi, "")
    .replace(/\b(?:Additional notes|Interview question|Question|Interview answer|Answer)\s*:\s*(?:[^?\n:]{1,240}\?\s*:?\s*)?/gi, "")
    .replace(/(?:^|\n)\s*(?:question[_ -]?id|prompt|field[_ -]?name)\s*:\s*[^\n]*/gi, " ")
    .replace(/^\s*(?:What|How|Why|Who|When|Where|Which|Would|Could|Do|Does|Is|Are)\b[^?\n]{0,240}\?\s*:?\s*/i, "")
    .replace(/\bWe want\b/gi, "The initiative aims for")
    .trim());
}
export function hasInterviewMachinery(value: string): boolean {
  return /\b(?:Additional notes|Interview question|Interview answer|Question|Answer|question[_ -]?id|field[_ -]?name|System prompt|Prompt|Instruction|Transcript metadata)\s*:/i.test(value) ||
    /(?:^|\n)\s*(?:What|How|Why|Who|When|Where|Which)\b[^?\n]{0,240}\?\s*:/i.test(value);
}
/**
 * Editorial treatment for generated benefit forecasts, not source testimony or
 * reviewed edits. A direct user observation ("the process wastes time") remains
 * an observation; a generated promise ("will reduce time") is a projection.
 * Keep this narrow: do not rewrite quantities, facts, or quoted user language.
 */
export function qualifyDraftBenefits(value: string): string {
  return value.replace(/\bwill (reduce|improve|increase|decrease|save|prevent|eliminate|streamline|accelerate|strengthen|enhance|support|provide|enable|deliver|avoid|make|help|create|allow|result in|lead to)\b/gi,
    (match, verb: string) => `${match[0] === "W" ? "Is" : "is"} expected to ${verb.toLowerCase()}`);
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
const prose = (items: string[], max = 4): string => clean(unique(items, max).map(item =>
  /[.!?]$/.test(item) ? item : `${item}.`).join(" "));
const impactSignal = /\b(?:wast(?:e|ed|ing)|slow(?:er|s)?|delay(?:s|ed)?|inefficien\w*|time.consuming|harder|difficult|burden|rework|depend(?:ence|ency)|bottleneck)\b/i;
const benefitSignal = /\b(?:reduc(?:e|ed|ing|tion)|improv(?:e|ed|ing|ement)|faster|clearer|better|reliable|streamlin\w*|save|saving|avoid|enable)\b/i;
const riskSignal = /\b(?:risk|exposure|unclear|unknown ownership|lack of|knowledge loss|dependence|dependent on|lost when|lose.*(?:leave|leaves)|security|compliance|credential)\b/i;
const adverseSignal = /\b(?:risk|exposure|unclear|unknown ownership|lack|loss|lost|lose|limited|dependence|dependent|concern|gap|vulnerab\w*)\b/i;
const unresolved = /^(?:(?:i|we) (?:am |are )?)?(?:not yet (?:known|established|quantified)|do not know|don't know|unsure|tbd)\b/i;
const riskKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Remove only verbatim repeated clauses. Do not merge differently worded assertions. */
function distinctRiskClauses(value: string): string {
  const seen = new Set<string>();
  return value.split(/\s*;\s*/).filter(clause => {
    const key = riskKey(clause);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("; ");
}
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
  for (const item of unique(items.map(distinctRiskClauses), Number.MAX_SAFE_INTEGER)) {
    const key = tokens(item);
    if (keys.some(other => {
      const smaller = key.size <= other.size ? key : other;
      const larger = key.size <= other.size ? other : key;
      return smaller.size >= 3 && [...smaller].every(word => larger.has(word));
    })) continue;
    selected.push(item); keys.push(key);
    if (selected.length === 6) break;
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
    ...facts.flatMap(fact => sentences(editorialAnswer(fact.value))),
    ...evidence.flatMap(item => sentences(editorialAnswer(item.value))),
    ...[f.problemStatement, f.currentProcess, f.desiredOutcome].flatMap(value => sentences(editorialAnswer(value))),
  ], Number.MAX_SAFE_INTEGER).filter(s => !unresolved.test(s) && !s.endsWith("?"));
  const valueFacts = facts.filter(fact => /\b(?:value|benefit|impact)\b/i.test(fact.category))
    .flatMap(fact => sentences(editorialAnswer(fact.value)));
  const benefits = evidenceSentences.filter(s => benefitSignal.test(s) && !impactSignal.test(s));
  const impacts = unique([...valueFacts.filter(s => impactSignal.test(s)), ...evidenceSentences.filter(s => impactSignal.test(s))], 2);
  const rawValue = validNarrative(draft.canvas.expectedValue) ? draft.canvas.expectedValue : aiResult?.draft?.expectedValue ?? "";
  const suppliedValue = hasInterviewMachinery(rawValue) ? editorialAnswer(rawValue) : rawValue;
  // Numbers alone are not qualitative value.
  const qualitativeValue = validNarrative(suppliedValue) && !/^(?:estimated )?(?:~?\d|\$)/i.test(suppliedValue)
    ? clean(validNarrative(draft.canvas.expectedValue) ? suppliedValue : qualifyDraftBenefits(suppliedValue))
    : prose([
      ...valueFacts.filter(s => !impactSignal.test(s)).slice(0, 2),
      ...(impacts.length ? [`The business case rests on addressing these reported impacts: ${impacts.map(s => s.replace(/[.!?]$/, "")).join("; ")}`] : benefits.slice(0, 2)),
    ]);
  const suppliedRisks = editorialAnswer(draft.canvas.risks);
  const knownRisks = facts.filter(fact => /\b(?:risk|constraint|consideration)\b/i.test(fact.category))
    .flatMap(fact => sentences(editorialAnswer(fact.value))).filter(s => !unresolved.test(s));
  // A source problem/impact may contain the word "risk". Prefer actual risk
  // statements when present instead of reciting that problem as a risk.
  const problemSentences = new Set([
    f.problemStatement, f.currentProcess,
    ...facts.filter(fact => /\b(?:problem|impact|current state)\b/i.test(fact.category)).map(fact => fact.value),
  ].flatMap(sentences).map(riskKey));
  const riskCandidates = [
    ...(validNarrative(suppliedRisks) && !hasInterviewMachinery(suppliedRisks) &&
      !/^Compliance:.*Complexity:/i.test(suppliedRisks) ? sentences(suppliedRisks) : []),
    ...knownRisks, ...evidenceSentences.filter(s => riskSignal.test(s) && adverseSignal.test(s) &&
      !benefitSignal.test(s) && /\b(?:risk|exposure|credential|knowledge loss|lost when|lose knowledge)\b/i.test(s)),
  ];
  const actualRisks = riskCandidates.filter(s =>
    !problemSentences.has(riskKey(s)) ||
    // A sentence can be both a problem sentence and an explicit risk. Retain
    // that risk, but not copied impact/throughput prose or bare problem facts.
    (/\b(?:risk|exposure)\b/i.test(s) && adverseSignal.test(s) && !benefitSignal.test(s)));
  const impactKeys = new Set(impacts.map(riskKey));
  // The completion output can put a present-day impact under "risks". Use
  // grounded exposure statements instead; no template runs without evidence.
  const grounded = [...facts.flatMap(fact => sentences(editorialAnswer(fact.value))),
    ...evidence.flatMap(item => sentences(editorialAnswer(item.value)))];
  const sourceSentences = grounded.length ? grounded : evidenceSentences;
  const ownershipGap = /\b(?:unclear|unknown|unassigned|incomplete|fragmented|missing|limited|lack of)\b[^.!?]{0,100}\bownership\b|\bownership\b[^.!?]{0,100}\b(?:unclear|unknown|unassigned|incomplete|missing|limited)\b/i;
  const dependencyGap = /\b(?:unclear|unknown|unassigned|incomplete|fragmented|missing|limited|lack of)\b[^.!?]{0,100}\b(?:dependenc\w*|integration\w*)\b|\b(?:dependenc\w*|integration\w*)\b[^.!?]{0,100}\b(?:unclear|unknown|unassigned|incomplete|missing|limited)\b/i;
  const securityEvidence = sourceSentences.filter(s => /\b(?:security|compliance)\b/i.test(s));
  const securityOwnership = securityEvidence.some(s => ownershipGap.test(s));
  const securityDependency = securityEvidence.some(s => dependencyGap.test(s));
  const securityTopics = securityEvidence.filter(s => ownershipGap.test(s) || dependencyGap.test(s)).join(" ");
  // Do not accept an AI-drafted gap merely because a source mentions a topic
  // positively (e.g. complete ownership and a separate security review).
  const supportedExposure = (s: string) => !grounded.length ||
    [f.problemStatement, f.currentProcess].flatMap(sentences).some(item => riskKey(item) === riskKey(s)) ||
    ((!ownershipGap.test(s) || sourceSentences.some(item => ownershipGap.test(item))) &&
      (!dependencyGap.test(s) || sourceSentences.some(item => dependencyGap.test(item))) &&
      (!/\b(?:security|compliance)\b[^.!?]*\b(?:risk|exposure)\b/i.test(s) ||
        !/\b(?:ownership|dependenc\w*|integration\w*)\b/i.test(s) ||
        securityOwnership || securityDependency));
  const supported = [
    sourceSentences.some(s => /\b(?:institutional knowledge|individual knowledge|specific individuals)\b/i.test(s)) &&
      sourceSentences.some(s => /\b(?:leave|leaves|transitions?|change roles?|knowledge loss|lose knowledge|depend(?:ence|ency))\b/i.test(s))
      ? "Reliance on institutional knowledge may create continuity risk when responsible people leave or change roles." : "",
    sourceSentences.some(s => ownershipGap.test(s))
      ? "Unclear ownership may create accountability and operational risk." : "",
    sourceSentences.some(s => dependencyGap.test(s))
      ? "Incomplete dependency visibility could complicate troubleshooting and system changes." : "",
    securityOwnership || securityDependency
      ? `Gaps in ${securityOwnership && securityDependency ? "ownership and dependency" :
        securityOwnership ? "ownership" : "dependency"} visibility may create ${
        /\bsecurity\b/i.test(securityTopics) && /\bcompliance\b/i.test(securityTopics)
          ? "security and compliance" : /\bsecurity\b/i.test(securityTopics) ? "security" : "compliance"} exposure.` : "",
    sourceSentences.some(s => /\bcredential.management visibility is limited\b|\blimited visibility\b[^.!?]{0,100}\bcredential/i.test(s))
      ? "Limited visibility into credential-management responsibility may create governance and security concerns." : "",
  ].filter(Boolean);
  const useSupported = (sentences(suppliedRisks).length > 0 &&
    sentences(suppliedRisks).every(s => impactSignal.test(s)) && supported.length >= 2) || !actualRisks.length || actualRisks.every(s =>
    impactKeys.has(riskKey(s)) || (impactSignal.test(s) && !/\b(?:risk|exposure|continuity|accountability|governance)\b/i.test(s)));
  const alreadySynthesized = (sentences(suppliedRisks).filter(s =>
    /\b(?:may create|could complicate|may lead to|could create)\b/i.test(s)).length >= 2) &&
    !sentences(suppliedRisks).some(s => impactKeys.has(riskKey(s)) || !supportedExposure(s));
  const risks = alreadySynthesized ? suppliedRisks : prose(distinctRisks(useSupported && supported.length ? supported : actualRisks.filter(s =>
    supportedExposure(s) && (!impactKeys.has(riskKey(s)) || knownRisks.some(r => riskKey(r) === riskKey(s))) &&
    (!impactSignal.test(s) || /\b(?:risk|exposure|continuity|accountability|governance)\b/i.test(s) ||
      knownRisks.some(r => riskKey(r) === riskKey(s))))), 6);
  const suppliedSummary = aiResult?.draft?.executiveSummary || draft.executiveSummary;
  const mechanical = /\b(?:addresses:|Desired outcome:|Classified as|Value not yet quantified|scores \d+\/100)/i;
  const problem = sentences(editorialAnswer(f.problemStatement))[0];
  const outcome = sentences(editorialAnswer(f.desiredOutcome))[0];
  const summary = validNarrative(suppliedSummary) && !mechanical.test(suppliedSummary) && !hasInterviewMachinery(suppliedSummary)
    ? clean(aiResult?.draft?.executiveSummary ? qualifyDraftBenefits(suppliedSummary) : suppliedSummary)
    : prose([problem, outcome,
      ...sentences(qualitativeValue).filter(s => s !== outcome && s !== problem).slice(0, 1)].filter(Boolean));
  const existingNext = draft.canvas.recommendedNextStep;
  const cleanedNext = hasInterviewMachinery(existingNext) ? editorialAnswer(existingNext) : existingNext;
  const nextSteps = validNarrative(cleanedNext) && !hasInterviewMachinery(cleanedNext) &&
    !/\b(?:refine scoring|priority|score \d|fast-track)\b/i.test(cleanedNext)
    ? clean(cleanedNext)
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
    .slice(0, 4).map(({ category, value, source }) => ({
      category, value: hasInterviewMachinery(value) ? editorialAnswer(value) : value, source,
    }));
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
       ...(impactFact ? { businessImpact: text(hasInterviewMachinery(impactFact.value)
         ? editorialAnswer(impactFact.value) : impactFact.value, impactFact.source) } : {}),
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