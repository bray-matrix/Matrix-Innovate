// aiInterviewService (v0.1.3)
// -----------------------------------------------------------------------------
// The scoring + draft "model" library for the AI Innovation Interview.
//
// This module is intentionally free of any *decision logic* (which questions to
// ask, how to classify an initiative). That lives in `interviewEngine.ts` so a
// future OpenAI integration can replace the engine without touching the scoring
// model, which mirrors the authoritative server-side computation in
// `artifacts/api-server/src/lib/scoring.ts`.
//
// No OpenAI / network calls are made. The helpers here are deterministic
// heuristics driven purely by the user's typed answers.

export interface InterviewQuestion {
  id: string;
  prompt: string;
  hint: string;
  placeholder: string;
}

export interface ScoringComponents {
  businessValue: number;
  revenuePotential: number;
  costSavingsScore: number;
  customerImpactScore: number;
  strategicAlignment: number;
  aiReadinessScore: number;
  prototypeConfidence: number;
  technicalComplexityPenalty: number;
  riskPenalty: number;
}

export interface InitiativeDraftFields {
  title: string;
  department: string;
  category: string;
  submitterName: string;
  businessOwner: string;
  executiveSponsor: string;
  problemStatement: string;
  currentProcess: string;
  desiredOutcome: string;
  aiConcept: string;
  prototypeGoal: string;
  successMetric: string;
  estimatedHoursSavedMonthly: number;
  estimatedRevenueOpportunity: number;
  estimatedCostSavings: number;
  customerImpact: string;
  complianceRisk: string;
  technicalComplexity: string;
  aiReadiness: string;
}

export const REQUIRED_INITIATIVE_FIELDS = [
  "title", "department", "category", "submitterName", "problemStatement",
] as const satisfies readonly (keyof InitiativeDraftFields)[];

export function validateInitiativeDraft(
  fields: InitiativeDraftFields,
  departments: string[],
  categories: string[],
): Partial<Record<(typeof REQUIRED_INITIATIVE_FIELDS)[number], string>> {
  const errors: Partial<Record<(typeof REQUIRED_INITIATIVE_FIELDS)[number], string>> = {};
  for (const key of REQUIRED_INITIATIVE_FIELDS) {
    if (!fields[key].trim()) errors[key] = "This field is required.";
  }
  // An admin category suggestion can be a nonempty string without matching
  // an actual option. Radix then renders an empty trigger; treat it as invalid.
  if (!departments.length)
    errors.department = "Departments could not be loaded. Please try again.";
  else if (!errors.department && !departments.includes(fields.department))
    errors.department = "Select a department from the list.";
  if (!categories.length)
    errors.category = "Categories could not be loaded. Please try again.";
  else if (!errors.category && !categories.includes(fields.category))
    errors.category = "Select a category from the list.";
  return errors;
}

export interface OpportunityCanvas {
  executiveSummary: string;
  problem: string;
  currentProcess: string;
  desiredOutcome: string;
  aiOpportunity: string;
  expectedValue: string;
  prototypeGoal: string;
  successMetric: string;
  risks: string;
  recommendedNextStep: string;
}

export interface InterviewDraft {
  fields: InitiativeDraftFields;
  scoring: ScoringComponents;
  canvas: OpportunityCanvas;
  executiveSummary: string;
  score: number;
  priority: string;
  // Populated by the interview engine's classifier (display-only; not persisted).
  detectedCategory: string;
  detectedCategoryLabel: string;
}

// Answers are keyed by question id (see interviewEngine.ts), so the service is
// agnostic to how many questions were asked or in what order.
export type AnswerMap = Record<string, string>;

import { withBase } from "../lib/base-path";

// Unfinished interviews are server-owned and scoped to the Matrix session.
// Never put interview answers or Jira context in origin-wide localStorage.
export interface PrivateInterviewDraft<State> {
  id: string;
  state: State;
  revision: number;
}

// SPA navigation can unmount a composer before its final save completes.
// A new instance for the same Matrix subject must wait for that write before
// reading /active. No interview content or identity is persisted to storage.
const pendingSaves = new Map<string, Promise<void>>();
export function trackInterviewSave(owner: string, operation: Promise<void>): void {
  pendingSaves.set(owner, operation);
  void operation.finally(() => {
    if (pendingSaves.get(owner) === operation) pendingSaves.delete(owner);
  }).catch(() => {});
}
export async function waitForInterviewSave(owner: string): Promise<void> {
  await pendingSaves.get(owner);
}

async function interviewRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(withBase(`/api/interview${path}`), {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || `Interview request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const privateInterview = {
  active: <T>() => interviewRequest<{ draft: PrivateInterviewDraft<T> | null }>("/drafts/active"),
  create: <T>(state: T) => interviewRequest<PrivateInterviewDraft<T>>("/drafts", "POST", { state }),
  save: <T>(draft: PrivateInterviewDraft<T>, state: T) =>
    interviewRequest<PrivateInterviewDraft<T>>(`/drafts/${encodeURIComponent(draft.id)}`, "PUT", { state, revision: draft.revision }),
  discard: (id: string) => interviewRequest<unknown>(`/drafts/${encodeURIComponent(id)}`, "DELETE"),
  complete: (id: string, initiativeId: number) =>
    interviewRequest<unknown>(`/drafts/${encodeURIComponent(id)}/complete`, "POST", { initiativeId }),
};

// Planner positions can restart at fallback (or skip a known field). Count
// submitted user turns from the retained transcript, not the current question.
export function countTranscriptAnswers(messages: readonly { role: "ai" | "user"; text: string }[]): number {
  return messages.filter(message => message.role === "user" && message.text.trim() !== "(nothing to add)").length;
}

// Completion arrives after the final answer was submitted. The review button
// must not replace that answer with the now-empty/disabled composer.
export function answersForReview(answers: AnswerMap, questionId: string, input: string, readyToReview: boolean): AnswerMap {
  return readyToReview ? answers : { ...answers, [questionId]: input.trim() };
}

// Lightweight description of the detected initiative category, passed in by the
// engine so the scoring/draft heuristics can factor it in.
export interface CategorySignal {
  category: string;
  label: string;
  suggestedInitiativeCategory: string;
}

const CORE_IDS = new Set([
  "idea",
  "problem",
  "loss",
  "success",
  "ai",
  "prototype",
  "notes",
  "frequency",
  "deadline",
  "category_detail",
  "jiraIssueId",
]);

export function isCoreQuestion(id: string): boolean {
  return CORE_IDS.has(id);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Maps how "rich" an answer is (by length) onto a 0..max scale.
function richness(answer: string, max: number): number {
  const words = (answer ?? "").trim().split(/\s+/).filter(Boolean).length;
  const ratio = Math.min(1, words / 25);
  return clamp(max * (0.4 + 0.6 * ratio), 0, max);
}

function hasAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

// Extract only explicitly framed potential savings/opportunity. Current loss
// or effort is not automatically an achievable saving. All figures remain
// user estimates for review; the server remains authoritative for scoring.
export function parseLoss(answer: string): {
  hours: number;
  revenue: number;
  costSavings: number;
} {
  const lower = (answer ?? "").toLowerCase();
  let hours = 0;
  const hoursMatch = lower.match(/(\d[\d,]*)\s*(hours?|hrs?)\s*(?:per|a|\/)\s*month\b/);
  if (hoursMatch && /\b(?:sav(?:e|ed|ing|ings?)|reduc(?:e|ed|ing)|free(?:d)? up)\b/.test(lower))
    hours = Number(hoursMatch[1].replace(/,/g, ""));

  const moneyMatches = lower.match(/\$\s*(\d[\d,]*(\.\d+)?)(\s*[kmb])?/g) || [];
  const moneyValues = moneyMatches.map((m) => {
    const raw = m.replace(/[$\s,]/g, "").toLowerCase();
    if (raw.endsWith("k")) return Number(raw.slice(0, -1)) * 1_000;
    if (raw.endsWith("m")) return Number(raw.slice(0, -1)) * 1_000_000;
    if (raw.endsWith("b")) return Number(raw.slice(0, -1)) * 1_000_000_000;
    return Number(raw);
  });

  const revenue = /\b(?:revenue opportunity|additional revenue|increase(?:d)? revenue|new sales|sales opportunity|revenue growth)\b/.test(lower)
    ? Math.max(0, ...(moneyValues.length ? moneyValues : [0]))
    : 0;
  const costSavings = moneyValues.length &&
    /\b(?:cost savings?|savings?|sav(?:e|ed|ing)|reduc(?:e|ed|ing) costs?|cost reduction)\b/.test(lower)
    ? Math.max(...moneyValues) : 0;

  return {
    hours,
    revenue,
    costSavings: revenue && moneyValues.length === 1 ? 0 : costSavings,
  };
}

function firstSentence(text: string): string {
  const trimmed = (text ?? "").trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

export function toTitle(idea: string): string {
  const sentence = (idea ?? "").trim().split(/[.!?\n]/)[0]
    .replace(/^(?:i think |i'd like to |i want to |we want to |we need to |please |request to |idea to |the idea is to |can we |could we )/i, "")
    .replace(/^(?:build|create|develop|implement|improve|streamline|establish|make)\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+(?:that|which|so that|in order to|because|where|by)\b.*$/i, "")
    .replace(/^(?:centralized|shared|automated|new)\s+/i, (match) => match)
    .trim();
  // Prefer a complete noun phrase before a purpose clause, never cut mid-word/sentence.
  const phrase = sentence.split(/\s+(?:to help|to support|for the purpose of|in order to)\s+/i)[0]
    .replace(/[,:;.\s]+$/, "");
  const candidate = phrase.split(/\s+/).length > 9
    ? phrase.split(/\s+(?:for|across|with|through|using|from)\s+/i)[0]
    : phrase;
  const result = candidate.split(/\s+/).length > 9 ? "Business Process Improvement" : candidate;
  return result ? result.replace(/\b[a-z][a-z]+\b/gi, w =>
    ["and", "of", "for", "the", "in", "to", "with"].includes(w.toLowerCase())
      ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)) : "New Business Initiative";
}

export function computeScore(c: ScoringComponents): number {
  const positive =
    clamp(c.businessValue, 0, 25) +
    clamp(c.revenuePotential, 0, 15) +
    clamp(c.costSavingsScore, 0, 15) +
    clamp(c.customerImpactScore, 0, 15) +
    clamp(c.strategicAlignment, 0, 10) +
    clamp(c.aiReadinessScore, 0, 10) +
    clamp(c.prototypeConfidence, 0, 10);
  const penalties =
    Math.min(0, c.technicalComplexityPenalty) + Math.min(0, c.riskPenalty);
  return Math.max(0, Math.min(100, positive + penalties));
}

export function derivePriority(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 65) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

type Loss = ReturnType<typeof parseLoss>;

function deriveScoring(
  a: AnswerMap,
  loss: Loss,
  contextText: string,
  signal: CategorySignal,
): ScoringComponents {
  const idea = a.idea ?? "";
  const problem = a.problem ?? "";
  const success = a.success ?? "";
  const all = `${Object.values(a).join(" ")} ${contextText}`;

  const businessValue = clamp(12 + richness(`${idea} ${problem}`, 13), 0, 25);
  const revenuePotential =
    loss.revenue > 0
      ? clamp(9 + richness(`${a.loss ?? ""} ${contextText}`, 6), 0, 15)
      : 0;
  const costSavingsScore =
    loss.hours > 0 || loss.costSavings > 0
      ? clamp(9 + richness(a.loss ?? "", 6), 0, 15)
      : 0;
  const customerImpactScore = hasAny(all, [
    "customer",
    "client",
    "member",
    "patient",
    "user",
  ])
    ? clamp(9 + richness(all, 6), 0, 15)
    : clamp(richness(all, 6), 0, 15);
  const strategicAlignment = clamp(6 + richness(success, 4), 0, 10);
  const aiReadinessScore = hasAny(all, [
    "data",
    "system",
    "database",
    "crm",
    "records",
    "history",
    "api",
  ])
    ? clamp(6 + richness(a.notes ?? "", 4), 0, 10)
    : clamp(richness(success, 7), 0, 10);
  const prototypeConfidence = clamp(5 + richness(`${success} ${a.category_detail ?? ""}`, 5), 0, 10);

  const complexityHeavy =
    hasAny(all, [
      "integrat",
      "real-time",
      "realtime",
      "legacy",
      "multiple systems",
      "custom model",
      "fine-tune",
    ]) ||
    signal.category === "Technology" ||
    signal.category === "Production";
  const technicalComplexityPenalty = complexityHeavy ? -6 : -3;

  const riskHeavy =
    hasAny(all, [
      "compliance",
      "regulat",
      "privacy",
      "pii",
      "legal",
      "security",
      "sensitive",
      "hipaa",
      "soc2",
      "pci",
    ]) || signal.category === "Compliance";
  const riskPenalty = riskHeavy ? -5 : -2;

  return {
    businessValue,
    revenuePotential,
    costSavingsScore,
    customerImpactScore,
    strategicAlignment,
    aiReadinessScore,
    prototypeConfidence,
    technicalComplexityPenalty,
    riskPenalty,
  };
}

function buildFields(
  a: AnswerMap,
  loss: Loss,
  contextText: string,
  signal: CategorySignal,
): InitiativeDraftFields {
  const idea = (a.idea ?? "").trim();
  const problem = (a.problem ?? "").trim();
  const success = (a.success ?? "").trim();
  const notes = (a.notes ?? "").trim();
  const all = `${Object.values(a).join(" ")} ${contextText}`;

  const desiredOutcome = notes
    ? `${success}\n\nAdditional notes: ${notes}`
    : success;

  return {
    title: toTitle(idea || problem),
    department: "",
    category: signal.suggestedInitiativeCategory,
    submitterName: "",
    businessOwner: "",
    executiveSponsor: "",
    problemStatement: problem,
    currentProcess: [problem, contextText.trim(), a.frequency ? `Frequency: ${a.frequency}` : ""].filter(Boolean).join("\n\n"),
    desiredOutcome,
    aiConcept: (a.ai ?? "").trim(),
    prototypeGoal: (a.prototype ?? "").trim(),
    successMetric: firstSentence(success) || success,
    estimatedHoursSavedMonthly: loss.hours,
    estimatedRevenueOpportunity: loss.revenue,
    estimatedCostSavings: loss.costSavings,
    customerImpact: hasAny(all, ["customer", "client", "patient", "member"])
      ? "High"
      : "Medium",
    complianceRisk:
      signal.category === "Compliance" ||
      hasAny(all, [
        "compliance",
        "regulat",
        "privacy",
        "legal",
        "security",
        "hipaa",
        "soc2",
        "pci",
      ])
        ? "High"
        : "Medium",
    technicalComplexity:
      signal.category === "Technology" ||
      signal.category === "Production" ||
      hasAny(all, ["integrat", "legacy", "real-time", "realtime"])
        ? "High"
        : "Medium",
    aiReadiness: hasAny(all, ["data", "database", "api", "system", "crm"])
      ? "High"
      : "Medium",
  };
}

function buildExecutiveSummary(
  fields: InitiativeDraftFields,
  signal: CategorySignal,
  score: number,
  priority: string,
): string {
  const value: string[] = [];
  if (fields.estimatedHoursSavedMonthly > 0)
    value.push(`~${fields.estimatedHoursSavedMonthly} hours/month`);
  if (fields.estimatedRevenueOpportunity > 0)
    value.push(
      `$${fields.estimatedRevenueOpportunity.toLocaleString()} revenue opportunity`,
    );
  if (fields.estimatedCostSavings > 0)
    value.push(`$${fields.estimatedCostSavings.toLocaleString()} in potential savings`);
  const valueText = value.length
    ? ` Early estimates point to ${value.join(", ")}.`
    : "";

  const problem = firstSentence(fields.problemStatement).replace(/\n/g, " ");

  return (
    `Classified as a ${signal.label} initiative. ` +
    `${fields.title} addresses: ${problem || "a business opportunity to be clarified"}. ` +
    `${fields.desiredOutcome ? `Desired outcome: ${firstSentence(fields.desiredOutcome)}. ` : ""}` +
    `${valueText || " Value not yet quantified."}` +
    ` Based on the interview, this initiative scores ${score}/100 (${priority} priority).`
  );
}

function buildCanvas(
  fields: InitiativeDraftFields,
  score: number,
  priority: string,
  summary: string,
): OpportunityCanvas {
  const valueParts: string[] = [];
  if (fields.estimatedHoursSavedMonthly > 0)
    valueParts.push(`${fields.estimatedHoursSavedMonthly} hrs/mo saved`);
  if (fields.estimatedRevenueOpportunity > 0)
    valueParts.push(
      `$${fields.estimatedRevenueOpportunity.toLocaleString()} revenue opportunity`,
    );
  if (fields.estimatedCostSavings > 0)
    valueParts.push(`$${fields.estimatedCostSavings.toLocaleString()} cost savings`);

  return {
    executiveSummary: summary,
    problem: fields.problemStatement,
    currentProcess: fields.currentProcess,
    desiredOutcome: fields.desiredOutcome,
    aiOpportunity: fields.aiConcept,
    expectedValue: valueParts.length
      ? `Estimated ${valueParts.join(", ")}.`
       : "Value not yet quantified.",
    prototypeGoal: fields.prototypeGoal,
    successMetric: fields.successMetric,
    risks: `Compliance: ${fields.complianceRisk}. Complexity: ${fields.technicalComplexity}.`,
    recommendedNextStep:
      priority === "Critical" || priority === "High"
        ? `Fast-track to review — ${priority} priority (score ${score}/100) warrants prompt sponsor attention.`
        : `Advance to review and refine scoring — currently ${priority} priority (score ${score}/100).`,
  };
}

// Synthesizes all answers into a structured, reviewable draft. `contextText`
// holds the formatted category-specific Q&A gathered by the engine, and
// `signal` carries the detected category so the heuristics can factor it in.
export function buildDraft(
  answers: AnswerMap,
  contextText: string,
  signal: CategorySignal,
): InterviewDraft {
  const loss = parseLoss(answers.loss ?? "");
  const fields = buildFields(answers, loss, contextText, signal);
  const scoring = deriveScoring(answers, loss, contextText, signal);
  const score = computeScore(scoring);
  const priority = derivePriority(score);
  const executiveSummary = buildExecutiveSummary(fields, signal, score, priority);
  const canvas = buildCanvas(fields, score, priority, executiveSummary);
  return {
    fields,
    scoring,
    canvas,
    executiveSummary,
    score,
    priority,
    detectedCategory: signal.category,
    detectedCategoryLabel: signal.label,
  };
}
