import type { initiativesTable } from "@workspace/db";

export type InitiativeRecord = typeof initiativesTable.$inferSelect;

export type ComplexityLevel = "Low" | "Medium" | "High";

export interface SimilarInitiativeResult {
  id: number;
  title: string;
  department: string;
  category: string;
  status: string;
  score: number;
  similarityScore: number;
  reasons: string[];
}

export interface ComplexityEstimate {
  level: ComplexityLevel;
  factors: string[];
}

export interface InitiativeRecommendationsResult {
  initiativeId: number;
  engine: string;
  // Human-readable provider name shown as the recommendation source in the
  // UI (e.g. "Rule Engine v1", "OpenAI GPT-5.5"). Future providers only need
  // to change this label — the UI stays the same.
  sourceLabel: string;
  generatedAt: string;
  similarInitiatives: SimilarInitiativeResult[];
  prototypeScope: string;
  complexity: ComplexityLevel;
  complexityFactors: string[];
  estimatedPrototypeDurationDays: number;
  teamRoles: string[];
  risks: string[];
  expectedBusinessValue: string;
  expectedAnnualValue: number;
  confidenceScore: number;
  nextAction: string;
}

export interface RecommendationContext {
  initiative: InitiativeRecord;
  allInitiatives: InitiativeRecord[];
}

/**
 * Provider abstraction for the Initiative Intelligence Engine.
 *
 * The current implementation is deterministic and rule-based. A future
 * OpenAI / Claude / other provider can implement this same interface and be
 * swapped in via `getRecommendationProvider()` without any changes to the
 * API contract or the UI.
 */
export interface RecommendationProvider {
  /** Stable identifier surfaced to clients (e.g. "rules-v1", "openai-gpt"). */
  readonly name: string;

  generateRecommendations(
    context: RecommendationContext,
  ): Promise<InitiativeRecommendationsResult>;

  findSimilarInitiatives(
    context: RecommendationContext,
  ): SimilarInitiativeResult[];

  estimateComplexity(initiative: InitiativeRecord): ComplexityEstimate;

  recommendPrototypeScope(initiative: InitiativeRecord): string;
}
