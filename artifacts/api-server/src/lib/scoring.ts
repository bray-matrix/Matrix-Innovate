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
