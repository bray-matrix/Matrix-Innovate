import { Router, type IRouter } from "express";
import { z } from "zod";
import { createPlatformClient, PlatformServiceError } from "@workspace/matrix-sdk";
import {
  calculateInterviewReadiness, canDraft, missingCriticalContext, shouldContinueInterview,
  type InterviewFact, type InterviewContext,
} from "../lib/interview-readiness";

type AiRequest = Parameters<ReturnType<typeof createPlatformClient>["ai"]["generateStructured"]>[0];
type Metadata = { requestId?: string; provider?: string; model?: string; durationMs?: number; usage?: {
  inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null;
} };
type Failure = { path: string; constraint: string; retry: boolean; durationMs: number; sdkError?: PlatformServiceError };
const router: IRouter = Router();
const factShape = z.object({
  category: z.string(), value: z.string(), evidence: z.string(), source: z.enum(["user", "jira"]),
}).strict();
const factSchema = factShape.extend({
  category: z.string().max(100), value: z.string().min(1).max(400), evidence: z.string().min(1).max(400),
});
export const inputSchema = z.object({
  turns: z.array(z.object({ question: z.string().max(600), answer: z.string().max(1000) }).strict()).min(1).max(12),
  jira: z.object({ summary: z.string().max(500), description: z.string().max(4000) }).strict().nullable(),
  knownFacts: z.array(factSchema).max(24).optional(),
}).strict();
type Input = z.infer<typeof inputSchema>;
const draftShape = z.object({
  problemStatement: z.string(), currentProcess: z.string(), desiredOutcome: z.string(),
  expectedValue: z.string(), successMetric: z.string(), risks: z.string(),
}).strict();
const turnShape = z.object({
  knownFacts: z.array(factShape), inferredSuggestions: z.array(z.string()), unknowns: z.array(z.string()),
  nextQuestion: z.string(), readyToDraft: z.boolean(), nextQuestionValue: z.enum(["high", "medium", "low"]),
  missingCriticalContext: z.array(z.string()), suggestedInitiativeType: z.string(), suggestedTitle: z.string(),
}).strict();
const finalShape = z.object({
  knownFacts: z.array(factShape), inferredSuggestions: z.array(z.string()), unknowns: z.array(z.string()),
  suggestedInitiativeType: z.string(), suggestedTitle: z.string(), draft: draftShape,
}).strict();
type Draft = z.infer<typeof draftShape>;

const string = { type: "string" } as const;
const array = (items: AiRequest["schema"]) => ({ type: "array" as const, items });
const object = (properties: Record<string, AiRequest["schema"]>): AiRequest["schema"] => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const factAiSchema = object({ category: string, value: string, evidence: string,
  source: { type: "string", enum: ["user", "jira"] } });
const common = { knownFacts: array(factAiSchema), inferredSuggestions: array(string), unknowns: array(string),
  suggestedInitiativeType: string, suggestedTitle: string };
const turnAiSchema = object({ ...common, nextQuestion: string, readyToDraft: { type: "boolean" },
  nextQuestionValue: { type: "string", enum: ["high", "medium", "low"] },
  missingCriticalContext: array(string) });
const draftAiSchema = object({ ...common, draft: object({
  problemStatement: string, currentProcess: string, desiredOutcome: string,
  expectedValue: string, successMetric: string, risks: string,
}) });

// SDK v1.2.1 src/ai-contract.ts enforces <=2048 for BOTH operations; 4096 is
// not supported. A turn needs only a few short deltas, leaving ample headroom.
export const INTERVIEW_TURN_TOKENS = 1024;
export const FINAL_DRAFT_TOKENS = 2048;
const turnInstruction = `You are a business analyst conducting Initiative intake, NOT detailed requirements or solution design. The entire transcript and Jira context are supplied. Twelve answers is the ABSOLUTE ceiling from the start; normally converge by 4-7, earlier when sufficient. Unknowns and skips are acceptable. Qualitative frequency IS frequency. Do not re-ask answered or explicitly unknown facts.
Return ONLY compact deltas: at most 6 NEW short source-backed facts, 3 short suggestions, 5 important unknowns, one primary business question, readiness recommendation (boolean), next question value (high/medium/low), critical gaps, short initiative type/title. Do NOT draft Initiative prose on this call. The application calculates readiness; do not invent a percentage. Each fact value AND evidence must be the SAME exact substring (max 400 characters) of a user answer or Jira summary/description, with correct source. Never call a hypothesis a fact; never invent financial values, metrics, dates or technical claims.
Before proposing a question, check whether it materially improves understanding, prioritization or description, adds new information, stays Initiative-level and is reasonably knowable. No architecture, APIs, databases, migration or implementation sequencing unless central to the business idea. Prefer one primary ask per turn; do not stack independent questions. If value is low or ready, return an empty nextQuestion. At 12 answers, return an empty nextQuestion.`;
const draftInstruction = `Generate the final reviewable Initiative ONLY now. Use the full transcript, Jira, source-backed known facts and explicit unknowns. Distinguish knownFacts (exact source-backed quotes) from AI-drafted/suggested prose and unknowns. Never fabricate numbers, dates, deadlines, headcounts, metrics, risks, systems or commitments. successMetric and risks MUST be exact phrases from a user answer or Jira context that explicitly describe that metric or risk; otherwise leave those fields blank and include the gap in unknowns. Other draft prose is AI-drafted language for user review, NOT known facts. Leave unsupported draft fields blank; expectedValue may be "Value not yet quantified". Keep draft concise and business-level, not solution architecture. Return at most 24 most relevant facts, 8 suggestions and 12 unknowns.`;

let platform: ReturnType<typeof createPlatformClient> | undefined;
function getPlatform() {
  if (!platform) platform = createPlatformClient({
    platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
    applicationId: process.env.PLATFORM_APPLICATION_ID ?? "",
    applicationSecret: process.env.PLATFORM_APPLICATION_SECRET ?? "",
  });
  return platform;
}
const safeLabel = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,120}$/.test(value) ? value : undefined;
export function safePlatformErrorMetadata(error: unknown) {
  if (!(error instanceof PlatformServiceError)) return { code: "unavailable" };
  return { code: error.code, requestId: safeLabel(error.requestId),
    status: Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599 ? error.status : undefined };
}
function safeMetadata(metadata: Metadata) {
  const tokens = metadata.usage;
  const safeNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
  return { requestId: safeLabel(metadata.requestId), provider: safeLabel(metadata.provider),
    model: safeLabel(metadata.model), platformDurationMs: safeNumber(metadata.durationMs),
    inputTokens: safeNumber(tokens?.inputTokens), outputTokens: safeNumber(tokens?.outputTokens),
    totalTokens: safeNumber(tokens?.totalTokens) };
}
const withinLimits = (instruction: string, messages: AiRequest["messages"]) =>
  instruction.length <= 8000 && messages.length > 0 && messages.length <= 30 &&
  messages.every(m => m.content.length > 0 && m.content.length <= 8000) &&
  instruction.length + messages.reduce((n, m) => n + m.content.length, 0) <= 24000;
// Preserve every accepted answer; refuse oversize rather than silently truncating.
export function buildInterviewMessages(input: Input, operation: "turn" | "draft" = "turn"): AiRequest["messages"] | null {
  const messages: AiRequest["messages"] = [];
  if (input.jira) messages.push({ role: "user", content: JSON.stringify({ jira: input.jira }) });
  input.turns.forEach((t, i) => messages.push({ role: "user",
    content: JSON.stringify({ sequence: i + 1, question: t.question, answer: t.answer }) }));
  const facts = sanitizeFacts(input.knownFacts ?? [], input, 24, false);
  if (facts.length) messages.push({ role: "user", content: JSON.stringify({ knownFacts: facts }) });
  return withinLimits(operation === "turn" ? turnInstruction : draftInstruction, messages) ? messages : null;
}
const unsupportedQuantities = (text: string, source: string) =>
  (text.match(/(?:[$€£]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:%|\b(?:percent|dollars?|USD|million|billion)\b))/gi) ?? [])
    .some(quantity => !source.includes(quantity));
// Claims with specific figures or dates must occur verbatim in supplied
// context; sharing an isolated number with an unrelated source sentence is
// not sufficient support. Other prose remains AI-drafted, never a known fact.
const specificClaim = /\b\d+(?:[.,/-]\d+)*(?:st|nd|rd|th)?\b|\b(?:by|before|in|during)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:next|this|end of|the end of)\s+(?:week|month|quarter|year|monday|tuesday|wednesday|thursday|friday)\b|\b(?:by|before)\s+(?:monday|tuesday|wednesday|thursday|friday)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|dozen|hundred)\s+(?:\w+\s+){0,2}(?:staff|people|employees|hires|contractors|users|days|weeks|months|years|hours|requests|applications)\b/i;
function unsupportedSpecificClaims(text: string, source: string): boolean {
  const lowerSource = source.toLowerCase();
  return text.split(/[.!?;\n]/).some(clause =>
    specificClaim.test(clause) && !lowerSource.includes(clause.trim().toLowerCase()));
}
const riskTerms = /\b(?:risks?|secur\w*|complian\w*|privac\w*|breach\w*|fraud\w*|expos\w*|audit\w*|regulat\w*|unsafe|disrupt\w*|downtime|lawsuits?)\b|\bdata loss\b/gi;
function unsupportedRiskClaims(text: string, source: string): boolean {
  const words = text.match(riskTerms) ?? [];
  const sourceLower = source.toLowerCase();
  return words.some(word => !sourceLower.includes(word.toLowerCase()));
}
function groundedDraftField(text: string, source: string, field: "successMetric" | "risks"): boolean {
  const value = text.trim();
  if (value.length < 10 || !source.toLowerCase().includes(value.toLowerCase()) ||
    /\b(?:unknown|not known|not sure|not quantified|skip)\b/i.test(value)) return false;
  return field === "successMetric"
    ? /\b(?:metric|measure|target|goal|rate|count|time|volume|number|reduc\w*|improv\w*|faster|fewer|accuracy|completion)\b/i.test(value)
    : /\b(?:risk|security|compliance|privacy|breach|fraud|expos\w*|audit|regulat\w*|unsafe|disrupt\w*|downtime|error|missed|delay)\b/i.test(value);
}
function sanitizeFacts(facts: InterviewFact[], input: Input, max: number, deltasOnly: boolean) {
  const user = input.turns.map(t => t.answer).join("\n");
  const jira = input.jira ? `${input.jira.summary}\n${input.jira.description}` : "";
  const previous = new Set((deltasOnly ? sanitizeFacts(input.knownFacts ?? [], input, 24, false) : [])
    .map(f => `${f.source}:${f.evidence.toLowerCase()}`));
  const seen = new Set<string>();
  return facts.flatMap(f => {
    const category = f.category.trim(), evidence = f.evidence.trim(), value = f.value.trim();
    const key = `${f.source}:${evidence.toLowerCase()}`;
    if (!category || category.length > 100 || !evidence || evidence.length > 400 ||
      !value || value.length > 400 || !(f.source === "user" ? user : jira).includes(evidence) ||
      /^(?:skip|not known yet|unknown|nothing to add)$/i.test(evidence) ||
      seen.has(key) || (deltasOnly && previous.has(key))) return [];
    seen.add(key);
    return [{ category, value: evidence, evidence, source: f.source }];
  }).slice(0, max);
}
function bounded(values: string[], max: number, count: number) {
  return values.map(s => s.trim()).filter(s => s.length > 0 && s.length <= max).slice(0, count);
}
function extract<T>(raw: unknown, shape: z.ZodType<T>, operation: "turn" | "draft", input: Input): T | null {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data as Record<string, any>;
  const source = `${input.turns.map(t => t.answer).join("\n")}\n${input.jira?.summary ?? ""}\n${input.jira?.description ?? ""}`;
  const result: Record<string, any> = {
    ...data, knownFacts: sanitizeFacts(data.knownFacts, input, operation === "turn" ? 6 : 24, operation === "turn"),
    inferredSuggestions: bounded(data.inferredSuggestions, operation === "turn" ? 180 : 500,
      operation === "turn" ? 3 : 8).filter(s => !unsupportedQuantities(s, source) &&
        !unsupportedSpecificClaims(s, source) && !unsupportedRiskClaims(s, source)),
    unknowns: bounded(data.unknowns, 200, operation === "turn" ? 5 : 12),
    suggestedInitiativeType: data.suggestedInitiativeType.trim().slice(0, 80),
    suggestedTitle: data.suggestedTitle.trim().length <= 140 &&
      !unsupportedQuantities(data.suggestedTitle, source) &&
      !unsupportedSpecificClaims(data.suggestedTitle, source) &&
      !unsupportedRiskClaims(data.suggestedTitle, source) ? data.suggestedTitle.trim() : "",
  };
  if (operation === "turn") {
    result.nextQuestion = data.nextQuestion.trim();
    if (result.nextQuestion.length > 350 || unsupportedQuantities(result.nextQuestion, source) ||
      unsupportedSpecificClaims(result.nextQuestion, source)) return null;
    result.missingCriticalContext = bounded(data.missingCriticalContext, 100, 4);
  } else {
    const draft: Draft = { ...data.draft };
    for (const key of Object.keys(draft) as (keyof Draft)[]) {
      const s = draft[key].trim(), max = ["expectedValue", "successMetric", "risks"].includes(key) ? 1200 : 2500;
      draft[key] = s.length <= max && !unsupportedQuantities(s, source) &&
        !unsupportedSpecificClaims(s, source) && !unsupportedRiskClaims(s, source) &&
        (key !== "successMetric" && key !== "risks" ||
          groundedDraftField(s, source, key)) ? s
        : key === "expectedValue" ? "Value not yet quantified" : "";
    }
    if (!draft.successMetric && !result.unknowns.includes("Success metric not established")) {
      result.unknowns = [...result.unknowns.slice(0, 11), "Success metric not established"];
    }
    if (!draft.risks && !result.unknowns.includes("Risks need confirmation")) {
      result.unknowns = [...result.unknowns.slice(0, 11), "Risks need confirmation"];
    }
    result.draft = draft;
  }
  return result as T;
}
function context(input: Input, facts: InterviewFact[] = [], unknowns: string[] = []): InterviewContext {
  return { ...input, knownFacts: [...sanitizeFacts(input.knownFacts ?? [], input, 24, false), ...facts], unknowns };
}
function questionSafe(question: string, input: Input): boolean {
  if (!question.trim() || input.turns.some(t => t.question.trim().toLowerCase() === question.trim().toLowerCase())) return false;
  const frequencyKnown = input.turns.some(t =>
    /(?:frequent|constantly|regularly|often|every (?:day|week|month)|daily|weekly|monthly)/i.test(t.answer));
  const frequencyUnknown = input.turns.some(t =>
    /(?:i don't know|not known|unknown|not sure|skip)/i.test(t.answer) &&
    /(?:how many|volume|count|number|frequency|how often)/i.test(t.question));
  return !((frequencyKnown || frequencyUnknown) &&
      /(?:how many|volume|count|number|frequency|how often)/i.test(question)) &&
    !/\b(?:api|database|architecture|migration|implementation sequencing|tables?|schema)\b/i.test(question) &&
    !/(?:which specific applications?.*first|implementation phases?|technical design)/i.test(question);
}
function deterministicQuestion(readiness: ReturnType<typeof calculateInterviewReadiness>, input: Input): string {
  const candidates: Record<string, string[]> = {
    problem: ["What problem or opportunity should this Initiative address?",
      "What specifically is not working today?"],
    affected: ["Who is most affected by this issue?", "Which people or teams experience this issue?"],
    impact: ["What effect does this issue have on the business or its users?",
      "What kind of delay, error, or risk does this create?"],
    outcome: ["What would improve if this Initiative succeeds?", "What would change for the people affected?"],
    current: ["How is this handled today?"], urgency: ["Why is this important now?"],
    constraints: ["Is there a key limitation or unknown we should note?"],
  };
  return readiness.dimensions.filter(d => d.status === "missing")
    .flatMap(d => candidates[d.key] ?? []).find(q => questionSafe(q, input)) ?? "";
}
function state(input: Input, data?: z.infer<typeof turnShape>) {
  const readiness = calculateInterviewReadiness(context(input, data?.knownFacts, data?.unknowns));
  const missing = missingCriticalContext(readiness);
  const value = data?.nextQuestionValue ?? "high";
  const continueQuestion = !data?.readyToDraft &&
    shouldContinueInterview(readiness, input.turns.length, value, missing);
  // Deterministic convergence overrides an AI request to keep interviewing.
  const question = continueQuestion
    ? (data?.nextQuestion && questionSafe(data.nextQuestion, input) ? data.nextQuestion
      : deterministicQuestion(readiness, input)) : "";
  return {
    knownFacts: data?.knownFacts ?? [], inferredSuggestions: data?.inferredSuggestions ?? [],
    unknowns: data?.unknowns ?? [], nextQuestion: question,
    interviewComplete: !question, readyToDraft: canDraft(readiness) || input.turns.length >= 12 || !question,
    nextQuestionValue: question ? value : "low" as "high" | "medium" | "low",
    missingCriticalContext: missing, readiness,
    suggestedInitiativeType: data?.suggestedInitiativeType ?? "", suggestedTitle: data?.suggestedTitle ?? "",
  };
}
export function fallbackInterview(input: Input) { return state(input); }
const emptyDraft = (): Draft => ({
  problemStatement: "", currentProcess: "", desiredOutcome: "",
  expectedValue: "Value not yet quantified", successMetric: "", risks: "",
});
export function fallbackDraft(input: Input) {
  const readiness = calculateInterviewReadiness(context(input));
  const answers = input.turns.map(t => t.answer.trim()).filter(s => s && !/\b(?:skip|i don't know|unknown)\b/i.test(s));
  return {
    draft: { ...emptyDraft(), problemStatement: answers[0] ?? input.jira?.summary ?? "",
      currentProcess: input.turns.find(t => /current|today|process/i.test(t.question) &&
        !/\b(?:skip|i don't know|unknown)\b/i.test(t.answer))?.answer ?? "",
      desiredOutcome: input.turns.find(t => /outcome|goal|want/i.test(t.question) &&
        !/\b(?:skip|i don't know|unknown)\b/i.test(t.answer))?.answer ?? "" },
    knownFacts: sanitizeFacts(input.knownFacts ?? [], input, 24, false), inferredSuggestions: [] as string[],
    unknowns: [...missingCriticalContext(readiness), "Success metric not established",
      "Risks need confirmation"], suggestedInitiativeType: "", suggestedTitle: "",
    readiness,
  };
}
async function inferOperation<T>(
  input: Input, operation: "turn" | "draft", infer: (request: AiRequest) => Promise<{ data?: unknown } & Metadata>,
  onInvalid: (attempt: number, category: string, details?: Failure) => void,
  maxAttempts: number, onMetadata: (metadata: Metadata, attempt: number) => void,
  onAttempt: (attempt: number) => void,
  shape: z.ZodType<T>,
): Promise<T | null> {
  const messages = buildInterviewMessages(input, operation);
  if (!messages) return null;
  const instruction = operation === "turn" ? turnInstruction : draftInstruction;
  let correction = "";
  for (let i = 0; i < Math.min(2, Math.max(1, maxAttempts)); i++) {
    const attempt = i + 1, full = instruction + correction;
    if (!withinLimits(full, messages)) return null;
    onAttempt(attempt);
    const started = Date.now();
    let result: { data?: unknown } & Metadata;
    try {
      result = await infer({ instruction: full, messages,
        schema: operation === "turn" ? turnAiSchema : draftAiSchema,
        feature: operation === "turn" ? "guided-interview-v2" : "guided-interview-draft",
        maxOutputTokens: operation === "turn" ? INTERVIEW_TURN_TOKENS : FINAL_DRAFT_TOKENS });
    } catch (error) {
      if (!(error instanceof PlatformServiceError) || error.code !== "invalid_response") {
        onInvalid(attempt, "sdk_failure", { path: "root", constraint: "sdk_failure",
          retry: false, durationMs: Date.now() - started,
          sdkError: error instanceof PlatformServiceError ? error : undefined });
        throw error;
      }
      onInvalid(attempt, "sdk_invalid_response", { path: "root", constraint: "sdk_invalid_response",
        retry: attempt < Math.min(2, maxAttempts), durationMs: Date.now() - started, sdkError: error });
      correction = "\nReturn the required closed JSON shape with all fields and no extra fields.";
      continue;
    }
    onMetadata(result, attempt);
    const parsed = extract(result.data, shape, operation, input);
    if (parsed) return parsed;
    const issue = shape.safeParse(result.data);
    const first = !issue.success ? issue.error.issues[0] : undefined;
    const path = first?.path.reduce<string>((s, key) => typeof key === "number" ? `${s}[${key}]`
      : `${s}${s ? "." : ""}${key}`, "") || (operation === "turn" ? "nextQuestion" : "root");
    const constraint = first?.code === "too_big" || first?.code === "too_small"
      ? `${first.code}:${first.type}:${first.code === "too_big" ? first.maximum : first.minimum}`
      : first?.code ?? "unsupported_content";
    onInvalid(attempt, `output_schema:${path}`, { path, constraint,
      retry: attempt < Math.min(2, maxAttempts), durationMs: Date.now() - started });
    correction = `\nPrevious response failed validation at ${path} (${constraint}). Correct it; preserve exact evidence.`;
  }
  return null;
}
export async function advanceInterview(input: Input,
  infer: (request: AiRequest) => Promise<{ data?: unknown } & Metadata>,
  onInvalid: (attempt: number, category: string, details?: Failure) => void = () => {},
  maxAttempts = 2, onMetadata: (metadata: Metadata, attempt: number) => void = () => {},
  onAttempt: (attempt: number) => void = () => {},
) {
  // Never spend inference on question 13. Not even an SDK error can reopen it.
  if (input.turns.length >= 12) return fallbackInterview(input);
  try {
    const output = await inferOperation(input, "turn", infer, onInvalid, maxAttempts,
      onMetadata, onAttempt, turnShape);
    return state(input, output ?? undefined);
  } catch {
    return fallbackInterview(input);
  }
}
export async function generateInterviewDraft(input: Input,
  infer: (request: AiRequest) => Promise<{ data?: unknown } & Metadata>,
  onInvalid: (attempt: number, category: string, details?: Failure) => void = () => {},
  maxAttempts = 2, onMetadata: (metadata: Metadata, attempt: number) => void = () => {},
  onAttempt: (attempt: number) => void = () => {},
) {
  try {
    const output = await inferOperation(input, "draft", infer, onInvalid, maxAttempts,
      onMetadata, onAttempt, finalShape);
    if (!output) return fallbackDraft(input);
    return { ...output, knownFacts: [...sanitizeFacts(input.knownFacts ?? [], input, 24, false), ...output.knownFacts].slice(0, 24),
      readiness: calculateInterviewReadiness(context(input, output.knownFacts, output.unknowns)) };
  } catch {
    return fallbackDraft(input);
  }
}
function route(operation: "turn" | "draft") {
  return async (req: Parameters<IRouter["post"]>[1] extends (...args: infer A) => any ? A[0] : never,
    res: Parameters<IRouter["post"]>[1] extends (...args: infer A) => any ? A[1] : never) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid interview context" }); return; }
    if (!buildInterviewMessages(parsed.data, operation)) {
      if (parsed.data.turns.length >= 12) {
        req.log.warn({ feature: operation === "turn" ? "guided-interview-v2" : "guided-interview-draft",
          questionsAsked: 12, fallback: true, outcome: "context_over_budget" },
        "Interview context exceeds AI service limit; drafting without inference");
        res.json(operation === "turn" ? fallbackInterview(parsed.data) : fallbackDraft(parsed.data));
        return;
      }
      res.status(400).json({ error: "Interview context exceeds the AI service limit" }); return;
    }
    const started = Date.now(), feature = operation === "turn" ? "guided-interview-v2" : "guided-interview-draft";
    let metadata: ReturnType<typeof safeMetadata> | Record<string, never> = {}, errorMetadata = {};
    let attempts = 0, invalid = false;
    const onInvalid = (attempt: number, category: string, details?: Failure) => {
      invalid = true;
      errorMetadata = details?.sdkError ? safePlatformErrorMetadata(details.sdkError) : {};
      req.log.warn({ feature, ...metadata, ...errorMetadata, attempt, category, fieldPath: details?.path,
        constraint: details?.constraint, durationMs: details?.durationMs, retryOccurred: details?.retry ?? false,
        validationFailure: true }, "Interview AI validation failed");
    };
    const onAttempt = (attempt: number) => { attempts = attempt; metadata = {}; errorMetadata = {}; invalid = false; };
    const infer = (request: AiRequest) => getPlatform().ai.generateStructured(request);
    const capture = (m: Metadata) => { metadata = safeMetadata(m); };
    const data = operation === "turn"
      ? await advanceInterview(parsed.data, infer, onInvalid, 2, capture, onAttempt)
      : await generateInterviewDraft(parsed.data, infer, onInvalid, 2, capture, onAttempt);
    req.log.info({ feature, ...metadata, ...errorMetadata, durationMs: Date.now() - started,
      attempt: attempts, retryOccurred: attempts > 1, questionsAsked: parsed.data.turns.length,
      complete: operation === "draft" || ("interviewComplete" in data && data.interviewComplete),
      fallback: attempts === 0 || invalid, outcome: attempts === 0 || invalid ? "fallback" : "ai" },
    "Interview operation completed");
    res.json(data);
  };
}
router.post("/interview/advance", route("turn"));
router.post("/interview/draft", route("draft"));
export default router;