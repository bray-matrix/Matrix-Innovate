export interface ScoringComponents {
  businessValue: number;
  revenuePotential: number;
  costSavingsScore: number;
  customerImpactScore: number;
  strategicAlignment: number;
  aiReadinessScore: number;
  prototypeConfidence: number;
  technicalComplexityPenalty: number;
  riskPenalty: number;
}

const clampComponent = (value: number, max: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
};

// Penalties are stored and sent from the client as NEGATIVE magnitudes
// (0 down to -max). They are added (not subtracted) so a value of -6 lowers
// the score by 6. Clamping to [-max, 0] guards against out-of-range input.
const clampPenalty = (value: number, max: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.max(-max, Math.min(0, Math.round(value)));
};

export function calculateScore(components: ScoringComponents): number {
  const positive =
    clampComponent(components.businessValue, 25) +
    clampComponent(components.revenuePotential, 15) +
    clampComponent(components.costSavingsScore, 15) +
    clampComponent(components.customerImpactScore, 15) +
    clampComponent(components.strategicAlignment, 10) +
    clampComponent(components.aiReadinessScore, 10) +
    clampComponent(components.prototypeConfidence, 10);

  const penalties =
    clampPenalty(components.technicalComplexityPenalty, 10) +
    clampPenalty(components.riskPenalty, 10);

  return Math.max(0, Math.min(100, positive + penalties));
}

export function derivePriority(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 65) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

// ---------------------------------------------------------------------------
// Deterministic recalculation (v0.1.7)
//
// Re-derives the scoring components that map directly to stored raw fields,
// so users can edit fields inline and press "Recalculate" without repeating
// the interview. Human-judgment components (businessValue, strategicAlignment,
// prototypeConfidence, customerImpactScore) are preserved as-is; they can
// still be adjusted on the Score page.
// ---------------------------------------------------------------------------

export interface RecalculationInputs {
  estimatedRevenueOpportunity: number;
  estimatedCostSavings: number;
  estimatedHoursSavedMonthly: number;
  aiReadiness: string;
  technicalComplexity: string;
  complianceRisk: string;
}

const levelOf = (value: string): "high" | "medium" | "low" | "unknown" => {
  const v = value.trim().toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "unknown";
};

// AI Readiness calculation: data readiness level -> 0-10 component.
export function deriveAiReadinessScore(
  aiReadiness: string,
  fallback: number,
): number {
  switch (levelOf(aiReadiness)) {
    case "high":
      return 9;
    case "medium":
      return 6;
    case "low":
      return 3;
    default:
      return clampComponent(fallback, 10);
  }
}

export function deriveTechnicalComplexityPenalty(
  technicalComplexity: string,
  fallback: number,
): number {
  switch (levelOf(technicalComplexity)) {
    case "high":
      return -8;
    case "medium":
      return -5;
    case "low":
      return -2;
    default:
      return clampPenalty(fallback, 10);
  }
}

export function deriveRiskPenalty(
  complianceRisk: string,
  fallback: number,
): number {
  switch (levelOf(complianceRisk)) {
    case "high":
      return -8;
    case "medium":
      return -4;
    case "low":
      return -1;
    default:
      return clampPenalty(fallback, 10);
  }
}

export function deriveRevenuePotential(revenueOpportunity: number): number {
  if (revenueOpportunity >= 1_000_000) return 15;
  if (revenueOpportunity >= 250_000) return 12;
  if (revenueOpportunity >= 100_000) return 9;
  if (revenueOpportunity >= 25_000) return 6;
  if (revenueOpportunity > 0) return 3;
  return 0;
}

export function deriveCostSavingsScore(
  costSavings: number,
  hoursSavedMonthly: number,
): number {
  let costTier = 0;
  if (costSavings >= 1_000_000) costTier = 15;
  else if (costSavings >= 250_000) costTier = 12;
  else if (costSavings >= 100_000) costTier = 9;
  else if (costSavings >= 25_000) costTier = 6;
  else if (costSavings > 0) costTier = 3;

  let hoursTier = 0;
  if (hoursSavedMonthly >= 160) hoursTier = 15;
  else if (hoursSavedMonthly >= 80) hoursTier = 12;
  else if (hoursSavedMonthly >= 40) hoursTier = 9;
  else if (hoursSavedMonthly >= 10) hoursTier = 6;
  else if (hoursSavedMonthly > 0) hoursTier = 3;

  return Math.max(costTier, hoursTier);
}

export function recalculateComponents(
  inputs: RecalculationInputs,
  existing: ScoringComponents,
): ScoringComponents {
  return {
    businessValue: existing.businessValue,
    strategicAlignment: existing.strategicAlignment,
    prototypeConfidence: existing.prototypeConfidence,
    customerImpactScore: existing.customerImpactScore,
    revenuePotential: deriveRevenuePotential(inputs.estimatedRevenueOpportunity),
    costSavingsScore: deriveCostSavingsScore(
      inputs.estimatedCostSavings,
      inputs.estimatedHoursSavedMonthly,
    ),
    aiReadinessScore: deriveAiReadinessScore(
      inputs.aiReadiness,
      existing.aiReadinessScore,
    ),
    technicalComplexityPenalty: deriveTechnicalComplexityPenalty(
      inputs.technicalComplexity,
      existing.technicalComplexityPenalty,
    ),
    riskPenalty: deriveRiskPenalty(inputs.complianceRisk, existing.riskPenalty),
  };
}
