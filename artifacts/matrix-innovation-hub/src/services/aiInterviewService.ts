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

// Pulls plausible numbers out of the "time or money lost" answer.
export function parseLoss(answer: string): {
  hours: number;
  revenue: number;
  costSavings: number;
} {
  const lower = (answer ?? "").toLowerCase();
  const numbers = (lower.match(/\d[\d,]*(\.\d+)?/g) || []).map((n) =>
    Number(n.replace(/,/g, "")),
  );

  let hours = 0;
  const hoursMatch = lower.match(/(\d[\d,]*)\s*(hours?|hrs?)/);
  if (hoursMatch) hours = Number(hoursMatch[1].replace(/,/g, ""));

  const moneyMatches = lower.match(/\$\s*(\d[\d,]*(\.\d+)?)(\s*[kmb])?/g) || [];
  const moneyValues = moneyMatches.map((m) => {
    const raw = m.replace(/[$\s,]/g, "").toLowerCase();
    if (raw.endsWith("k")) return Number(raw.slice(0, -1)) * 1_000;
    if (raw.endsWith("m")) return Number(raw.slice(0, -1)) * 1_000_000;
    if (raw.endsWith("b")) return Number(raw.slice(0, -1)) * 1_000_000_000;
    return Number(raw);
  });

  const revenue = hasAny(lower, ["revenue", "sales", "growth", "upsell"])
    ? Math.max(0, ...(moneyValues.length ? moneyValues : [0]))
    : 0;
  const costSavings = moneyValues.length
    ? Math.max(...moneyValues)
    : numbers.length && !hours
      ? Math.max(...numbers)
      : 0;

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

function toTitle(idea: string): string {
  const cleaned = (idea ?? "")
    .trim()
    .replace(/^(i want to|we want to|a |an |the )/i, "");
  const words = cleaned.split(/\s+/).slice(0, 9).join(" ");
  const capped = words.charAt(0).toUpperCase() + words.slice(1);
  return capped.replace(/[.,;:!?]+$/, "") || "Untitled AI Initiative";
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
  const ai = a.ai ?? "";
  const prototype = a.prototype ?? "";
  const all = `${Object.values(a).join(" ")} ${contextText}`;

  const businessValue = clamp(12 + richness(`${idea} ${problem}`, 13), 0, 25);
  const revenuePotential =
    loss.revenue > 0 || signal.category === "Revenue Growth"
      ? clamp(9 + richness(`${a.loss ?? ""} ${contextText}`, 6), 0, 15)
      : clamp(richness(success, 8), 0, 15);
  const costSavingsScore =
    loss.hours > 0 || loss.costSavings > 0
      ? clamp(9 + richness(a.loss ?? "", 6), 0, 15)
      : clamp(richness(a.loss ?? "", 9), 0, 15);
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
    ? clamp(6 + richness(ai, 4), 0, 10)
    : clamp(richness(ai, 7), 0, 10);
  const prototypeConfidence = clamp(5 + richness(prototype, 5), 0, 10);

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
    title: toTitle(idea),
    department: "",
    category: signal.suggestedInitiativeCategory,
    submitterName: "",
    businessOwner: "",
    executiveSponsor: "",
    problemStatement: problem,
    currentProcess: contextText.trim(),
    desiredOutcome,
    aiConcept: (a.ai ?? "").trim() || idea,
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
    `${fields.title} proposes to use AI to address a clear business problem: ` +
    `${problem} ` +
    `The concept is to ${fields.aiConcept.charAt(0).toLowerCase()}${fields.aiConcept.slice(1)}`.replace(
      /\.?$/,
      ".",
    ) +
    `${valueText} A two-week prototype would aim to ${fields.prototypeGoal.charAt(0).toLowerCase()}${fields.prototypeGoal.slice(1)}`.replace(
      /\.?$/,
      ".",
    ) +
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
      : "Value to be quantified during the prototype.",
    prototypeGoal: fields.prototypeGoal,
    successMetric: fields.successMetric,
    risks: `Compliance: ${fields.complianceRisk}. Technical: ${fields.technicalComplexity}. Data readiness: ${fields.aiReadiness}.`,
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
