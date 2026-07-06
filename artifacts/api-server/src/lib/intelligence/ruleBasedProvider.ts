import type {
  ComplexityEstimate,
  ComplexityLevel,
  InitiativeRecord,
  InitiativeRecommendationsResult,
  RecommendationContext,
  RecommendationProvider,
  SimilarInitiativeResult,
} from "./types";

const ENGINE_NAME = "rules-v1";
const PROTOTYPE_SPRINT_DAYS = 14;
const SIMILARITY_THRESHOLD = 30;
const MAX_SIMILAR = 3;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with",
  "that", "this", "is", "are", "be", "by", "at", "from", "as", "it", "we",
  "our", "their", "using", "use", "into", "can", "will", "would", "should",
]);

function normalizeLevel(value: string | null | undefined): number {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "low") return 0;
  if (v === "high") return 2;
  return 1; // Medium or unknown
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

function textBlob(initiative: InitiativeRecord): string {
  return [
    initiative.title,
    initiative.problemStatement,
    initiative.currentProcess,
    initiative.aiConcept,
  ].join(" ");
}

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Deterministic, rule-based implementation of the Initiative Intelligence
 * Engine. No network calls, no LLMs — every output is derived from initiative
 * fields with explicit rules so results are explainable and repeatable.
 */
export class RuleBasedRecommendationProvider implements RecommendationProvider {
  readonly name = ENGINE_NAME;

  findSimilarInitiatives(
    context: RecommendationContext,
  ): SimilarInitiativeResult[] {
    const { initiative, allInitiatives } = context;
    const ownTokens = tokenize(textBlob(initiative));

    const scored = allInitiatives
      .filter((other) => other.id !== initiative.id)
      .map((other) => {
        let points = 0;
        const reasons: string[] = [];

        if (other.category === initiative.category) {
          points += 40;
          reasons.push(`Same category (${other.category})`);
        }
        if (other.department === initiative.department) {
          points += 25;
          reasons.push(`Same department (${other.department})`);
        }

        const ratio = overlapRatio(ownTokens, tokenize(textBlob(other)));
        if (ratio >= 0.15) {
          points += Math.round(ratio * 35);
          reasons.push("Overlapping problem and solution language");
        }

        return {
          id: other.id,
          title: other.title,
          department: other.department,
          category: other.category,
          status: other.status,
          score: other.score,
          similarityScore: Math.min(100, points),
          reasons,
        };
      })
      .filter((s) => s.similarityScore >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarityScore - a.similarityScore);

    return scored.slice(0, MAX_SIMILAR);
  }

  estimateComplexity(initiative: InitiativeRecord): ComplexityEstimate {
    const factors: string[] = [];
    let points = 0;

    const tech = normalizeLevel(initiative.technicalComplexity);
    points += tech * 2;
    if (tech === 2) factors.push("Self-reported technical complexity is High");
    if (tech === 1) factors.push("Moderate technical complexity reported");

    const readiness = normalizeLevel(initiative.aiReadiness);
    points += 2 - readiness;
    if (readiness === 0) {
      factors.push("Low AI/data readiness — data foundations may be missing");
    }

    const compliance = normalizeLevel(initiative.complianceRisk);
    points += compliance;
    if (compliance === 2) {
      factors.push("High compliance risk requires review gates");
    }

    const blob = textBlob(initiative);
    if (containsAny(blob, ["legacy", "mainframe", "manual"])) {
      points += 1;
      factors.push("Legacy or manual processes referenced");
    }
    if (containsAny(blob, ["integrat", "multiple systems", "real-time", "real time"])) {
      points += 1;
      factors.push("Cross-system integration signals detected");
    }
    if (!containsAny(blob, ["api"])) {
      factors.push("No existing API mentioned for the current process");
    }

    let level: ComplexityLevel;
    if (points <= 2) level = "Low";
    else if (points <= 5) level = "Medium";
    else level = "High";

    if (factors.length === 0) {
      factors.push("No major complexity drivers detected");
    }

    return { level, factors };
  }

  recommendPrototypeScope(initiative: InitiativeRecord): string {
    const goal = initiative.prototypeGoal?.trim();
    const metric = initiative.successMetric?.trim();
    const base = goal
      ? `Build a narrow proof-of-concept focused on: ${goal}`
      : `Build a narrow proof-of-concept that demonstrates the core AI concept for "${initiative.title}"`;
    const scope = [
      base,
      `Limit the first sprint to a single ${initiative.department} workflow with a small, representative data sample.`,
      metric
        ? `Define success up front against the stated metric: ${metric}.`
        : "Define one measurable success metric before development starts.",
      `Timebox to the standard ${PROTOTYPE_SPRINT_DAYS}-day prototype sprint and demo working software, not slides.`,
    ];
    return scope.join(" ");
  }

  private estimateDurationDays(complexity: ComplexityLevel, initiative: InitiativeRecord): number {
    let days = 5;
    if (complexity === "Medium") days += 3;
    if (complexity === "High") days += 6;
    if (normalizeLevel(initiative.complianceRisk) === 2) days += 2;
    return Math.max(3, Math.min(PROTOTYPE_SPRINT_DAYS, days));
  }

  private suggestTeamRoles(
    initiative: InitiativeRecord,
    complexity: ComplexityLevel,
  ): string[] {
    const roles = ["AI Solutions Architect", "Business Analyst"];
    roles.push(`${initiative.department} SME`);
    if (
      normalizeLevel(initiative.aiReadiness) === 0 ||
      containsAny(textBlob(initiative), ["data", "report", "document", "record"])
    ) {
      roles.push("Data Engineer");
    }
    if (normalizeLevel(initiative.complianceRisk) === 2) {
      roles.push("Compliance & Risk Officer");
    }
    if (complexity === "High") {
      roles.push("Integration Engineer");
    }
    return Array.from(new Set(roles));
  }

  private identifyRisks(initiative: InitiativeRecord): string[] {
    const risks: string[] = [];
    const blob = textBlob(initiative);

    if (!containsAny(blob, ["api"])) {
      risks.push("No existing API identified for the current process");
    }
    if (normalizeLevel(initiative.aiReadiness) <= 1) {
      risks.push("Data quality and availability unknown");
    }
    const compliance = normalizeLevel(initiative.complianceRisk);
    if (compliance >= 1) {
      risks.push(
        compliance === 2
          ? "High compliance risk — legal and security sign-off required"
          : "Moderate compliance risk — early compliance review recommended",
      );
    }
    if (!initiative.executiveSponsor?.trim()) {
      risks.push("No executive sponsor secured");
    }
    if (normalizeLevel(initiative.technicalComplexity) === 2) {
      risks.push("High technical complexity may extend the prototype sprint");
    }
    risks.push(`Requires ${initiative.department} participation`);
    return risks;
  }

  private summarizeBusinessValue(initiative: InitiativeRecord): {
    text: string;
    annualValue: number;
  } {
    const savings = initiative.estimatedCostSavings ?? 0;
    const revenue = initiative.estimatedRevenueOpportunity ?? 0;
    const annualHours = (initiative.estimatedHoursSavedMonthly ?? 0) * 12;
    const annualValue = savings + revenue;

    const parts: string[] = [];
    if (savings > 0) parts.push(`${formatCurrency(savings)} annual cost savings`);
    if (revenue > 0) parts.push(`${formatCurrency(revenue)} revenue opportunity`);
    if (annualHours > 0) {
      parts.push(`${Math.round(annualHours).toLocaleString("en-US")} hours saved per year`);
    }

    let band = "Emerging";
    if (annualValue >= 100000) band = "High";
    else if (annualValue >= 25000) band = "Medium";

    const text =
      parts.length > 0
        ? `${band} value potential: ${parts.join(", ")}.`
        : "Value estimates not yet provided — quantify savings, revenue, and hours before prototyping.";
    return { text, annualValue };
  }

  private computeConfidence(
    initiative: InitiativeRecord,
    complexity: ComplexityLevel,
  ): number {
    let confidence = 40;
    confidence += Math.round((initiative.score / 100) * 30);
    const readiness = normalizeLevel(initiative.aiReadiness);
    if (readiness === 2) confidence += 15;
    if (readiness === 1) confidence += 8;
    if (complexity === "High") confidence -= 10;
    if (complexity === "Medium") confidence -= 5;
    if (initiative.executiveSponsor?.trim()) confidence += 10;
    if (initiative.successMetric?.trim()) confidence += 5;
    return Math.max(5, Math.min(95, confidence));
  }

  private recommendNextAction(initiative: InitiativeRecord): string {
    switch (initiative.status) {
      case "Idea":
        return initiative.score === 0
          ? "Complete the 100-point scoring model to qualify this initiative"
          : "Submit for review committee evaluation";
      case "Review":
        return "Present at the next innovation review meeting";
      case "Approved":
        return "Schedule Prototype Planning Meeting";
      case "Prototype":
        return (initiative.prototypeDay ?? 0) >= 10
          ? "Prepare the prototype demo — the 14-day deadline is approaching"
          : "Continue the 14-day prototype sprint and hold a mid-sprint checkpoint";
      case "Pilot":
        return initiative.successMetric?.trim()
          ? `Collect pilot results against the success metric: ${initiative.successMetric}`
          : "Define and measure pilot success metrics";
      case "Production":
        return "Monitor production KPIs and report realized value quarterly";
      case "Closed":
      case "Declined":
        return "Archive learnings and share takeaways with the innovation council";
      default:
        return "Review initiative details and confirm the current pipeline stage";
    }
  }

  async generateRecommendations(
    context: RecommendationContext,
  ): Promise<InitiativeRecommendationsResult> {
    const { initiative } = context;
    const { level: complexity, factors } = this.estimateComplexity(initiative);
    const value = this.summarizeBusinessValue(initiative);

    return {
      initiativeId: initiative.id,
      engine: this.name,
      generatedAt: new Date().toISOString(),
      similarInitiatives: this.findSimilarInitiatives(context),
      prototypeScope: this.recommendPrototypeScope(initiative),
      complexity,
      complexityFactors: factors,
      estimatedPrototypeDurationDays: this.estimateDurationDays(
        complexity,
        initiative,
      ),
      teamRoles: this.suggestTeamRoles(initiative, complexity),
      risks: this.identifyRisks(initiative),
      expectedBusinessValue: value.text,
      expectedAnnualValue: value.annualValue,
      confidenceScore: this.computeConfidence(initiative, complexity),
      nextAction: this.recommendNextAction(initiative),
    };
  }
}
