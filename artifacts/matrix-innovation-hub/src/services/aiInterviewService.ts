// AIInterviewService (v0.1.1)
// -----------------------------------------------------------------------------
// Placeholder service that SIMULATES a conversational AI innovation interview.
// It ships a fixed set of predefined questions and derives a draft Initiative,
// an Opportunity Canvas, an initial Innovation Score and an Executive Summary
// purely from the user's typed answers using deterministic heuristics.
//
// No OpenAI / network calls are made in v0.1.1. The async signatures and the
// artificial "thinking" delays are intentional so the UI (typing indicator,
// processing state) behaves exactly as it will once a real model is wired in.
// Swap the bodies of `respond()` and `generateDraft()` for real API calls later.

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
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "idea",
    prompt: "Tell me about your idea.",
    hint: "A sentence or two is perfect — what are you imagining?",
    placeholder: "e.g. An assistant that drafts responses to routine customer emails...",
  },
  {
    id: "problem",
    prompt: "What business problem are you solving?",
    hint: "What's painful, slow, costly, or error-prone today?",
    placeholder: "e.g. Agents spend hours each day writing near-identical replies...",
  },
  {
    id: "who",
    prompt: "Who experiences this problem?",
    hint: "Teams, roles, customers — whoever feels the pain.",
    placeholder: "e.g. The customer service team and, indirectly, waiting customers...",
  },
  {
    id: "today",
    prompt: "How is the work done today?",
    hint: "Walk me through the current process, tools, and hand-offs.",
    placeholder: "e.g. Agents read each email, search the knowledge base, then type a reply...",
  },
  {
    id: "loss",
    prompt: "Approximately how much time or money is lost?",
    hint: "A rough estimate is fine — hours per month, dollars, or both.",
    placeholder: "e.g. Roughly 400 hours a month, around $60,000 a year in labor...",
  },
  {
    id: "success",
    prompt: "What would success look like?",
    hint: "Describe the outcome and how you'd measure it.",
    placeholder: "e.g. Reply time cut in half with quality kept high...",
  },
  {
    id: "ai",
    prompt: "How could AI help?",
    hint: "Your best guess — we'll refine it together.",
    placeholder: "e.g. Generate a draft reply from the email and our knowledge base...",
  },
  {
    id: "prototype",
    prompt: "What can realistically be proven within two weeks?",
    hint: "The smallest slice that would build confidence.",
    placeholder: "e.g. Draft replies for the top 3 request types on last month's emails...",
  },
  {
    id: "notes",
    prompt: "Anything else we should know?",
    hint: "Constraints, risks, data, stakeholders — optional but helpful.",
    placeholder: "e.g. Data lives in Zendesk; compliance must review customer-facing text...",
  },
];

const ACKNOWLEDGEMENTS: string[] = [
  "Got it — that's a promising starting point.",
  "Understood. Framing the problem clearly makes everything easier.",
  "Thanks — knowing who is affected helps us size the impact.",
  "That's helpful context on the current process.",
  "Noted. Quantifying the loss strengthens the business case.",
  "Great — a clear definition of success keeps us honest.",
  "Interesting angle on where AI can add value.",
  "Perfect — a focused two-week goal is exactly right.",
  "Thank you. I have everything I need to prepare your draft.",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Maps how "rich" an answer is (by length) onto a 0..max scale.
function richness(answer: string, max: number): number {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const ratio = Math.min(1, words / 25);
  return clamp(max * (0.4 + 0.6 * ratio), 0, max);
}

function hasAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

// Pulls plausible numbers out of the "time or money lost" answer.
function parseLoss(answer: string): {
  hours: number;
  revenue: number;
  costSavings: number;
} {
  const lower = answer.toLowerCase();
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
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

function toTitle(idea: string): string {
  const cleaned = idea.trim().replace(/^(i want to|we want to|a |an |the )/i, "");
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

// key mirrors INTERVIEW_QUESTIONS ids
type AnswerMap = Record<string, string>;

function deriveScoring(a: AnswerMap, loss: ReturnType<typeof parseLoss>): ScoringComponents {
  const businessValue = clamp(
    12 + richness(`${a.idea} ${a.problem}`, 13),
    0,
    25,
  );
  const revenuePotential = loss.revenue > 0 ? clamp(9 + richness(a.loss, 6), 0, 15) : clamp(richness(a.success, 8), 0, 15);
  const costSavingsScore =
    loss.hours > 0 || loss.costSavings > 0
      ? clamp(9 + richness(a.loss, 6), 0, 15)
      : clamp(richness(a.loss, 9), 0, 15);
  const customerImpactScore = hasAny(a.who, ["customer", "client", "member", "patient", "user"])
    ? clamp(9 + richness(a.who, 6), 0, 15)
    : clamp(richness(a.who, 9), 0, 15);
  const strategicAlignment = clamp(6 + richness(a.success, 4), 0, 10);
  const aiReadinessScore = hasAny(`${a.today} ${a.notes}`, ["data", "system", "database", "crm", "records", "history"])
    ? clamp(6 + richness(a.ai, 4), 0, 10)
    : clamp(richness(a.ai, 7), 0, 10);
  const prototypeConfidence = clamp(5 + richness(a.prototype, 5), 0, 10);

  const complexityHeavy = hasAny(`${a.ai} ${a.notes}`, ["integrat", "real-time", "realtime", "legacy", "multiple systems", "custom model", "fine-tune"]);
  const technicalComplexityPenalty = complexityHeavy ? -6 : -3;

  const riskHeavy = hasAny(`${a.notes} ${a.who}`, ["compliance", "regulat", "privacy", "pii", "legal", "security", "sensitive"]);
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

function buildFields(a: AnswerMap, loss: ReturnType<typeof parseLoss>): InitiativeDraftFields {
  const problemStatement = a.who
    ? `${a.problem.trim()}\n\nWho is affected: ${a.who.trim()}`
    : a.problem.trim();
  const desiredOutcome = a.notes
    ? `${a.success.trim()}\n\nAdditional notes: ${a.notes.trim()}`
    : a.success.trim();

  return {
    title: toTitle(a.idea),
    department: "",
    category: "",
    submitterName: "",
    businessOwner: "",
    executiveSponsor: "",
    problemStatement,
    currentProcess: a.today.trim(),
    desiredOutcome,
    aiConcept: a.ai.trim() || a.idea.trim(),
    prototypeGoal: a.prototype.trim(),
    successMetric: firstSentence(a.success) || a.success.trim(),
    estimatedHoursSavedMonthly: loss.hours,
    estimatedRevenueOpportunity: loss.revenue,
    estimatedCostSavings: loss.costSavings,
    customerImpact: "Medium",
    complianceRisk: hasAny(a.notes, ["compliance", "regulat", "privacy", "legal", "security"]) ? "High" : "Medium",
    technicalComplexity: "Medium",
    aiReadiness: "Medium",
  };
}

function buildExecutiveSummary(fields: InitiativeDraftFields, score: number, priority: string): string {
  const value: string[] = [];
  if (fields.estimatedHoursSavedMonthly > 0)
    value.push(`~${fields.estimatedHoursSavedMonthly} hours/month`);
  if (fields.estimatedRevenueOpportunity > 0)
    value.push(`$${fields.estimatedRevenueOpportunity.toLocaleString()} revenue opportunity`);
  if (fields.estimatedCostSavings > 0)
    value.push(`$${fields.estimatedCostSavings.toLocaleString()} in potential savings`);
  const valueText = value.length ? ` Early estimates point to ${value.join(", ")}.` : "";

  return (
    `${fields.title} proposes to use AI to address a clear operational problem: ` +
    `${firstSentence(fields.problemStatement).replace(/\n/g, " ")} ` +
    `The concept is to ${fields.aiConcept.charAt(0).toLowerCase()}${fields.aiConcept.slice(1)}`.replace(/\.?$/, ".") +
    `${valueText} A two-week prototype would aim to ${fields.prototypeGoal.charAt(0).toLowerCase()}${fields.prototypeGoal.slice(1)}`.replace(/\.?$/, ".") +
    ` Based on the interview, this initiative scores ${score}/100 (${priority} priority).`
  );
}

function buildCanvas(fields: InitiativeDraftFields, score: number, priority: string, summary: string): OpportunityCanvas {
  const valueParts: string[] = [];
  if (fields.estimatedHoursSavedMonthly > 0)
    valueParts.push(`${fields.estimatedHoursSavedMonthly} hrs/mo saved`);
  if (fields.estimatedRevenueOpportunity > 0)
    valueParts.push(`$${fields.estimatedRevenueOpportunity.toLocaleString()} revenue opportunity`);
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

export const AIInterviewService = {
  getQuestions(): InterviewQuestion[] {
    return INTERVIEW_QUESTIONS;
  },

  getIntro(): string {
    return (
      "Hi! I'm your AI Innovation guide. I'll ask you a few short questions, one " +
      "at a time, and then turn your answers into a structured initiative — complete " +
      "with an Opportunity Canvas and an initial Innovation Score. There are no wrong " +
      "answers; a rough idea is enough to start. Let's begin."
    );
  },

  // Simulates the model acknowledging an answer before asking the next question.
  async respond(questionIndex: number): Promise<string> {
    await delay(650 + Math.random() * 500);
    return ACKNOWLEDGEMENTS[questionIndex] ?? "Thank you.";
  },

  // Simulates the model synthesizing all answers into a structured draft.
  async generateDraft(answers: AnswerMap): Promise<InterviewDraft> {
    await delay(1400);
    const loss = parseLoss(answers.loss ?? "");
    const fields = buildFields(answers, loss);
    const scoring = deriveScoring(answers, loss);
    const score = computeScore(scoring);
    const priority = derivePriority(score);
    const executiveSummary = buildExecutiveSummary(fields, score, priority);
    const canvas = buildCanvas(fields, score, priority, executiveSummary);
    return { fields, scoring, canvas, executiveSummary, score, priority };
  },
};
