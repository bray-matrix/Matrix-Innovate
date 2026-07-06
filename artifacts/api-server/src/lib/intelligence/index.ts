import type { RecommendationProvider } from "./types";
import { RuleBasedRecommendationProvider } from "./ruleBasedProvider";

export * from "./types";
export { RuleBasedRecommendationProvider } from "./ruleBasedProvider";

const activeProvider: RecommendationProvider =
  new RuleBasedRecommendationProvider();

/**
 * Returns the active recommendation provider.
 *
 * To swap in an AI-backed provider (OpenAI, Claude, ...), implement
 * `RecommendationProvider` and return it here — the API route and the UI
 * do not need to change.
 */
export function getRecommendationProvider(): RecommendationProvider {
  return activeProvider;
}
