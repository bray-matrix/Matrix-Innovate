import { Router, type IRouter } from "express";
import { db, initiativesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateInitiativeBody,
  UpdateInitiativeBody,
} from "@workspace/api-zod";
import { calculateScore, derivePriority } from "../lib/scoring";

const router: IRouter = Router();

function serialize(row: typeof initiativesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/initiatives", async (_req, res) => {
  const rows = await db
    .select()
    .from(initiativesTable)
    .orderBy(desc(initiativesTable.createdAt));
  res.json(rows.map(serialize));
});

router.post("/initiatives", async (req, res) => {
  const parsed = CreateInitiativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid initiative data" });
    return;
  }
  const data = parsed.data;

  const [row] = await db
    .insert(initiativesTable)
    .values({
      title: data.title,
      department: data.department,
      submitterName: data.submitterName,
      businessOwner: data.businessOwner ?? null,
      executiveSponsor: data.executiveSponsor ?? null,
      category: data.category,
      status: data.status ?? "Idea",
      problemStatement: data.problemStatement,
      currentProcess: data.currentProcess,
      desiredOutcome: data.desiredOutcome,
      aiConcept: data.aiConcept,
      prototypeGoal: data.prototypeGoal,
      successMetric: data.successMetric,
      estimatedHoursSavedMonthly: data.estimatedHoursSavedMonthly ?? 0,
      estimatedRevenueOpportunity: data.estimatedRevenueOpportunity ?? 0,
      estimatedCostSavings: data.estimatedCostSavings ?? 0,
      customerImpact: data.customerImpact ?? "",
      complianceRisk: data.complianceRisk ?? "",
      technicalComplexity: data.technicalComplexity ?? "",
      aiReadiness: data.aiReadiness ?? "",
      score: 0,
      priority: "Low",
    })
    .returning();

  res.status(201).json(serialize(row));
});

router.get("/initiatives/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  res.json(serialize(row));
});

router.patch("/initiatives/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateInitiativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update data" });
    return;
  }

  const [existing] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const data = parsed.data;
  const updates: Partial<typeof initiativesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  const stringFields = [
    "title",
    "department",
    "submitterName",
    "businessOwner",
    "executiveSponsor",
    "category",
    "status",
    "problemStatement",
    "currentProcess",
    "desiredOutcome",
    "aiConcept",
    "prototypeGoal",
    "successMetric",
    "customerImpact",
    "complianceRisk",
    "technicalComplexity",
    "aiReadiness",
  ] as const;
  for (const field of stringFields) {
    if (data[field] !== undefined) {
      (updates as Record<string, unknown>)[field] = data[field];
    }
  }

  const numberFields = [
    "estimatedHoursSavedMonthly",
    "estimatedRevenueOpportunity",
    "estimatedCostSavings",
  ] as const;
  for (const field of numberFields) {
    if (data[field] !== undefined) {
      (updates as Record<string, unknown>)[field] = data[field];
    }
  }

  const scoreFields = [
    "businessValue",
    "revenuePotential",
    "costSavingsScore",
    "customerImpactScore",
    "strategicAlignment",
    "aiReadinessScore",
    "prototypeConfidence",
    "technicalComplexityPenalty",
    "riskPenalty",
  ] as const;
  let scoringTouched = false;
  for (const field of scoreFields) {
    if (data[field] !== undefined) {
      (updates as Record<string, unknown>)[field] = data[field];
      scoringTouched = true;
    }
  }

  if (scoringTouched) {
    const components = {
      businessValue: data.businessValue ?? existing.businessValue,
      revenuePotential: data.revenuePotential ?? existing.revenuePotential,
      costSavingsScore: data.costSavingsScore ?? existing.costSavingsScore,
      customerImpactScore:
        data.customerImpactScore ?? existing.customerImpactScore,
      strategicAlignment:
        data.strategicAlignment ?? existing.strategicAlignment,
      aiReadinessScore: data.aiReadinessScore ?? existing.aiReadinessScore,
      prototypeConfidence:
        data.prototypeConfidence ?? existing.prototypeConfidence,
      technicalComplexityPenalty:
        data.technicalComplexityPenalty ?? existing.technicalComplexityPenalty,
      riskPenalty: data.riskPenalty ?? existing.riskPenalty,
    };
    const score = calculateScore(components);
    updates.score = score;
    updates.priority = derivePriority(score);
  }

  const [row] = await db
    .update(initiativesTable)
    .set(updates)
    .where(eq(initiativesTable.id, id))
    .returning();

  res.json(serialize(row));
});

router.delete("/initiatives/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = await db
    .delete(initiativesTable)
    .where(eq(initiativesTable.id, id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  res.status(204).send();
});

export default router;
