import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateScore, derivePriority, deriveRevenuePotential, deriveCostSavingsScore,
  deriveAiReadinessScore, deriveTechnicalComplexityPenalty, deriveRiskPenalty,
  recalculateComponents, explainComponents, type ScoringComponents,
} from "./scoring";

const maximum: ScoringComponents = {
  businessValue: 25, revenuePotential: 15, costSavingsScore: 15,
  customerImpactScore: 15, strategicAlignment: 10, aiReadinessScore: 10,
  prototypeConfidence: 10, technicalComplexityPenalty: 0, riskPenalty: 0,
};

test("score uses unchanged component caps and negative penalty magnitudes", () => {
  assert.equal(calculateScore(maximum), 100);
  assert.equal(calculateScore({ ...maximum, technicalComplexityPenalty: -10, riskPenalty: -10 }), 80);
  for (const [key, cap] of Object.entries(maximum)) {
    const result = calculateScore({ ...maximum, [key]: 999 });
    assert.equal(result, 100, `${key} upper clamp`);
    if (cap > 0) assert.equal(calculateScore({ ...maximum, [key]: -999 }), 100 - cap);
    else assert.equal(calculateScore({ ...maximum, [key]: -999 }), 90);
    assert.equal(calculateScore({ ...maximum, [key]: NaN }), cap > 0 ? 100 - cap : 100);
  }
  assert.equal(calculateScore(Object.fromEntries(Object.keys(maximum).map(k => [k, -999])) as unknown as ScoringComponents), 0);
});

test("priority thresholds are exactly 50, 65 and 80", () => {
  assert.deepEqual([0, 49, 50, 64, 65, 79, 80, 100].map(derivePriority),
    ["Low", "Low", "Medium", "Medium", "High", "High", "Critical", "Critical"]);
});

test("revenue and savings tier boundaries remain unchanged", () => {
  const money = [-1, 0, 1, 24999, 25000, 99999, 100000, 249999, 250000, 999999, 1000000];
  const tiers = [0, 0, 3, 3, 6, 6, 9, 9, 12, 12, 15];
  assert.deepEqual(money.map(deriveRevenuePotential), tiers);
  assert.deepEqual(money.map(v => deriveCostSavingsScore(v, 0)), tiers);
  assert.deepEqual([-1, 0, 1, 9, 10, 39, 40, 79, 80, 159, 160].map(v => deriveCostSavingsScore(0, v)), tiers);
  assert.equal(deriveCostSavingsScore(25000, 160), 15, "choose higher tier, never add tiers");
  assert.equal(deriveCostSavingsScore(1000000, 10), 15);
});

test("readiness, complexity and risk derivations preserve levels and unknown fallback", () => {
  const levels = [" low ", "Medium", "HIGH"];
  assert.deepEqual(levels.map(v => deriveAiReadinessScore(v, 0)), [3, 6, 9]);
  assert.deepEqual(levels.map(v => deriveTechnicalComplexityPenalty(v, 0)), [-2, -5, -8]);
  assert.deepEqual(levels.map(v => deriveRiskPenalty(v, 0)), [-1, -4, -8]);
  assert.equal(deriveAiReadinessScore("", 7), 7);
  assert.equal(deriveAiReadinessScore("unknown", 99), 10);
  assert.equal(deriveTechnicalComplexityPenalty("", -6), -6);
  assert.equal(deriveRiskPenalty("unknown", -99), -10);
});

test("recalculation preserves human judgment and deterministic explanation semantics", () => {
  const input = {
    estimatedRevenueOpportunity: 100000, estimatedCostSavings: 25000,
    estimatedHoursSavedMonthly: 80, aiReadiness: "high",
    technicalComplexity: "medium", complianceRisk: "low",
  };
  const scores = recalculateComponents(input, maximum);
  assert.deepEqual(scores, { ...maximum, revenuePotential: 9, costSavingsScore: 12,
    aiReadinessScore: 9, technicalComplexityPenalty: -5, riskPenalty: -1 });
  assert.equal(calculateScore(scores), 84);
  assert.equal(derivePriority(calculateScore(scores)), "Critical");
  const explanations = explainComponents(input, scores);
  assert.match(explanations.businessValue, /User-entered judgment score/);
  assert.match(explanations.revenuePotential, /9 of 15 points/);
  assert.match(explanations.costSavingsScore, /12 of 15 points/);
});