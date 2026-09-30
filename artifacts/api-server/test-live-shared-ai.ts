// Opt-in, paid production validation. Run only with:
// LIVE_SHARED_AI_VALIDATION=YES pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/test-live-shared-ai.ts
// Uses the existing server-only Platform trust; never prints prompts, answers or responses.
import { createPlatformClient } from "@workspace/matrix-sdk";
import { advanceInterview, safePlatformErrorMetadata } from "./src/routes/interview-ai";

if (process.env.LIVE_SHARED_AI_VALIDATION !== "YES") {
  throw new Error("Set LIVE_SHARED_AI_VALIDATION=YES to authorize exactly three paid AI requests.");
}
if (!process.env.PLATFORM_APPLICATION_ID || !process.env.PLATFORM_APPLICATION_SECRET) {
  throw new Error("Existing Platform application trust is required.");
}
const platform = createPlatformClient({
  platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
  applicationId: process.env.PLATFORM_APPLICATION_ID,
  applicationSecret: process.env.PLATFORM_APPLICATION_SECRET,
});

const cases = [
  {
    name: "basic",
    run: () => platform.ai.generateStructured({
      feature: "sdk-1-2-1-validation-basic",
      instruction: "Return a brief structured assessment of the supplied hypothetical process.",
      messages: [{ role: "user", content: "A team manually routes incoming requests by email." }],
      schema: { type: "object" as const, properties: {
        summary: { type: "string" as const }, openQuestion: { type: "string" as const },
      }, required: ["summary", "openQuestion"], additionalProperties: false as const },
      maxOutputTokens: 200,
    }),
  },
  {
    name: "guided-interview",
    run: async () => {
      let requestId: string | undefined;
      const result = await advanceInterview({
        turns: [
          { question: "What should improve?", answer: "Our operations team receives customer requests by email and forwards them manually." },
          { question: "What happens now?", answer: "Ownership is unclear after forwarding, and account managers must ask for updates." },
          { question: "What would better look like?", answer: "A visible queue with clear ownership and timely status updates." },
        ],
        jira: null,
      }, request => platform.ai.generateStructured(request), undefined, 1,
      metadata => { requestId = metadata.requestId; });
      if (!result) throw new Error("guided response did not pass local validation");
      return { requestId };
    },
  },
  {
    name: "long-structured",
    run: () => platform.ai.generateStructured({
      feature: "sdk-1-2-1-validation-long",
      instruction: "Produce a thorough but bounded structured analysis of this hypothetical operations process. Provide 15 distinct detailed steps, each with an observation, a practical improvement, a measurable indicator and a possible limitation. Remain hypothetical; do not invent financial figures.",
      messages: [{ role: "user", content: "A customer service team receives requests by email, forwards them to operations, and manually checks status. Draft a process improvement analysis for review, not a claim about actual business results." }],
      schema: { type: "object" as const, properties: {
        steps: { type: "array" as const, items: { type: "object" as const, properties: {
          observation: { type: "string" as const }, improvement: { type: "string" as const },
          indicator: { type: "string" as const }, limitation: { type: "string" as const },
        }, required: ["observation", "improvement", "indicator", "limitation"],
        additionalProperties: false as const } },
      }, required: ["steps"], additionalProperties: false as const },
      maxOutputTokens: 2048,
    }),
  },
];

let failed = false;
for (const item of cases) {
  const started = performance.now();
  try {
    const result = await item.run();
    const durationMs = Math.round(performance.now() - started);
    const requestId = typeof result.requestId === "string" &&
      /^[a-zA-Z0-9._:/-]{1,120}$/.test(result.requestId) ? result.requestId : undefined;
    // Do not log result.data, provider output, credentials or request content.
    console.info(JSON.stringify({ case: item.name, outcome: "success", durationMs, requestId }));
    if (!requestId || (item.name === "long-structured" && durationMs <= 10_000)) failed = true;
  } catch (error) {
    failed = true;
    console.info(JSON.stringify({ case: item.name, outcome: "failure",
      durationMs: Math.round(performance.now() - started), ...safePlatformErrorMetadata(error) }));
  }
}
if (failed) process.exitCode = 1;