import type {
  InitiativeRecord,
  RecommendationContext,
  InitiativeRecommendationsResult,
  ComplexityEstimate,
} from "../intelligence";
import type { RecalculationInputs, ScoringComponents } from "../scoring";

/**
 * AI Provider Abstraction Layer.
 *
 * Business logic, route handlers, and UI components must never call a
 * specific AI vendor (OpenAI, Claude, Azure OpenAI, a local model, ...)
 * directly. They talk to an `AIProvider` obtained from `getAIProvider()`,
 * and the active provider is selected from configuration.
 *
 * The current active provider is deterministic and rule-based; the vendor
 * providers are registered placeholders that can be implemented later
 * without changing any business logic or UI.
 */

export type AIProviderId =
  | "rule-based"
  | "openai"
  | "claude"
  | "azure-openai"
  | "local-llm";

export type AIProviderStatus = "Active" | "Placeholder";

export interface ClassificationResult {
  /** One of the admin-configured initiative categories. */
  category: string;
  /** 0..1 confidence in the classification. */
  confidence: number;
}

export interface OpportunityCanvas {
  executiveSummary: string;
  problem: string;
  currentProcess: string;
  desiredOutcome: string;
  aiOpportunity: string;
  expectedValue: string;
  prototypeGoal: string;
  successMetric: string;
  risks: string;
  recommendedNextStep: string;
}

export interface InterviewQuestion {
  id: string;
  prompt: string;
  hint: string;
}

export interface ClassifyInitiativeInput {
  /** The raw idea / title text. Weighted most heavily. */
  idea: string;
  /** The problem statement, if available. */
  problem?: string;
  /** Any additional free text (answers, notes, ...). */
  additionalContext?: string;
}

export interface AIProviderMetadata {
  /** Stable machine identifier, e.g. "rule-based", "openai". */
  readonly id: AIProviderId;
  /** Human-readable source label surfaced in the UI, e.g. "Rule Engine v1". */
  readonly sourceLabel: string;
  /** Whether the provider is usable today or a registered placeholder. */
  readonly status: AIProviderStatus;
  /** Operator-facing notes shown in Admin settings. */
  readonly notes: string;
}

export interface AIProvider extends AIProviderMetadata {
  /** Classify free text into one of the admin-configured categories. */
  classifyInitiative(
    input: ClassifyInitiativeInput,
  ): Promise<ClassificationResult>;

  /** Compose an executive summary for an initiative. */
  generateExecutiveSummary(initiative: InitiativeRecord): Promise<string>;

  /** Compose the AI Opportunity Canvas for an initiative. */
  generateOpportunityCanvas(
    initiative: InitiativeRecord,
  ): Promise<OpportunityCanvas>;

  /**
   * Produce the interview question plan for a (possibly not yet classified)
   * idea. `category` is the detected category, when known.
   */
  generateInterviewQuestions(category?: string): Promise<InterviewQuestion[]>;

  /** Full Initiative Intelligence recommendation set. */
  generateRecommendations(
    context: RecommendationContext,
  ): Promise<InitiativeRecommendationsResult>;

  /** Estimate implementation complexity with contributing factors. */
  estimateComplexity(initiative: InitiativeRecord): Promise<ComplexityEstimate>;

  /** Recommend a two-week prototype scope. */
  recommendPrototypeScope(initiative: InitiativeRecord): Promise<string>;

  /**
   * Explain each scoring component's value for a recalculation, keyed by
   * component. Used to build the per-component reasons in recalculation
   * results and the calculation audit trail.
   */
  explainScoreChange(
    inputs: RecalculationInputs,
    components: ScoringComponents,
  ): Promise<Record<keyof ScoringComponents, string>>;
}

/** Error thrown by placeholder providers that are not yet implemented. */
export class AIProviderNotConfiguredError extends Error {
  constructor(providerLabel: string) {
    super(
      `${providerLabel} is a registered placeholder and is not configured yet. ` +
        `Select the rule-based provider or implement this provider before use.`,
    );
    this.name = "AIProviderNotConfiguredError";
  }
}
