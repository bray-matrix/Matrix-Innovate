import type {
  InitiativeRecord,
  RecommendationContext,
  InitiativeRecommendationsResult,
  ComplexityEstimate,
} from "../intelligence";
import { RuleBasedRecommendationProvider } from "../intelligence";
import {
  explainComponents,
  type RecalculationInputs,
  type ScoringComponents,
} from "../scoring";
import type {
  AIProvider,
  AIProviderId,
  AIProviderStatus,
  ClassificationResult,
  ClassifyInitiativeInput,
  InterviewQuestion,
  OpportunityCanvas,
} from "./types";

// Keyword banks aligned with the admin-configured initiative categories.
// Mirrors the client-side interview classifier's approach: the idea text is
// weighted most heavily, then the problem statement, then everything else.
const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  {
    category: "Revenue Growth",
    keywords: [
      "revenue",
      "sales",
      "upsell",
      "cross-sell",
      "pricing",
      "lead",
      "pipeline",
      "conversion",
      "deal",
      "quote",
    ],
  },
  {
    category: "Operational Efficiency",
    keywords: [
      "process",
      "workflow",
      "automat",
      "manual",
      "routing",
      "scheduling",
      "logistics",
      "operations",
      "throughput",
      "efficiency",
    ],
  },
  {
    category: "Customer Experience",
    keywords: [
      "customer",
      "client",
      "support",
      "service",
      "satisfaction",
      "complaint",
      "response time",
      "chat",
      "email",
      "ticket",
    ],
  },
  {
    category: "Internal Productivity",
    keywords: [
      "employee",
      "internal",
      "productivity",
      "document",
      "report",
      "meeting",
      "knowledge",
      "search",
      "drafting",
      "hr",
    ],
  },
  {
    category: "Compliance and Security",
    keywords: [
      "compliance",
      "regulat",
      "audit",
      "risk",
      "security",
      "privacy",
      "policy",
      "hipaa",
      "soc2",
      "pci",
    ],
  },
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce(
    (sum, kw) => (lower.includes(kw.toLowerCase()) ? sum + 1 : sum),
    0,
  );
}

// The server-side interview question bank. The interview UI currently drives
// its own richer adaptive plan client-side; this provides the same core plan
// through the provider abstraction for future server-driven interviews.
const OPENING_QUESTIONS: InterviewQuestion[] = [
  {
    id: "idea",
    prompt: "Tell me about your idea.",
    hint: "A sentence or two is perfect — what are you imagining?",
  },
  {
    id: "problem",
    prompt: "What business problem are you solving?",
    hint: "What's painful, slow, costly, or error-prone today?",
  },
];

const CLOSING_QUESTIONS: InterviewQuestion[] = [
  {
    id: "loss",
    prompt: "Approximately how much time or money is lost today?",
    hint: "A rough estimate is fine — hours per month, dollars, or both.",
  },
  {
    id: "success",
    prompt: "What would success look like?",
    hint: "Describe the outcome and how you'd measure it.",
  },
  {
    id: "ai",
    prompt: "How could AI help?",
    hint: "Your best guess — we'll refine it together.",
  },
  {
    id: "prototype",
    prompt: "What can realistically be proven within two weeks?",
    hint: "The smallest slice that would build confidence.",
  },
  {
    id: "notes",
    prompt: "Anything else we should know?",
    hint: "Constraints, risks, data, stakeholders — optional but helpful.",
  },
];

/**
 * The active, deterministic provider. Preserves the existing Rule Engine
 * behavior exactly by delegating to the intelligence rule engine and the
 * scoring explanation logic — it adds no new behavior of its own.
 */
export class RuleBasedAIProvider implements AIProvider {
  readonly id: AIProviderId = "rule-based";
  readonly sourceLabel = "Rule Engine v1";
  readonly status: AIProviderStatus = "Active";
  readonly notes =
    "Deterministic keyword and threshold rules. No external API calls, no API key required.";

  private readonly ruleEngine = new RuleBasedRecommendationProvider();

  async classifyInitiative(
    input: ClassifyInitiativeInput,
  ): Promise<ClassificationResult> {
    let best: string | null = null;
    let bestScore = 0;
    let total = 0;
    for (const def of CATEGORY_KEYWORDS) {
      const score =
        countMatches(input.idea, def.keywords) * 3 +
        countMatches(input.problem ?? "", def.keywords) * 2 +
        countMatches(input.additionalContext ?? "", def.keywords);
      total += score;
      if (score > bestScore) {
        bestScore = score;
        best = def.category;
      }
    }
    return {
      category: best ?? "Experimental",
      confidence: total > 0 ? Math.min(1, bestScore / total) : 0,
    };
  }

  async generateExecutiveSummary(
    initiative: InitiativeRecord,
  ): Promise<string> {
    if (initiative.executiveSummary && initiative.executiveSummary.trim()) {
      return initiative.executiveSummary;
    }
    return `${initiative.title} is a ${initiative.category} initiative for the ${initiative.department} department led by ${initiative.submitterName}.`;
  }

  async generateOpportunityCanvas(
    initiative: InitiativeRecord,
  ): Promise<OpportunityCanvas> {
    return {
      executiveSummary: await this.generateExecutiveSummary(initiative),
      problem: initiative.problemStatement,
      currentProcess: initiative.currentProcess,
      desiredOutcome: initiative.desiredOutcome,
      aiOpportunity: initiative.aiConcept,
      expectedValue: `Estimated ${initiative.estimatedHoursSavedMonthly} hrs/mo saved, $${initiative.estimatedRevenueOpportunity} revenue opportunity, $${initiative.estimatedCostSavings} cost savings.`,
      prototypeGoal: initiative.prototypeGoal,
      successMetric: initiative.successMetric,
      risks: `Compliance: ${initiative.complianceRisk}. Technical: ${initiative.technicalComplexity}. Data Readiness: ${initiative.aiReadiness}.`,
      recommendedNextStep: `Advance to next phase based on ${initiative.priority} priority and score of ${initiative.score}/100.`,
    };
  }

  async generateInterviewQuestions(): Promise<InterviewQuestion[]> {
    return [...OPENING_QUESTIONS, ...CLOSING_QUESTIONS];
  }

  generateRecommendations(
    context: RecommendationContext,
  ): Promise<InitiativeRecommendationsResult> {
    return this.ruleEngine.generateRecommendations(context);
  }

  async estimateComplexity(
    initiative: InitiativeRecord,
  ): Promise<ComplexityEstimate> {
    return this.ruleEngine.estimateComplexity(initiative);
  }

  async recommendPrototypeScope(
    initiative: InitiativeRecord,
  ): Promise<string> {
    return this.ruleEngine.recommendPrototypeScope(initiative);
  }

  async explainScoreChange(
    inputs: RecalculationInputs,
    components: ScoringComponents,
  ): Promise<Record<keyof ScoringComponents, string>> {
    return explainComponents(inputs, components);
  }
}
