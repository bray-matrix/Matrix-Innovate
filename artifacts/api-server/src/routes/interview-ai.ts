import { Router, type IRouter } from "express";
import { z } from "zod";
import { createPlatformClient, PlatformServiceError } from "@workspace/matrix-sdk";

type AiRequest = Parameters<ReturnType<typeof createPlatformClient>["ai"]["generateStructured"]>[0];
const router: IRouter = Router();
const turnSchema = z.object({
  question: z.string().max(600),
  answer: z.string().max(1000),
}).strict();
export const inputSchema = z.object({
  turns: z.array(turnSchema).min(1).max(12),
  jira: z.object({
    summary: z.string().max(500),
    description: z.string().max(4000),
  }).strict().nullable(),
}).strict();

// The same closed schema is enforced by Platform and independently checked here.
const schema: AiRequest["schema"] = {
  type: "object",
  properties: {
    knownFacts: { type: "array", items: { type: "object", properties: {
      category: { type: "string" }, value: { type: "string" }, evidence: { type: "string" },
      source: { type: "string", enum: ["user", "jira"] },
    }, required: ["category", "value", "evidence", "source"], additionalProperties: false } },
    inferredSuggestions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    nextQuestion: { type: "string" },
    interviewComplete: { type: "boolean" },
    suggestedInitiativeType: { type: "string" },
    suggestedTitle: { type: "string" },
    draft: { type: "object", properties: {
      problemStatement: { type: "string" },
      currentProcess: { type: "string" },
      desiredOutcome: { type: "string" },
      expectedValue: { type: "string" },
      successMetric: { type: "string" },
      risks: { type: "string" },
    }, required: ["problemStatement", "currentProcess", "desiredOutcome", "expectedValue", "successMetric", "risks"], additionalProperties: false },
  },
  required: ["knownFacts", "inferredSuggestions", "unknowns", "nextQuestion", "interviewComplete", "suggestedInitiativeType", "suggestedTitle", "draft"],
  additionalProperties: false,
};

// SDK's closed schema supports shapes/enums but not string or collection bounds.
// Validate the whole shape before limiting optional collections: slicing first
// could hide a malformed item outside the retained range.
const structuralSchema = z.object({
  knownFacts: z.array(z.object({
    category: z.string(), value: z.string(), evidence: z.string(), source: z.enum(["user", "jira"]),
  }).strict()),
  inferredSuggestions: z.array(z.string()),
  unknowns: z.array(z.string()),
  nextQuestion: z.string(),
  interviewComplete: z.boolean(),
  suggestedInitiativeType: z.string(),
  suggestedTitle: z.string(),
  draft: z.object({
    problemStatement: z.string(), currentProcess: z.string(), desiredOutcome: z.string(),
    expectedValue: z.string(), successMetric: z.string(), risks: z.string(),
  }).strict(),
}).strict();

const outputSchema = z.object({
  knownFacts: z.array(z.object({
    category: z.string().max(100), value: z.string().min(1).max(700),
    evidence: z.string().min(1).max(400), source: z.enum(["user", "jira"]),
  }).strict()).max(30),
  inferredSuggestions: z.array(z.string().max(500)).max(12),
  unknowns: z.array(z.string().max(200)).max(15),
  nextQuestion: z.string().max(600),
  interviewComplete: z.boolean(),
  suggestedInitiativeType: z.string().max(80),
  suggestedTitle: z.string().max(140),
  draft: z.object({
    problemStatement: z.string().max(2500),
    currentProcess: z.string().max(2500),
    desiredOutcome: z.string().max(2500),
    expectedValue: z.string().max(1200),
    successMetric: z.string().max(1200),
    risks: z.string().max(1200),
  }).strict(),
}).strict().refine(data => data.interviewComplete
  ? data.nextQuestion === ""
  : data.nextQuestion.trim().length > 0, { path: ["nextQuestion"] });

function normalizeOutput(raw: unknown): unknown {
  const parsed = structuralSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const data = parsed.data;
  const trim = (text: string) => text.trim();
  // An overlong quote cannot be shortened without changing the asserted
  // evidence. Drop that optional fact rather than create a partial assertion.
  const knownFacts = data.knownFacts.flatMap(fact => {
    const category = trim(fact.category);
    const evidence = trim(fact.evidence);
    const value = trim(fact.value);
    return category.length <= 100 && evidence.length > 0 && evidence.length <= 400 &&
      value.length > 0 && value.length <= 700
      ? [{ ...fact, category, evidence, value }] : [];
  }).slice(0, 30);
  const bounded = (items: string[], max: number, count: number) =>
    items.map(trim).filter(item => item.length <= max).slice(0, count);
  const draft = Object.fromEntries(Object.entries(data.draft).map(([key, value]) => {
    const cleaned = trim(value);
    const max = ["expectedValue", "successMetric", "risks"].includes(key) ? 1200 : 2500;
    // Optional draft prose is not evidence: omit an oversized assertion
    // instead of persisting an arbitrary prefix that could invert its meaning.
    return [key, cleaned.length <= max ? cleaned : ""];
  })) as typeof data.draft;
  return {
    ...data, knownFacts,
    inferredSuggestions: bounded(data.inferredSuggestions, 500, 12),
    unknowns: bounded(data.unknowns, 200, 15),
    nextQuestion: data.interviewComplete ? data.nextQuestion : trim(data.nextQuestion),
    suggestedInitiativeType: trim(data.suggestedInitiativeType).length <= 80
      ? trim(data.suggestedInitiativeType) : "",
    suggestedTitle: trim(data.suggestedTitle).length <= 140 ? trim(data.suggestedTitle) : "",
    draft,
  };
}

let platform: ReturnType<typeof createPlatformClient> | undefined;
function getPlatform() {
  if (!platform) platform = createPlatformClient({
    platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
    applicationId: process.env.PLATFORM_APPLICATION_ID ?? "",
    applicationSecret: process.env.PLATFORM_APPLICATION_SECRET ?? "",
  });
  return platform;
}

const instruction = `You are Innovation Hub's careful business analyst. Use the ENTIRE interview and Jira context.
Extract the problem/opportunity, people affected, current process, pain, frequency/volume, business impact, desired outcome, urgency, constraints and existing Jira work where known. Unknown is acceptable.
Return knownFacts ONLY if each fact's value AND evidence are the same EXACT short quoted substring in a user answer or Jira summary/description. Label its source correctly. Put hypotheses only in inferredSuggestions, never in knownFacts. Draft fields are suggestions for review, not established facts; do not invent numbers, savings or commitments.
Choose ONE highest-value unanswered business question, understandable to a nontechnical employee. Prefer one primary ask per turn: do not stack independent questions, including lists of unrelated possible impacts. One short illustrative example is fine when it clarifies the ask; keep the question natural and adaptive, not a rigid questionnaire. Acknowledge supplied context where helpful. Do not re-ask already answered facts: qualitative frequency IS frequency, though approximate request volume may still be unknown. Do not default to technical architecture or assume AI is the solution. Treat skips and "not known yet" as unknown, not as facts, and do not repeatedly press for them.
Keep knownFacts evidence and value within 400 characters per exact quoted substring, category within 100 characters, and at most 30 facts. Keep suggestions within 500 characters (12 max), unknowns within 200 characters (15 max), nextQuestion within 600 characters, title within 140 characters, and draft prose concise. Never shorten a quote in a way that changes its meaning; omit an optional fact if no short exact quote supports it.
Complete when enough information exists for a useful initiative, typically after 4-7 questions, sooner for well-described ideas. Never ask filler questions. Skipped/unknown facts need not be asked repeatedly. At 12 answers ALWAYS complete. When complete, nextQuestion must be empty; otherwise provide one question. Suggested title should be concise and professional, not a truncated quote. Draft concise existing business fields; value can be "Value not yet quantified". Leave unknown fields blank rather than fabricate.`;

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;
type Metadata = { requestId?: string; provider?: string; model?: string; usage?: {
  inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null;
} };
type Failure = { path: string; constraint: string; retry: boolean; durationMs: number;
  sdkError?: PlatformServiceError };

// The SDK deliberately exposes only correlation, category and HTTP status on errors.
// Never serialize an Error: its message/cause may contain transport details.
const safeLabel = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,120}$/.test(value) ? value : undefined;
export function safePlatformErrorMetadata(error: unknown) {
  if (!(error instanceof PlatformServiceError)) return { code: "unavailable" };
  return {
    code: error.code,
    requestId: safeLabel(error.requestId),
    status: Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599
      ? error.status : undefined,
  };
}

function failureFor(issue: z.ZodIssue): { path: string; constraint: string } {
  const path = issue.path.reduce<string>((part, segment) =>
    typeof segment === "number" ? `${part}[${segment}]` : `${part}${part ? "." : ""}${segment}`, "") || "root";
  const constraint = issue.code === "too_big" || issue.code === "too_small"
    ? `${issue.code}:${issue.type}:${issue.code === "too_big" ? issue.maximum : issue.minimum}`
    : issue.code;
  return { path, constraint };
}

function feedback(failure: { path: string; constraint: string }): string {
  return `\nPrevious structured response failed local validation at ${failure.path} (${failure.constraint}). Return the same semantic result within that constraint. Preserve exact source-backed evidence; omit optional facts rather than shorten a quote misleadingly.`;
}

// Preserve every accepted turn verbatim. Platform limits each message to 8000
// characters and instruction + all messages to 24000, not merely the HTTP body.
export function buildInterviewMessages({ turns, jira }: Input): AiRequest["messages"] | null {
  const messages: AiRequest["messages"] = [];
  if (jira) messages.push({ role: "user", content: JSON.stringify({ jira }) });
  turns.forEach((turn, i) => messages.push({
    role: "user", content: JSON.stringify({ sequence: i + 1, question: turn.question, answer: turn.answer }),
  }));
  if (messages.length > 30 || messages.some(m => !m.content.length || m.content.length > 8000) ||
      instruction.length + messages.reduce((sum, m) => sum + m.content.length, 0) > 24000) return null;
  return messages;
}

function unsupportedQuantities(text: string, source: string): boolean {
  const quantities = text.match(/(?:[$€£]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:%|\b(?:percent|dollars?|USD|million|billion)\b))/gi) ?? [];
  return quantities.some(quantity => !source.includes(quantity));
}

// A valid-shaped model draft is still untrusted. Remove unsupported claims
// instead of making an otherwise useful interview fail due to one suggestion.
// Exact evidence is the only text permitted into the "supplied facts" section.
function sanitizeOutput(data: Output, userText: string, jiraText: string): Output {
  const source = `${userText}\n${jiraText}`;
  const draft = { ...data.draft };
  for (const key of Object.keys(draft) as (keyof Output["draft"])[]) {
    if (unsupportedQuantities(draft[key], source)) {
      draft[key] = key === "expectedValue" ? "Value not yet quantified" : "";
    }
  }
  return {
    ...data,
    knownFacts: data.knownFacts.flatMap(fact =>
      (fact.source === "user" ? userText : jiraText).includes(fact.evidence) &&
        !/^(?:skip|not known yet|unknown|nothing to add)$/i.test(fact.evidence.trim())
        ? [{ ...fact, value: fact.evidence }] : []),
    inferredSuggestions: data.inferredSuggestions.filter(item => !unsupportedQuantities(item, source)),
    suggestedTitle: unsupportedQuantities(data.suggestedTitle, source) ? "" : data.suggestedTitle,
    draft,
  };
}

export async function advanceInterview(
  input: Input,
  infer: (request: AiRequest) => Promise<{ data?: unknown } & Metadata>,
  onInvalid: (attempt: number, category: string, details?: Failure) => void = () => {},
  maxAttempts = 2,
  onMetadata: (metadata: Metadata, attempt: number) => void = () => {},
  onAttempt: (attempt: number) => void = () => {},
): Promise<Output | null> {
  const messages = buildInterviewMessages(input);
  if (!messages) return null;
  const userText = input.turns.map(t => t.answer).join("\n");
  const jiraText = input.jira ? `${input.jira.summary}\n${input.jira.description}` : "";
  // Retry malformed structured output, including SDK invalid_response. Never
  // replay transient failures or paid inference on transport/availability errors.
  const limit = Math.min(Math.max(1, maxAttempts), 2);
  let correction = "";
  for (let attempt = 0; attempt < limit; attempt++) {
    onAttempt(attempt + 1);
    const retryInstruction = instruction + correction;
    if (retryInstruction.length > 8000 ||
        retryInstruction.length + messages.reduce((sum, m) => sum + m.content.length, 0) > 24000) return null;
    const started = Date.now();
    let result: { data?: unknown } & Metadata;
    try {
      result = await infer({
        instruction: retryInstruction, messages, schema,
        feature: "guided-interview-v2", maxOutputTokens: 2048,
      });
    } catch (error) {
      if (error instanceof PlatformServiceError && error.code === "invalid_response") {
        correction = "\nPrevious response failed the required structured JSON shape. Return all required fields with the specified types and no extra fields.";
        onInvalid(attempt + 1, "sdk_invalid_response", {
          path: "root", constraint: "sdk_invalid_response", retry: attempt + 1 < limit,
          durationMs: Date.now() - started, sdkError: error,
        });
        continue;
      }
      throw error;
    }
    onMetadata(result, attempt + 1);
    const output = outputSchema.safeParse(normalizeOutput(result.data));
    if (!output.success) {
      const failure = failureFor(output.error.issues[0]);
      correction = feedback(failure);
      onInvalid(attempt + 1, `output_schema:${failure.path}`, {
        ...failure, retry: attempt + 1 < limit, durationMs: Date.now() - started,
      });
      continue;
    }
    const data = sanitizeOutput(output.data, userText, jiraText);
    if (unsupportedQuantities(data.nextQuestion, `${userText}\n${jiraText}`)) {
      correction = "\nPrevious nextQuestion contained an unsupported numeric claim. Ask a question without introducing unsupported numbers.";
      onInvalid(attempt + 1, "question_unsupported_quantity", {
        path: "nextQuestion", constraint: "unsupported_quantity", retry: attempt + 1 < limit,
        durationMs: Date.now() - started,
      });
      continue;
    }
    if (input.turns.length >= 12 && !data.interviewComplete) {
      correction = "\nThe interview has reached 12 answers. Set interviewComplete to true and nextQuestion to an empty string.";
      onInvalid(attempt + 1, "safety_max", {
        path: "interviewComplete", constraint: "safety_max", retry: attempt + 1 < limit,
        durationMs: Date.now() - started,
      });
      continue;
    }
    return data;
  }
  return null;
}

router.post("/interview/advance", async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid interview context" });
    return;
  }
  const { turns, jira } = parsed.data;
  if (!buildInterviewMessages(parsed.data)) {
    res.status(400).json({ error: "Interview context exceeds the AI service limit" });
    return;
  }
  const started = Date.now();
  // Metadata is supplied by the SDK, not the model body. Bound it before logging.
  let sdkMetadata: Record<string, unknown> = {};
  let failedSdkMetadata: Record<string, unknown> = {};
  let inferenceAttempt = 0;
  try {
    const data = await advanceInterview(parsed.data, request => getPlatform().ai.generateStructured(request),
      (attempt, category, details) => {
        failedSdkMetadata = details?.sdkError ? safePlatformErrorMetadata(details.sdkError) : {};
        req.log.warn({
          feature: "guided-interview-v2", ...sdkMetadata, ...failedSdkMetadata,
          attempt, category,
          fieldPath: details?.path, constraint: details?.constraint,
          durationMs: details?.durationMs, retryOccurred: details?.retry ?? false,
          validationFailure: true,
        }, "Interview response validation failed");
      }, 2,
      (metadata) => {
        sdkMetadata = {
          requestId: safeLabel(metadata.requestId),
          provider: safeLabel(metadata.provider),
          model: safeLabel(metadata.model),
          ...(metadata.usage ? {
            inputTokens: metadata.usage.inputTokens, outputTokens: metadata.usage.outputTokens,
            totalTokens: metadata.usage.totalTokens,
          } : {}),
        };
      }, (attempt) => {
        inferenceAttempt = attempt;
        sdkMetadata = {}; // A later attempt must never inherit an earlier response's ID.
        failedSdkMetadata = {};
      });
    if (data) {
      req.log.info({ feature: "guided-interview-v2", ...sdkMetadata, durationMs: Date.now() - started,
        attempt: inferenceAttempt, retryOccurred: inferenceAttempt > 1,
        questionsAsked: turns.length, complete: data.interviewComplete, fallback: false, outcome: "ai" }, "Interview AI succeeded");
      res.json(data);
      return;
    }
    req.log.warn({ feature: "guided-interview-v2", ...sdkMetadata, ...failedSdkMetadata,
      durationMs: Date.now() - started,
      attempt: inferenceAttempt, retryOccurred: inferenceAttempt > 1,
      questionsAsked: turns.length, fallback: true, outcome: "fallback", validationFailure: true }, "Interview AI fallback");
    res.status(503).json({ error: "Guided interview temporarily unavailable" });
  } catch (error) {
    req.log.warn({ feature: "guided-interview-v2", ...sdkMetadata, ...safePlatformErrorMetadata(error),
      durationMs: Date.now() - started, attempt: inferenceAttempt, retryOccurred: inferenceAttempt > 1,
      questionsAsked: turns.length, fallback: true, outcome: "fallback",
      category: error instanceof PlatformServiceError ? "sdk_failure" : "unavailable" }, "Interview AI fallback");
    res.status(503).json({ error: "Guided interview temporarily unavailable" });
  }
});

export default router;