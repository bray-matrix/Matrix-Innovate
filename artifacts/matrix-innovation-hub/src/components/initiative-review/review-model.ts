// Pure view-model helpers for the v1.6.4 document-first Initiative Review.
// No network, no scoring changes. Safe to unit test in node.
import {
  buildInitiativeBrief,
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
  draft?: { expectedValue?: string; risks?: string; successMetric?: string };
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

const CRITICAL = /\b(owner|sponsor|budget|cost|saving|revenue|value|metric|measure|success|scope|deadline|compliance|risk|security|decision|approval|volume|baseline)\b/i;

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
  const critical = unique.filter(u => CRITICAL.test(u));
  const discovery = unique.filter(u => !CRITICAL.test(u));
  // Keep a meaningful critical list even without keyword matches.
  while (critical.length < 2 && discovery.length) critical.push(discovery.shift()!);
  return { critical: critical.slice(0, 4), discovery: discovery.slice(0, 3) };
}

/**
 * Candidate success measures are suggestions only. Anything carrying a
 * number is dropped so the page never presents an invented target.
 */
export function candidateMeasures(draft: InterviewDraft, ai: ReviewAIResult | null): string[] {
  const source = draft.review?.candidateSuccessMeasures
    ?? (ai?.inferredSuggestions ?? []).filter(s => /\b(measure|metric|track|rate|percentage|reduction|reduce|increase|time to|number of|share of)\b/i.test(s));
  const seen = new Set<string>();
  return source.map(concise).filter(s => {
    const key = s.toLowerCase();
    if (/\d|\$/.test(s) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

export function initialNarrative(draft: InterviewDraft): ReviewNarrative {
  return {
    executiveSummary: draft.executiveSummary ?? draft.canvas.executiveSummary ?? "",
    expectedValue: isPlaceholder(draft.canvas.expectedValue) ? "" : draft.canvas.expectedValue,
    risks: isPlaceholder(draft.canvas.risks) ? "" : draft.canvas.risks,
    nextSteps: draft.canvas.recommendedNextStep ?? "",
  };
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
  const unknowns = prioritizeUnknowns(ai?.unknowns ?? []);
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
