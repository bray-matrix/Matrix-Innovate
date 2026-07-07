import type { InitiativeRecord } from "../intelligence";
import type { RecalculationInputs } from "../scoring";
import type { AIProvider } from "./types";
import { AIProviderNotConfiguredError } from "./types";

export const PLACEHOLDER_FAILURE_MESSAGE =
  "Provider is registered but not configured.";

export interface CapabilityTestResult {
  capability: string;
  passed: boolean;
  message: string;
}

export interface ProviderTestRunResult {
  providerId: string;
  providerLabel: string;
  passed: boolean;
  capabilities: CapabilityTestResult[];
  errorMessage: string | null;
}

// Safe, synthetic sample initiative used for readiness testing. Never touches
// real initiative data or user-facing workflows.
const SAMPLE_INITIATIVE: InitiativeRecord = {
  id: 0,
  title: "Provider Readiness Test Initiative",
  department: "Information Technology",
  submitterName: "System Test",
  businessOwner: "System Test",
  executiveSponsor: null,
  category: "Internal Productivity",
  status: "Idea",
  executiveSummary: null,
  problemStatement:
    "Support agents spend hours each week manually drafting near-identical responses to routine customer emails.",
  currentProcess:
    "Agents search past tickets and copy-paste fragments into replies by hand.",
  desiredOutcome: "Cut average reply time in half while keeping quality high.",
  aiConcept:
    "Generate a draft reply from the incoming email and the internal knowledge base for agent review.",
  prototypeGoal:
    "Draft replies for the top 3 request types using last month's emails.",
  successMetric: "Average reply time reduced by 50 percent.",
  estimatedHoursSavedMonthly: 400,
  estimatedRevenueOpportunity: 0,
  estimatedCostSavings: 60000,
  customerImpact: "High",
  complianceRisk: "Low",
  technicalComplexity: "Medium",
  aiReadiness: "High",
  businessValue: 20,
  revenuePotential: 0,
  costSavingsScore: 12,
  customerImpactScore: 12,
  strategicAlignment: 8,
  aiReadinessScore: 8,
  prototypeConfidence: 8,
  technicalComplexityPenalty: -5,
  riskPenalty: -2,
  score: 61,
  priority: "Medium",
  version: "v0.1.0",
  assignedTeam: null,
  currentPhase: null,
  prototypeDay: null,
  lastReviewedAt: null,
  nextReviewAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_RECALCULATION_INPUTS: RecalculationInputs = {
  estimatedRevenueOpportunity: SAMPLE_INITIATIVE.estimatedRevenueOpportunity,
  estimatedCostSavings: SAMPLE_INITIATIVE.estimatedCostSavings,
  estimatedHoursSavedMonthly: SAMPLE_INITIATIVE.estimatedHoursSavedMonthly,
  aiReadiness: SAMPLE_INITIATIVE.aiReadiness,
  technicalComplexity: SAMPLE_INITIATIVE.technicalComplexity,
  complianceRisk: SAMPLE_INITIATIVE.complianceRisk,
};

function failureMessage(err: unknown): string {
  if (err instanceof AIProviderNotConfiguredError) {
    return PLACEHOLDER_FAILURE_MESSAGE;
  }
  return err instanceof Error ? err.message : String(err);
}

interface CapabilityCheck {
  capability: string;
  run: (provider: AIProvider) => Promise<string>;
}

// Each check exercises one AIProvider capability against the sample data and
// returns a short human-readable summary of what came back.
const CAPABILITY_CHECKS: CapabilityCheck[] = [
  {
    capability: "classifyInitiative",
    run: async (p) => {
      const r = await p.classifyInitiative({
        idea: SAMPLE_INITIATIVE.aiConcept,
        problem: SAMPLE_INITIATIVE.problemStatement,
      });
      if (!r.category || typeof r.confidence !== "number") {
        throw new Error("Classification returned an incomplete result.");
      }
      return `Classified as "${r.category}" (confidence ${(r.confidence * 100).toFixed(0)}%).`;
    },
  },
  {
    capability: "generateExecutiveSummary",
    run: async (p) => {
      const s = await p.generateExecutiveSummary(SAMPLE_INITIATIVE);
      if (!s.trim()) throw new Error("Executive summary was empty.");
      return `Generated a ${s.length}-character summary.`;
    },
  },
  {
    capability: "generateOpportunityCanvas",
    run: async (p) => {
      const c = await p.generateOpportunityCanvas(SAMPLE_INITIATIVE);
      const missing = Object.entries(c)
        .filter(([, v]) => !String(v).trim())
        .map(([k]) => k);
      if (missing.length > 0) {
        throw new Error(`Canvas fields empty: ${missing.join(", ")}.`);
      }
      return "Generated a complete 10-field opportunity canvas.";
    },
  },
  {
    capability: "generateRecommendations",
    run: async (p) => {
      const r = await p.generateRecommendations({
        initiative: SAMPLE_INITIATIVE,
        allInitiatives: [SAMPLE_INITIATIVE],
      });
      if (!r.sourceLabel) {
        throw new Error("Recommendations result is missing its source label.");
      }
      return `Generated recommendations (source: ${r.sourceLabel}).`;
    },
  },
  {
    capability: "estimateComplexity",
    run: async (p) => {
      const c = await p.estimateComplexity(SAMPLE_INITIATIVE);
      if (!c.level) throw new Error("Complexity estimate has no level.");
      return `Estimated complexity: ${c.level}.`;
    },
  },
  {
    capability: "recommendPrototypeScope",
    run: async (p) => {
      const s = await p.recommendPrototypeScope(SAMPLE_INITIATIVE);
      if (!s.trim()) throw new Error("Prototype scope was empty.");
      return `Recommended a ${s.length}-character prototype scope.`;
    },
  },
  {
    capability: "explainScoreChange",
    run: async (p) => {
      const reasons = await p.explainScoreChange(SAMPLE_RECALCULATION_INPUTS, {
        businessValue: SAMPLE_INITIATIVE.businessValue,
        revenuePotential: SAMPLE_INITIATIVE.revenuePotential,
        costSavingsScore: SAMPLE_INITIATIVE.costSavingsScore,
        customerImpactScore: SAMPLE_INITIATIVE.customerImpactScore,
        strategicAlignment: SAMPLE_INITIATIVE.strategicAlignment,
        aiReadinessScore: SAMPLE_INITIATIVE.aiReadinessScore,
        prototypeConfidence: SAMPLE_INITIATIVE.prototypeConfidence,
        technicalComplexityPenalty:
          SAMPLE_INITIATIVE.technicalComplexityPenalty,
        riskPenalty: SAMPLE_INITIATIVE.riskPenalty,
      });
      const empty = Object.entries(reasons)
        .filter(([, v]) => !String(v).trim())
        .map(([k]) => k);
      if (empty.length > 0) {
        throw new Error(`Missing explanations for: ${empty.join(", ")}.`);
      }
      return `Explained all ${Object.keys(reasons).length} scoring components.`;
    },
  },
];

/**
 * Runs the full capability readiness test against the given provider using
 * synthetic sample data only. Never throws — failures are captured in the
 * result so they can be stored and displayed.
 */
export async function runProviderTest(
  provider: AIProvider,
): Promise<ProviderTestRunResult> {
  const capabilities: CapabilityTestResult[] = [];
  for (const check of CAPABILITY_CHECKS) {
    try {
      const message = await check.run(provider);
      capabilities.push({ capability: check.capability, passed: true, message });
    } catch (err) {
      capabilities.push({
        capability: check.capability,
        passed: false,
        message: failureMessage(err),
      });
    }
  }
  const passed = capabilities.every((c) => c.passed);
  const firstFailure = capabilities.find((c) => !c.passed);
  return {
    providerId: provider.id,
    providerLabel: provider.sourceLabel,
    passed,
    capabilities,
    errorMessage: passed ? null : (firstFailure?.message ?? "Test failed."),
  };
}
