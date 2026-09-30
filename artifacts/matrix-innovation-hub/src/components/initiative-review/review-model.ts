// Pure view-model helpers for the v1.6.4 document-first Initiative Review.
// No network, no scoring changes. Safe to unit test in node.
import {
  buildInitiativeBrief,
  classifyBriefUnknowns, synthesizeBriefNarrative, cleanBriefProse, potentialSuccessMeasures,
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
    const sourceOutcome = completed.knownFacts.filter(fact => /^(?:desiredOutcome|outcome|scope|governance)$/i.test(fact.category))
      .map(fact => fact.value).join(" ");
    result.fields.desiredOutcome = business.desiredOutcome.trim() || sourceOutcome || result.fields.desiredOutcome;
    // A baseline aspiration is not a grounded, user-established measure.
    result.fields.successMetric = business.successMetric.trim();
    result.canvas.expectedValue = business.expectedValue.trim() || "Value not yet quantified";
    result.canvas.risks = business.risks.trim() || "Risks not yet known.";
    result.executiveSummary = business.executiveSummary?.trim() || "";
  } else {
    result.canvas.risks = "Risks not yet known; review and add known considerations.";
  }
  const narrative = synthesizeBriefNarrative({ draft: result, aiResult: reviewResult, evidence });
  for (const key of ["problemStatement", "currentProcess", "desiredOutcome", "successMetric", "aiConcept", "prototypeGoal"] as const)
    result.fields[key] = cleanBriefProse(result.fields[key]);
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

/**
 * SAVE CONTRACT (no schema change):
 * - executiveSummary is sent separately (Initiative.executiveSummary column).
 * - Narrative without its own column is appended to `desiredOutcome` as
 *   labeled paragraphs ("Label: text"), blank-line separated, fixed order:
 *   expected value, risks, next steps, suggested measures, critical unknowns, discovery questions,
 *   supporting facts. Expected value / risks labels are unchanged from v1.6.3.
 */
export interface SaveExtras { critical?: string[]; discovery?: string[]; facts?: string[]; candidates?: string[] }
export function serializeForSave(
  fields: InitiativeDraftFields, n: ReviewNarrative, extras: SaveExtras = {},
): { fields: InitiativeDraftFields; executiveSummary: string } {
  const list = (items?: string[]) => (items ?? []).filter(Boolean).map(i => `- ${i}`).join("\n");
  const blocks: [string, string][] = [
    [SAVE_LABELS.expectedValue, n.expectedValue.trim()],
    [SAVE_LABELS.risks, n.risks.trim()],
    [SAVE_LABELS.nextSteps, n.nextSteps.trim()],
    [SAVE_LABELS.candidates, list(extras.candidates)],
    [SAVE_LABELS.criticalUnknowns, list(extras.critical)],
    [SAVE_LABELS.discovery, list(extras.discovery)],
    [SAVE_LABELS.facts, list(extras.facts)],
  ];
  const extra = blocks.filter(([, t]) => t && !isPlaceholder(t))
    .map(([label, t]) => t.startsWith("- ") ? `${label}:\n${t}` : `${label}: ${t}`);
  return {
    fields: { ...fields, desiredOutcome: [fields.desiredOutcome.trim(), ...extra].filter(Boolean).join("\n\n") },
    executiveSummary: n.executiveSummary.trim(),
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
