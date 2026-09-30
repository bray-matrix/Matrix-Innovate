// Pure view-model helpers for the v1.6.4 document-first Initiative Review.
// No network, no scoring changes. Safe to unit test in node.
import {
  buildInitiativeBrief,
  classifyBriefUnknowns, synthesizeBriefNarrative, cleanBriefProse, editorialAnswer, hasInterviewMachinery, potentialSuccessMeasures, qualifyDraftBenefits,
  type InitiativeBrief,
} from "@workspace/initiative-brief";
import type {
  InitiativeReviewMetadata,
  InitiativeDraftFields,
  InterviewDraft,
  ScoringComponents,
} from "@/services/aiInterviewService";

export interface ReviewAIResult {
  knownFacts: { category: string; value: string; evidence: string; source: "user" | "jira" }[];
  inferredSuggestions: string[];
  unknowns: string[];
  draft?: { expectedValue?: string; risks?: string; successMetric?: string; executiveSummary?: string };
}

/** Document narrative that lives outside InitiativeDraftFields. */
export interface ReviewNarrative {
  executiveSummary: string;
  expectedValue: string;
  risks: string;
  nextSteps: string;
}

export const SAVE_LABELS = {
  executiveSummary: "Executive summary (reviewed)",
  candidates: "Suggested success measures (suggestions, not established targets)",
  criticalUnknowns: "Critical unknowns",
  discovery: "For project discovery",
  facts: "Supporting context (from interview/Jira)",
  expectedValue: "Expected business value (estimate for review)",
  risks: "Risks / considerations (to validate)",
  nextSteps: "Recommended next steps",
} as const;

const PLACEHOLDER_NARRATIVE = /^(?:value not yet quantified\.?|risks not yet known.*|not yet (?:known|established)\.?|tbd|unknown)$/i;

export function isPlaceholder(text: string): boolean {
  const t = (text ?? "").trim();
  return !t || PLACEHOLDER_NARRATIVE.test(t);
}

/** Normalizes a question/unknown so near-identical wording is deduped. */
function unknownKey(text: string): string {
  return text.toLowerCase()
    .replace(/^(?:what|which|who|how|is|are|does|do|will|when|where)\s+(?:is|are|the|a|an)?\s*/g, "")
    .replace(/\b(?:the|a|an|of|for|to|and|or|any|exact|specific|current)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function concise(text: string): string {
  const t = text.trim().replace(/\s+/g, " ").replace(/[;,]+$/, "");
  if (t.length <= 140) return t;
  const cut = t.slice(0, 140);
  return `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

/**
 * Deduplicates and prioritizes unknowns. Business-case gaps first (critical,
 * max 4); implementation-level questions become discovery (max 3).
 */
export function prioritizeUnknowns(items: readonly string[]): { critical: string[]; discovery: string[] } {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of items.flatMap(i => (i ?? "").split(/;\s+|\n+/))) {
    const text = concise(raw);
    const key = unknownKey(text);
    if (!key || key.length < 3) continue;
    if ([...seen].some(k => k === key || (k.length > 12 && key.includes(k)) || (key.length > 12 && k.includes(key)))) continue;
    seen.add(key);
    unique.push(text);
  }
  return classifyBriefUnknowns(unique);
}

/**
 * Candidate success measures are suggestions only. Anything carrying a
 * number is dropped so the page never presents an invented target.
 */
export function candidateMeasures(draft: InterviewDraft, ai: ReviewAIResult | null): string[] {
  const source = draft.review?.candidateSuccessMeasures
    ?? potentialSuccessMeasures(ai?.inferredSuggestions ?? []);
  const seen = new Set<string>();
  return source.map(concise).filter(s => {
    const key = s.toLowerCase();
    if (/\d|\$/.test(s) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

/** Completion-only section separation. Remove a generated impact/risk clause
 * from Problem/Current State only when source facts carry that same meaning in
 * their own section. Reviewed fields are never passed through this helper. */
function separateGeneratedSections(value: string, facts: ReviewAIResult["knownFacts"]): string {
  const terms = (s: string) => new Set((s.toLowerCase().match(/[a-z]{5,}/g) ?? [])
    .filter(w => !/^(?:about|after|their|there|these|those|which|where|would|could|should|application|applications|information|creates|create|business|teams|people)$/.test(w)));
  const overlaps = (s: string, fact: string) => {
    const a = terms(s), b = terms(fact);
    return [...a].filter(w => b.has(w)).length >= 2;
  };
  const kept = value.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(sentence => {
    const impact = /\b(?:wast\w* time|slower|delay\w*|rediscover\w*|rework|time.consuming)\b/i.test(sentence) &&
      facts.some(f => /^(?:business )?impact$/i.test(f.category) && overlaps(sentence, f.value));
    const risk = /\b(?:risk|exposure)\b/i.test(sentence) &&
      facts.some(f => /^(?:risk|consideration)$/i.test(f.category) && overlaps(sentence, f.value));
    return !impact && !risk;
  });
  return cleanBriefProse(kept.length ? kept.join(" ") : value);
}

/** One completion merge used by the interview and offline replay. Never call
 * on resumed/edited review drafts; those are already authoritative. */
export function finalizeInterviewDraft(
  baseline: InterviewDraft,
  completed: (ReviewAIResult & { suggestedTitle?: string; draft: {
    problemStatement: string; currentProcess: string; desiredOutcome: string;
    successMetric: string; expectedValue: string; risks: string; executiveSummary?: string;
  } }) | null,
  reviewResult: ReviewAIResult,
  evidence: readonly { value: string; source: "user" | "jira" }[],
): InterviewDraft {
  const result = { ...baseline, fields: { ...baseline.fields }, canvas: { ...baseline.canvas } };
  if (completed) {
    const business = completed.draft;
    result.fields.title = completed.suggestedTitle?.trim() || result.fields.title;
    result.fields.problemStatement = business.problemStatement.trim() || result.fields.problemStatement;
    result.fields.currentProcess = business.currentProcess.trim() || result.fields.currentProcess;
    // The model sometimes repeats its impact and risk paragraphs in the problem
    // and present process. Keep them in the dedicated, source-backed sections.
    result.fields.problemStatement = separateGeneratedSections(result.fields.problemStatement, completed.knownFacts);
    result.fields.currentProcess = separateGeneratedSections(result.fields.currentProcess, completed.knownFacts);
    const sourceOutcome = completed.knownFacts.filter(fact => /^(?:desiredOutcome|outcome|scope|governance)$/i.test(fact.category))
      .map(fact => fact.value).join(" ");
    const proposedOutcome = editorialAnswer(business.desiredOutcome.trim());
    const uniqueNotes = baseline.fields.desiredOutcome.split(/\n\n+/).slice(1)
      .flatMap(note => editorialAnswer(note).split(/(?<=[.!?])\s+(?=[A-Z])/))
      .filter(sentence => sentence && !/\b(?:not yet known|unknown|not established)\b/i.test(sentence) &&
        !proposedOutcome.includes(sentence) && !sourceOutcome.includes(sentence));
    result.fields.desiredOutcome = proposedOutcome && !hasInterviewMachinery(proposedOutcome)
      ? qualifyDraftBenefits(editorialAnswer(hasInterviewMachinery(business.desiredOutcome)
        ? `${proposedOutcome} ${sourceOutcome} ${uniqueNotes.join(" ")}` : `${proposedOutcome} ${uniqueNotes.join(" ")}`))
      : editorialAnswer(sourceOutcome ? `${sourceOutcome} ${uniqueNotes.join(" ")}` : result.fields.desiredOutcome);
    // A baseline aspiration is not a grounded, user-established measure.
    result.fields.successMetric = qualifyDraftBenefits(business.successMetric.trim());
    result.canvas.expectedValue = qualifyDraftBenefits(business.expectedValue.trim()) || "Value not yet quantified";
    result.canvas.risks = business.risks.trim() || "Risks not yet known.";
    result.executiveSummary = qualifyDraftBenefits(business.executiveSummary?.trim() || "");
  } else {
    result.canvas.risks = "Risks not yet known; review and add known considerations.";
  }
  const narrative = synthesizeBriefNarrative({ draft: result, aiResult: reviewResult, evidence });
  for (const key of ["problemStatement", "currentProcess", "desiredOutcome", "successMetric", "aiConcept", "prototypeGoal"] as const)
    result.fields[key] = editorialAnswer(result.fields[key]);
  Object.assign(result.canvas, {
    problem: result.fields.problemStatement, currentProcess: result.fields.currentProcess,
    desiredOutcome: result.fields.desiredOutcome, successMetric: result.fields.successMetric,
    executiveSummary: narrative.executiveSummary, expectedValue: narrative.expectedValue,
    risks: narrative.risks, recommendedNextStep: narrative.nextSteps,
  });
  result.executiveSummary = narrative.executiveSummary;
  return result;
}

export function initialNarrative(draft: InterviewDraft, ai?: ReviewAIResult | null): ReviewNarrative {
  const stored = {
    executiveSummary: draft.executiveSummary ?? draft.canvas.executiveSummary ?? "",
    expectedValue: draft.canvas.expectedValue,
    risks: draft.canvas.risks,
    nextSteps: draft.canvas.recommendedNextStep ?? "",
  };
  // Never regenerate an edited private draft, including deliberately cleared fields.
  if (draft.review?.editedAt) return stored;
  return synthesizeBriefNarrative({ draft, aiResult: ai });
}

/** Merges review edits back into the private-draft shape used by autosave/resume. */
export function mergeReviewIntoDraft(
  draft: InterviewDraft, fields: InitiativeDraftFields, scoring: ScoringComponents, n: ReviewNarrative,
  review: InitiativeReviewMetadata = draft.review ?? {},
): InterviewDraft {
  return {
    ...draft, fields, scoring, executiveSummary: n.executiveSummary,
    canvas: {
      ...draft.canvas, executiveSummary: n.executiveSummary,
      problem: fields.problemStatement, currentProcess: fields.currentProcess,
      desiredOutcome: fields.desiredOutcome, successMetric: fields.successMetric,
      aiOpportunity: fields.aiConcept, prototypeGoal: fields.prototypeGoal,
      expectedValue: n.expectedValue, risks: n.risks, recommendedNextStep: n.nextSteps,
    },
    review: { ...draft.review, ...review, editedAt: new Date().toISOString() },
  };
}

/** Core Initiative fields remain separate from the reviewed semantic brief. */
export interface SaveExtras { critical?: string[]; discovery?: string[]; facts?: string[]; candidates?: string[] }
export function serializeForSave(
  fields: InitiativeDraftFields, n: ReviewNarrative, _extras: SaveExtras = {},
): { fields: InitiativeDraftFields; executiveSummary: string } {
  return {
    fields: { ...fields, desiredOutcome: fields.desiredOutcome },
    executiveSummary: n.executiveSummary.trim(),
  };
}

/** Patch the supplemental narrative only; never copy stale brief core fields into Initiative columns. */
export function editReviewedSupplement(brief: InitiativeBrief, values: {
  expectedValue: string; risks: string; nextSteps: string; candidateMeasures: string;
  criticalUnknowns: string; discoveryUnknowns: string; supportingFacts: string;
}): InitiativeBrief {
  const split = (value: string) => value.split("\n").map(s => s.trim()).filter(Boolean);
  return {
    ...brief,
    expectedValue: { ...brief.expectedValue, qualitative: { ...brief.expectedValue.qualitative, text: values.expectedValue, source: "reviewed" } },
    risks: { text: values.risks, source: "reviewed" },
    nextSteps: { text: values.nextSteps, source: "reviewed" },
    successMeasures: { ...brief.successMeasures, candidates: split(values.candidateMeasures).map(text => ({ text, source: "reviewed" as const })) },
    unknowns: [
      ...split(values.criticalUnknowns).map(text => ({ text, priority: "critical" as const })),
      ...split(values.discoveryUnknowns).map(text => ({ text, priority: "discovery" as const })),
    ],
    supportingContext: { ...brief.supportingContext,
      facts: split(values.supportingFacts).map(value =>
        brief.supportingContext.facts.find(f => f.value === value) ?? { category: "Supporting context", value, source: "user" as const }),
    },
  };
}

export function buildReviewBrief(args: {
  draft: InterviewDraft; fields: InitiativeDraftFields; scoring: ScoringComponents;
  narrative: ReviewNarrative; ai: ReviewAIResult | null; jiraKey?: string;
  score: number; priority: string; readiness?: string;
  confirmedZeroFields?: InitiativeReviewMetadata["confirmedZeroFields"]; generatedAt?: string;
}): InitiativeBrief {
  const { draft, fields, scoring, narrative, ai } = args;
  const unknowns = prioritizeUnknowns((ai?.unknowns ?? []).filter(item =>
    !(narrative.risks && /^(?:risks need confirmation|risks (?:unknown|not (?:yet )?known))\.?$/i.test(item)) &&
    !(narrative.expectedValue && /^(?:qualitative )?value (?:unknown|not (?:yet )?established)\.?$/i.test(item))));
  return buildInitiativeBrief({
    draft: {
      fields, executiveSummary: narrative.executiveSummary,
      canvas: { expectedValue: narrative.expectedValue, risks: narrative.risks, recommendedNextStep: narrative.nextSteps },
      score: args.score, priority: args.priority,
      detectedCategoryLabel: draft.detectedCategoryLabel,
      scoring: { ...scoring },
    },
    // Edited narrative is authoritative; do not let original AI text override it.
    aiResult: ai ? { knownFacts: ai.knownFacts, inferredSuggestions: ai.inferredSuggestions, unknowns: ai.unknowns } : null,
    jira: args.jiraKey ? { jiraIssueKey: args.jiraKey } : null,
    ...(args.generatedAt ? { generatedAt: args.generatedAt } : {}),
    review: {
      criticalUnknowns: unknowns.critical, discoveryUnknowns: unknowns.discovery,
      candidateSuccessMeasures: candidateMeasures(draft, ai),
      confirmedZeroFields: args.confirmedZeroFields ?? [],
      ...(args.readiness ? { readiness: args.readiness } : {}),
    },
  });
}
