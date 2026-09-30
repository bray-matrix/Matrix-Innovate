// Explicitly opted-in synthetic, final-generation-only replay. No Initiative writes.
// LIVE_SHARED_AI_VALIDATION=YES pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/test-live-brief-synthesis.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPlatformClient } from "@workspace/matrix-sdk";
import { generateInterviewDraft, safePlatformErrorMetadata } from "./src/routes/interview-ai";
import { interviewEngine } from "../matrix-innovation-hub/src/services/interviewEngine";
import { finalizeInterviewDraft, initialNarrative, buildReviewBrief } from "../matrix-innovation-hub/src/components/initiative-review/review-model";

const offline = process.argv.includes("--offline");
const out = fileURLToPath(new URL("../../attached_assets/generated/application-inventory-live-synthesis.json", import.meta.url));
const captured = offline ? JSON.parse(await readFile(out, "utf8")) : null;
if (!offline && process.env.LIVE_SHARED_AI_VALIDATION !== "YES") throw new Error("Explicit live-validation opt-in is required.");
if (!offline && (!process.env.PLATFORM_APPLICATION_ID || !process.env.PLATFORM_APPLICATION_SECRET))
  throw new Error("Existing Platform application trust is required.");
const client = offline ? null : createPlatformClient({
  platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
  applicationId: process.env.PLATFORM_APPLICATION_ID!,
  applicationSecret: process.env.PLATFORM_APPLICATION_SECRET!,
});
const turns = [
  ["What business problem should this idea address?", "We do not have a reliable application inventory. Application information is fragmented across spreadsheets, email, team wikis and individual knowledge. Ownership and dependencies are unclear."],
  ["Who is affected and what is the impact?", "IT and business teams waste time rediscovering application information and finding the right people. Troubleshooting and onboarding are slower. Renewals and changes are harder because information is incomplete. We depend on institutional knowledge and lose knowledge when people leave."],
  ["What outcome do you want?", "A reliable system of record for applications would make ownership and business purpose clear. We want faster troubleshooting and onboarding, less rediscovery, better renewal and change support, reduced dependence on specific individuals, and better visibility for security reviews, audits and employee transitions."],
  ["What scope and governance have been agreed?", "Phase 1 should start with application ownership and business purpose. IT would administer the inventory and business owners would validate their records. Later it could extend to integrations, dependencies, licensing, cost and credential-management visibility. Detailed Phase 2 scope and validation cadence are not yet known."],
  ["What risks or constraints matter?", "Unclear ownership and dependencies create security and compliance exposure. Credential-management visibility is limited. Dependence on institutional knowledge creates a risk of knowledge loss when people leave. The exact compliance requirements need later discovery."],
  ["What value or success measures are established?", "The qualitative benefits described earlier matter, but dollars, hours saved, savings and revenue are not yet quantified. We have not agreed on success measures or targets. The number of applications and exact source systems are unknown."],
  ["What is still needed before advancing?", "We need to confirm the accountable business owner and department and agree on the initial scope boundary with stakeholders. No executive sponsor is assigned. The budget, implementation timeline and resource plan have not been established."],
].map(([question, answer]) => ({ question, answer }));
const input = captured?.input ?? { turns, jira: null, knownFacts: [] };
let requests = 0;
let acceptedResponse = offline;
let failure: Record<string, unknown> | undefined;
let metadata: Record<string, unknown> = captured?.metadata ?? {};
const final: Awaited<ReturnType<typeof generateInterviewDraft>> = captured?.final ?? await generateInterviewDraft(input, async request => {
  requests++;
  if (requests !== 1) throw new Error("Only one final-generation request is permitted.");
  try {
    const response = await client!.ai.generateStructured(request);
    acceptedResponse = true;
    metadata = { requestId: response.requestId, inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens, durationMs: response.durationMs };
    return response;
  } catch (error) {
    failure = safePlatformErrorMetadata(error);
    throw error;
  }
}, (attempt, category, details) => {
  failure = { attempt, category, path: details?.path, constraint: details?.constraint,
    ...(details?.sdkError ? safePlatformErrorMetadata(details.sdkError) : {}) };
}, 1);

if (!acceptedResponse || failure) {
  console.info(JSON.stringify({ outcome: "failure", operation: "draft", requests, ...failure, ...metadata }));
  process.exitCode = 1;
} else {
  // Synthetic answer-map fixture drives the SAME baseline engine, completion
  // merger and Review model as the browser. No standalone approximation.
  const baseline = await interviewEngine.generateDraft({
    idea: "Centralized Application Inventory and Ownership System",
    problem: input.turns[0].answer,
    success: input.turns[2].answer,
  }, []);
  baseline.score = 45;
  baseline.priority = "Low";
  baseline.scoring = { businessValue: 25, revenuePotential: 0, costSavingsScore: 0, customerImpactScore: 6,
    strategicAlignment: 8, aiReadinessScore: 10, prototypeConfidence: 7, technicalComplexityPenalty: -6, riskPenalty: -5 };
  const draft = finalizeInterviewDraft(baseline, final, final,
    input.turns.map((t: { answer: string }) => ({ value: t.answer, source: "user" as const })));
  const narrative = initialNarrative(draft, final);
  const brief = buildReviewBrief({ draft, fields: draft.fields, scoring: draft.scoring, narrative,
    ai: final, score: draft.score, priority: draft.priority, readiness: final.readiness.label,
    generatedAt: captured?.brief?.metadata?.generatedAt });
  await mkdir(fileURLToPath(new URL("../../attached_assets/generated/", import.meta.url)), { recursive: true });
  await writeFile(out, JSON.stringify({ synthetic: true, operation: "final-only", requests: captured?.requests ?? requests,
    offlineRegeneration: offline,
    scoringSource: "Existing representative 45/100 fixture, not live Initiative data or AI scoring",
    metadata, input, final, baseline, draft, narrative, brief }, null, 2));
  console.info(JSON.stringify({ outcome: "accepted", operation: "draft", requests, ...metadata,
    sample: "attached_assets/generated/application-inventory-live-synthesis.json" }));
}