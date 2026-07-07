import { Router, type IRouter } from "express";
import { getAIProvider, listAIProviders } from "../lib/ai";

const router: IRouter = Router();

export const APPLICATION_VERSION = "v0.2.0";

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

router.get("/settings", (_req, res) => {
  const active = getAIProvider();
  res.json({
    ...SETTINGS,
    aiProvider: {
      activeProvider: active.sourceLabel,
      providerStatus: active.status,
      availableProviders: listAIProviders().map((p) => ({
        id: p.id,
        label: p.sourceLabel,
        status: p.status,
        notes: p.notes,
      })),
      // No provider connectivity test has been run yet — placeholders do not
      // require API keys and the rule engine needs no connectivity.
      lastProviderTest: null,
      providerNotes:
        "The active provider is selected via the AI_PROVIDER environment variable. " +
        "Only the rule-based engine is active; vendor providers are registered placeholders and require no API keys yet.",
    },
  });
});

export default router;
