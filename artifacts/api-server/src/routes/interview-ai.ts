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
  : data.nextQuestion.trim().length > 0);

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
Choose ONE highest-value unanswered business question, understandable to a nontechnical employee. Ask for only ONE piece of information; do not combine two asks with "and". Acknowledge supplied context where helpful. Do not re-ask already answered facts: qualitative frequency IS frequency, though approximate request volume may still be unknown. Do not default to technical architecture or assume AI is the solution. Treat skips and "not known yet" as unknown, not as facts, and do not repeatedly press for them.
Complete when enough information exists for a useful initiative, typically after 4-7 questions, sooner for well-described ideas. Never ask filler questions. Skipped/unknown facts need not be asked repeatedly. At 12 answers ALWAYS complete. When complete, nextQuestion must be empty; otherwise provide one question. Suggested title should be concise and professional, not a truncated quote. Draft concise existing business fields; value can be "Value not yet quantified". Leave unknown fields blank rather than fabricate.`;

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

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
  infer: (request: AiRequest) => Promise<{ data?: unknown }>,
  onInvalid: (attempt: number, category: string) => void = () => {},
  maxAttempts = 2,
): Promise<Output | null> {
  const messages = buildInterviewMessages(input);
  if (!messages) return null;
  const userText = input.turns.map(t => t.answer).join("\n");
  const jiraText = input.jira ? `${input.jira.summary}\n${input.jira.description}` : "";
  // Retry malformed structured output, including SDK invalid_response. Never
  // replay transient failures or paid inference on transport/availability errors.
  for (let attempt = 0; attempt < Math.min(Math.max(1, maxAttempts), 2); attempt++) {
    let result: { data?: unknown };
    try {
      result = await infer({
        instruction, messages, schema,
        feature: "guided-interview-v2", maxOutputTokens: 2048,
      });
    } catch (error) {
      if (error instanceof PlatformServiceError && error.code === "invalid_response") {
        onInvalid(attempt + 1, "sdk_invalid_response");
        continue;
      }
      throw error;
    }
    const output = outputSchema.safeParse(result.data);
    if (!output.success) {
      const fields = [...new Set(output.error.issues.map(issue => String(issue.path[0] ?? "root")))].sort().join(",");
      onInvalid(attempt + 1, `output_schema:${fields}`);
      continue;
    }
    const data = sanitizeOutput(output.data, userText, jiraText);
    if (unsupportedQuantities(data.nextQuestion, `${userText}\n${jiraText}`)) {
      onInvalid(attempt + 1, "question_unsupported_quantity");
      continue;
    }
    if (input.turns.length >= 12 && !data.interviewComplete) {
      onInvalid(attempt + 1, "safety_max");
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
  try {
    const data = await advanceInterview(parsed.data, request => getPlatform().ai.generateStructured(request),
      (attempt, category) => req.log.warn({ durationMs: Date.now() - started, attempt, category, validationFailure: true }, "Interview response validation failed"));
    if (data) {
      req.log.info({ durationMs: Date.now() - started, questionsAsked: turns.length, complete: data.interviewComplete, fallback: false }, "Interview AI succeeded");
      res.json(data);
      return;
    }
    req.log.warn({ durationMs: Date.now() - started, questionsAsked: turns.length, fallback: true, validationFailure: true }, "Interview AI fallback");
    res.status(503).json({ error: "Guided interview temporarily unavailable" });
  } catch (error) {
    req.log.warn({ durationMs: Date.now() - started, questionsAsked: turns.length, fallback: true,
      code: error instanceof PlatformServiceError ? error.code : "unavailable" }, "Interview AI fallback");
    res.status(503).json({ error: "Guided interview temporarily unavailable" });
  }
});

export default router;