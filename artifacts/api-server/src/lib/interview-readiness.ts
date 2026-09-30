// Pure, deterministic intake assessment. This file has no server dependencies and
// can be mirrored by the browser without giving the model authority over scores.
export type InterviewFact = { category: string; value: string; evidence: string; source: "user" | "jira" };
export type InterviewContext = {
  turns: { question: string; answer: string }[];
  jira: { summary: string; description: string } | null;
  knownFacts?: InterviewFact[];
  unknowns?: string[];
};
export type ReadinessDimension = {
  key: string;
  label: string;
  weight: number;
  status: "known" | "partial" | "unknown" | "not_applicable" | "missing";
  points: number;
};
export type InterviewReadiness = { score: number; label: string; dimensions: ReadinessDimension[] };

const dimensions = [
  { key: "problem", label: "Problem / Opportunity", weight: 20, tags: /problem|opportunity|pain|challenge|issue/ },
  { key: "affected", label: "Who is Affected", weight: 12, tags: /affect|user|customer|client|employee|stakeholder|team|people/ },
  { key: "current", label: "Current State / Process", weight: 12, tags: /current|process|today|existing|workflow|manual/ },
  { key: "impact", label: "Business Impact", weight: 18, tags: /impact|value|cost|time|delay|error|risk|benefit|frequency|volume/ },
  { key: "outcome", label: "Desired Outcome", weight: 16, tags: /outcome|goal|desired|improv|success|result|future/ },
  { key: "urgency", label: "Importance / Urgency", weight: 10, tags: /urgent|priority|importance|deadline|timing|why now/ },
  { key: "constraints", label: "Constraints / Important Unknowns", weight: 12, tags: /constraint|unknown|dependency|limitation|risk|security|compliance|budget/ },
] as const;

const unknownPattern = /\b(?:i (?:do not|don't) know|not (?:known|sure|available)|unknown|cannot (?:say|estimate)|no data|not yet quantified|skip(?:ped)?)\b/i;
const naPattern = /\b(?:not applicable|n\/a|does not apply)\b/i;
const vague = /\b(?:it|this|things?|something|stuff|better|good|improve|need|should|yes|no|maybe|probably|business|idea|issue|problem|results?)\b/gi;
const signals: Record<string, RegExp> = {
  problem: /\b(?:struggl\w*|lack\w*|missing|unreliable|difficult\w*|cannot|can't|do not have|don't have|no reliable|delays?|errors?|duplicate\w*|inefficient|opportunity)\b/i,
  affected: /\b(?:customers?|clients?|employees?|users?|teams?|operations|staff|managers?|owners?|patients?|suppliers?|residents?|students?|departments?)\b/i,
  current: /\b(?:currently|today|manually|spreadsheets?|emails?|existing|now|forward\w*|copy|track\w*|process|workflow)\b/i,
  impact: /\b(?:delays?|wast\w*|hours?|costs?|errors?|risks?|frequent\w*|constantly|every|often|slow|missed|rework|lost|backlog|compliance)\b/i,
  outcome: /\b(?:want|goal|reduce|improve|enable|faster|less|more reliable|shared view|clearer|avoid|prevent|simplif\w*)\b/i,
  urgency: /\b(?:urgent|priority|deadline|now|critical|important|time.sensitive|this quarter|this year)\b/i,
  constraints: /\b(?:constraint\w*|risk|security|compliance|depend\w*|limited|budget|approval|restricted)\b/i,
};
function clauses(text: string): string[] {
  return text.split(/[.;\n]|\bbut\b|,\s*(?=(?:and|we|the|our|this|exact)\b)/i).map(s => s.trim()).filter(Boolean);
}
function substantive(text: string): boolean {
  const words = text.match(/[a-z]{2,}/gi) ?? [];
  const distinct = new Set(words.map(w => w.toLowerCase()).filter(w =>
    !/^(?:we|our|the|and|for|are|that|with|from|have|there|they|their|will|would|could|because|about)$/.test(w)));
  const specifics = text.replace(vague, "").match(/[a-z]{3,}/gi) ?? [];
  return words.length >= 5 && distinct.size >= 4 && specifics.length >= 2 &&
    !unknownPattern.test(text) && !naPattern.test(text);
}

export function calculateInterviewReadiness(context: InterviewContext): InterviewReadiness {
  const answers = context.turns.map(t => t.answer.trim());
  const userText = answers.join("\n");
  const jiraText = context.jira ? `${context.jira.summary}\n${context.jira.description}` : "";
  const factText = (context.knownFacts ?? []).filter(f => {
    const source = f.source === "user" ? userText : f.source === "jira" ? jiraText : "";
    return source.includes(f.evidence) && f.evidence.trim() === f.value.trim() &&
      f.evidence.trim().length <= 400 && !unknownPattern.test(f.evidence);
  });
  const notes = context.unknowns ?? [];
  const result: ReadinessDimension[] = dimensions.map(d => {
    const signal = signals[d.key];
    const fact = factText.some(f => d.tags.test(f.category) &&
      clauses(f.value).some(c => signal.test(c) && substantive(c)));
    const relevant = context.turns.flatMap(t => clauses(t.answer).filter(c =>
      signal.test(c) || d.tags.test(t.question)));
    const supported = relevant.some(c => signal.test(c) && substantive(c));
    const partial = relevant.some(c => !unknownPattern.test(c) && !naPattern.test(c) &&
      (signal.test(c) || substantive(c)) && c.replace(vague, "").match(/[a-z]{3,}/gi)?.length);
    const explicit = [...relevant, ...notes.filter(n => d.tags.test(n) || signal.test(n))]
      .some(n => unknownPattern.test(n) || naPattern.test(n));
    const notApplicable = [...relevant, ...notes.filter(n => d.tags.test(n) || signal.test(n))]
      .some(n => naPattern.test(n));
    const jiraSupported = d.key === "problem" && clauses(jiraText).some(c =>
      signal.test(c) && substantive(c));
    const status: ReadinessDimension["status"] = fact || supported ? "known"
      : jiraSupported || partial ? "partial" : explicit ? notApplicable ? "not_applicable" : "unknown" : "missing";
    const multiplier = status === "known" ? 1 : status === "partial" ? 0.65
      : status === "not_applicable" ? 0.65 : status === "unknown" ? 0.45 : 0;
    return { key: d.key, label: d.label, weight: d.weight, status, points: Math.round(d.weight * multiplier) };
  });
  const score = Math.min(100, result.reduce((sum, d) => sum + d.points, 0));
  const label = score >= 80 ? "Strong Business Context" : score >= 65 ? "Enough to Draft"
    : score >= 40 ? "Understanding the Opportunity" : "Building Context";
  return { score, label, dimensions: result };
}

export function missingCriticalContext(readiness: InterviewReadiness): string[] {
  return readiness.dimensions.filter(d => (["problem", "affected", "impact", "outcome"].includes(d.key) &&
    d.status === "missing") || (d.key === "problem" && d.status === "unknown")).map(d => d.label);
}

export function canDraft(readiness: InterviewReadiness): boolean {
  return readiness.score >= 65 && !readiness.dimensions.some(d =>
    (d.key === "problem" || d.key === "outcome") && d.status !== "known");
}

export function shouldContinueInterview(readiness: InterviewReadiness, answerCount: number,
  nextQuestionValue: "high" | "medium" | "low", critical = missingCriticalContext(readiness)): boolean {
  if (answerCount >= 12 || nextQuestionValue === "low") return false;
  // A user may choose Continue after early Draft becomes available, but only
  // genuinely high-value questions should survive this gate.
  if (canDraft(readiness)) return nextQuestionValue === "high" && readiness.score < 80;
  return critical.length > 0 || (readiness.score < 65 && nextQuestionValue === "high");
}