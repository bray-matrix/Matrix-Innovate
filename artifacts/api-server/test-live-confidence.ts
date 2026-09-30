// Opt-in, paid, read-only Shared AI replay. No transcript, prompt, response,
// credentials or Initiative persistence is logged or written.
// Run from workspace root:
// LIVE_SHARED_AI_VALIDATION=YES pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/test-live-confidence.ts
import { createPlatformClient } from "@workspace/matrix-sdk";
import {
  advanceInterview, generateInterviewDraft, safePlatformErrorMetadata,
  INTERVIEW_TURN_TOKENS, FINAL_DRAFT_TOKENS,
} from "./src/routes/interview-ai";
import type { InterviewFact } from "./src/lib/interview-readiness";

if (process.env.LIVE_SHARED_AI_VALIDATION !== "YES") {
  throw new Error("Explicit LIVE_SHARED_AI_VALIDATION=YES is required.");
}
if (!process.env.PLATFORM_APPLICATION_ID || !process.env.PLATFORM_APPLICATION_SECRET) {
  throw new Error("Existing Platform application trust is required.");
}
const client = createPlatformClient({
  platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
  applicationId: process.env.PLATFORM_APPLICATION_ID,
  applicationSecret: process.env.PLATFORM_APPLICATION_SECRET,
});
const answers = [
  "We do not have a reliable inventory of software applications used across the organization.",
  "Operations and IT staff track application ownership in separate spreadsheets and emails today.",
  "This causes access requests to be routed slowly and leaves ownership unclear for application reviews.",
  "It happens regularly across departments, but the exact number of applications is not known.",
  "We want a shared, trustworthy view of applications and responsible owners to reduce missed reviews.",
  "Security and compliance matter now; existing information is in spreadsheets and the service desk.",
  "Department representatives can confirm owners, though some historical records may remain unknown.",
];
type Input = Parameters<typeof advanceInterview>[0];
const input: Input = { turns: [], jira: null, knownFacts: [] };
const requests: Array<{ operation: string; requestId?: string; outputTokens?: number | null;
  inputTokens?: number | null; durationMs?: number }> = [];
const inference = (operation: string) => async (request: Parameters<typeof client.ai.generateStructured>[0]) => {
  const result = await client.ai.generateStructured(request);
  requests.push({ operation, requestId: result.requestId,
    outputTokens: result.usage?.outputTokens, inputTokens: result.usage?.inputTokens,
    durationMs: result.durationMs });
  return result;
};
const invalid = (attempt: number, category: string) => {
  console.info(JSON.stringify({ outcome: "validation_failure", attempt,
    category: /^[a-zA-Z0-9._:-]{1,120}$/.test(category) ? category : "invalid_response" }));
};
const report = (operation: string, data: { readiness: { score: number; label: string;
  dimensions: { key: string; status: string }[] }; interviewComplete?: boolean; readyToDraft?: boolean },
  answerCount: number) => {
  const request = requests.at(-1)?.operation === operation ? requests.at(-1) : undefined;
  console.info(JSON.stringify({ operation, answerCount, readiness: data.readiness.score,
    label: data.readiness.label,
    gaps: data.readiness.dimensions.filter(d => d.status === "missing").map(d => d.key),
    readyToDraft: data.readyToDraft, complete: data.interviewComplete,
    requestId: request?.requestId, inputTokens: request?.inputTokens,
    outputTokens: request?.outputTokens, durationMs: request?.durationMs }));
};
let failed = false;
try {
  let question = "What business opportunity should this Initiative address?";
  let complete = false;
  for (const answer of answers) {
    if (complete || input.turns.length >= 12) break;
    input.turns.push({ question, answer });
    const previous = requests.length;
    const result = await advanceInterview(input, inference("turn"), invalid, 1);
    report("turn", result, input.turns.length);
    if (requests.length === previous) failed = true; // deterministic fallback, not live AI success
    const facts = new Map((input.knownFacts ?? []).map(f => [`${f.source}:${f.evidence}`, f]));
    for (const fact of result.knownFacts) facts.set(`${fact.source}:${fact.evidence}`, fact);
    input.knownFacts = [...facts.values()].slice(0, 24) as InterviewFact[];
    complete = result.interviewComplete;
    question = result.nextQuestion;
  }
  const final = await generateInterviewDraft(input, inference("draft"), invalid, 1);
  report("draft", final, input.turns.length);
  const draftValid = !!(final.draft.problemStatement && final.draft.desiredOutcome);
  console.info(JSON.stringify({ operation: "draft_validation", valid: draftValid,
    answersRequired: input.turns.length, budget: FINAL_DRAFT_TOKENS }));
  if (!draftValid || requests.at(-1)?.operation !== "draft") failed = true;

  // Exercise compact turn output on a deliberately long, but still bounded,
  // synthetic history even when the normal scenario converges early.
  const long: Input = { jira: null, turns: Array.from({ length: 11 }, (_, i) => ({
    question: `What business context matters at stage ${i + 1}?`,
    answer: `The application inventory process at stage ${i + 1} involves separate records and owner confirmation. Teams need a reliable view for governance and to reduce manual handoffs.`,
  })) };
  const longResult = await advanceInterview(long, inference("long_turn"), invalid, 1);
  report("long_turn", longResult, long.turns.length);
  if (requests.at(-1)?.operation !== "long_turn" ||
    (requests.at(-1)?.outputTokens ?? Infinity) > INTERVIEW_TURN_TOKENS) failed = true;
  console.info(JSON.stringify({ operation: "summary", outcome: failed ? "failure" : "success",
    maxInterviewTurnOutputTokens: Math.max(0, ...requests.filter(r => r.operation !== "draft")
      .map(r => r.outputTokens ?? 0)), requests: requests.length,
    turnBudget: INTERVIEW_TURN_TOKENS, draftBudget: FINAL_DRAFT_TOKENS }));
} catch (error) {
  failed = true;
  console.error(JSON.stringify({ operation: "summary", outcome: "failure", ...safePlatformErrorMetadata(error) }));
}
if (failed) process.exitCode = 1;