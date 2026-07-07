import type { AIProvider, AIProviderId, AIProviderMetadata } from "./types";
import { RuleBasedAIProvider } from "./ruleBasedProvider";
import {
  OpenAIProvider,
  ClaudeProvider,
  AzureOpenAIProvider,
  LocalLLMProvider,
} from "./placeholderProviders";

export * from "./types";
export * from "./testRunner";
export { RuleBasedAIProvider } from "./ruleBasedProvider";
export {
  OpenAIProvider,
  ClaudeProvider,
  AzureOpenAIProvider,
  LocalLLMProvider,
} from "./placeholderProviders";

// Registry of every provider the application knows about. The rule-based
// provider is the only one active today; the rest are placeholders that can
// be implemented without changing business logic or UI.
const PROVIDERS: Record<AIProviderId, AIProvider> = {
  "rule-based": new RuleBasedAIProvider(),
  openai: new OpenAIProvider(),
  claude: new ClaudeProvider(),
  "azure-openai": new AzureOpenAIProvider(),
  "local-llm": new LocalLLMProvider(),
};

const DEFAULT_PROVIDER_ID: AIProviderId = "rule-based";

function isProviderId(value: string): value is AIProviderId {
  return value in PROVIDERS;
}

/**
 * Resolve the configured provider id. Selected via the `AI_PROVIDER`
 * environment variable — never hard-coded at call sites. Unknown values
 * fall back to the rule-based provider so the application always works.
 */
export function getActiveAIProviderId(): AIProviderId {
  const configured = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (configured && isProviderId(configured)) return configured;
  return DEFAULT_PROVIDER_ID;
}

/**
 * The single entry point for all AI functionality. Route handlers, scoring
 * logic, recommendation logic, and interview logic must obtain their
 * provider here instead of referencing a vendor implementation directly.
 */
export function getAIProvider(): AIProvider {
  return PROVIDERS[getActiveAIProviderId()];
}

/** Metadata for every registered provider (for Admin settings display). */
export function listAIProviders(): AIProviderMetadata[] {
  return Object.values(PROVIDERS).map(
    ({ id, sourceLabel, status, notes }) => ({
      id,
      sourceLabel,
      status,
      notes,
    }),
  );
}
