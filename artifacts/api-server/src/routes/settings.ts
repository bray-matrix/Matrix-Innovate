import { Router, type IRouter } from "express";
import { db, providerTestEventsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  AI_CAPABILITY_NAMES,
  getActiveAIProviderId,
  getAIProvider,
  listAIProviders,
  runProviderTest,
} from "../lib/ai";

const router: IRouter = Router();

export const APPLICATION_VERSION = "v0.3.2";

const SETTINGS = {
  departments: [
    "Operations",
    "Finance",
    "Customer Service",
    "Information Technology",
    "Compliance",
    "Human Resources",
    "Sales",
  ],
  categories: [
    "Revenue Growth",
    "Operational Efficiency",
    "Customer Experience",
    "Internal Productivity",
    "Compliance and Security",
    "Experimental",
  ],
  statuses: [
    "Idea",
    "Review",
    "Approved",
    "Prototype",
    "Pilot",
    "Production",
    "Closed",
    "Declined",
  ],
  scoringWeights: [
    { name: "Business Value", weight: 25 },
    { name: "Revenue Potential", weight: 15 },
    { name: "Cost Savings", weight: 15 },
    { name: "Customer Impact", weight: 15 },
    { name: "Strategic Alignment", weight: 10 },
    { name: "AI Readiness", weight: 10 },
    { name: "Prototype Confidence", weight: 10 },
    { name: "Technical Complexity Penalty", weight: -10 },
    { name: "Risk Penalty", weight: -10 },
  ],
  applicationVersion: APPLICATION_VERSION,
};

function serializeTestEvent(
  row: typeof providerTestEventsTable.$inferSelect,
) {
  return {
    id: row.id,
    providerId: row.providerId,
    providerName: row.providerLabel,
    passed: row.passed,
    status: row.passed ? "Passed" : "Failed",
    capabilities: row.capabilities,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

// Operator-facing description of what switching to each provider would mean
// today. Switching itself is intentionally not exposed — the active provider
// is selected via the AI_PROVIDER environment variable only.
function describeSwitchImpact(status: string, isActive: boolean): string {
  if (isActive) {
    return "Currently active. All AI-generated intelligence is produced by this provider.";
  }
  if (status === "Active") {
    return (
      "Switching would route all AI-generated intelligence through this provider. " +
      "It is implemented and would pass the readiness test."
    );
  }
  return (
    "Switching now would break all AI-generated intelligence: this provider is a registered " +
    'placeholder and every capability call would fail with "Provider is registered but not configured." ' +
    "It must be implemented and configured before it can be activated."
  );
}

router.get("/settings", async (_req, res) => {
  const active = getAIProvider();
  const activeId = getActiveAIProviderId();
  const testEvents = await db
    .select()
    .from(providerTestEventsTable)
    .orderBy(desc(providerTestEventsTable.createdAt));
  const latestTest = testEvents[0];
  const latestByProvider = new Map<
    string,
    (typeof testEvents)[number]
  >();
  for (const event of testEvents) {
    if (!latestByProvider.has(event.providerId)) {
      latestByProvider.set(event.providerId, event);
    }
  }
  res.json({
    ...SETTINGS,
    aiProvider: {
      activeProvider: active.sourceLabel,
      activeProviderId: activeId,
      providerStatus: active.status,
      availableProviders: listAIProviders().map((p) => {
        const isActive = p.id === activeId;
        const lastTest = latestByProvider.get(p.id);
        return {
          id: p.id,
          label: p.sourceLabel,
          status: p.status,
          notes: p.notes,
          isActive,
          capabilities: [...AI_CAPABILITY_NAMES],
          lastTestPassed: lastTest ? lastTest.passed : null,
          lastTestAt: lastTest ? lastTest.createdAt.toISOString() : null,
          switchImpact: describeSwitchImpact(p.status, isActive),
        };
      }),
      lastProviderTest: latestTest
        ? latestTest.createdAt.toISOString()
        : null,
      providerNotes:
        "The active provider is selected via the AI_PROVIDER environment variable. " +
        "Only the rule-based engine is active; vendor providers are registered placeholders and require no API keys yet.",
    },
  });
});

// Runs the readiness test against the ACTIVE provider using synthetic sample
// data only, then stores the run in the provider test history.
router.post("/settings/ai-provider/test", async (_req, res) => {
  const provider = getAIProvider();
  const result = await runProviderTest(provider);
  const [row] = await db
    .insert(providerTestEventsTable)
    .values({
      providerId: result.providerId,
      providerLabel: result.providerLabel,
      passed: result.passed,
      capabilities: result.capabilities,
      errorMessage: result.errorMessage,
    })
    .returning();
  res.json(serializeTestEvent(row));
});

router.get("/settings/ai-provider/tests", async (_req, res) => {
  const rows = await db
    .select()
    .from(providerTestEventsTable)
    .orderBy(desc(providerTestEventsTable.createdAt));
  res.json(rows.map(serializeTestEvent));
});

export default router;
