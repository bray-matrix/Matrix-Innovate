import type {
  AIProvider,
  AIProviderId,
  AIProviderStatus,
} from "./types";
import { AIProviderNotConfiguredError } from "./types";

/**
 * Registered vendor placeholders. Each implements the full `AIProvider`
 * interface so the rest of the application can be written against the
 * abstraction today; every method fails loudly until the provider is
 * actually implemented and configured (API keys, endpoints, ...).
 */
abstract class PlaceholderAIProvider implements AIProvider {
  abstract readonly id: AIProviderId;
  abstract readonly sourceLabel: string;
  abstract readonly notes: string;
  readonly status: AIProviderStatus = "Placeholder";

  private fail(): never {
    throw new AIProviderNotConfiguredError(this.sourceLabel);
  }

  classifyInitiative(): never {
    this.fail();
  }
  generateExecutiveSummary(): never {
    this.fail();
  }
  generateOpportunityCanvas(): never {
    this.fail();
  }
  generateInterviewQuestions(): never {
    this.fail();
  }
  generateRecommendations(): never {
    this.fail();
  }
  estimateComplexity(): never {
    this.fail();
  }
  recommendPrototypeScope(): never {
    this.fail();
  }
  explainScoreChange(): never {
    this.fail();
  }
}

export class OpenAIProvider extends PlaceholderAIProvider {
  readonly id: AIProviderId = "openai";
  readonly sourceLabel = "OpenAI placeholder";
  readonly notes =
    "Placeholder for OpenAI (GPT models). Requires an OpenAI API key and model selection before activation.";
}

export class ClaudeProvider extends PlaceholderAIProvider {
  readonly id: AIProviderId = "claude";
  readonly sourceLabel = "Claude placeholder";
  readonly notes =
    "Placeholder for Anthropic Claude. Requires an Anthropic API key and model selection before activation.";
}

export class AzureOpenAIProvider extends PlaceholderAIProvider {
  readonly id: AIProviderId = "azure-openai";
  readonly sourceLabel = "Azure OpenAI placeholder";
  readonly notes =
    "Placeholder for Azure OpenAI Service. Requires an Azure endpoint, deployment name, and API key before activation.";
}

export class LocalLLMProvider extends PlaceholderAIProvider {
  readonly id: AIProviderId = "local-llm";
  readonly sourceLabel = "Local LLM placeholder";
  readonly notes =
    "Placeholder for a future internal or locally hosted model. Requires an inference endpoint before activation.";
}
