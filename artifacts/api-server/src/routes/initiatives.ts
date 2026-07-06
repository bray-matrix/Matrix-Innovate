import { Router, type IRouter } from "express";
import { db, initiativesTable, initiativeVersionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateInitiativeBody,
  UpdateInitiativeBody,
} from "@workspace/api-zod";
import { calculateScore, derivePriority } from "../lib/scoring";
import { bumpVersion, determineBumpKind, DEFAULT_VERSION } from "../lib/versioning";

const router: IRouter = Router();

const REVIEW_CYCLE_DAYS = 14;

function serialize(row: typeof initiativesTable.$inferSelect) {
  return {
    ...row,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeVersion(row: typeof initiativeVersionsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
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

  const now = new Date();
  const status = data.status ?? "Idea";
  const nextReviewAt = new Date(
    now.getTime() + REVIEW_CYCLE_DAYS * 24 * 60 * 60 * 1000,
  );

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(initiativesTable)
      .values({
        title: data.title,
        department: data.department,
        submitterName: data.submitterName,
        businessOwner: data.businessOwner ?? null,
        executiveSponsor: data.executiveSponsor ?? null,
        category: data.category,
        status,
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
        assignedTeam: data.assignedTeam ?? null,
        currentPhase: data.currentPhase ?? status,
        prototypeDay: data.prototypeDay ?? null,
        nextReviewAt,
        version: DEFAULT_VERSION,
        score: 0,
        priority: "Low",
      })
      .returning();

    await tx.insert(initiativeVersionsTable).values({
      initiativeId: created.id,
      version: DEFAULT_VERSION,
      changedBy: data.submitterName || "System",
      summary: "Initiative created",
    });

    return created;
  });

  res.status(201).json(serialize(row));
});

router.get("/initiatives/:id/versions", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(initiativeVersionsTable)
    .where(eq(initiativeVersionsTable.initiativeId, id))
    .orderBy(desc(initiativeVersionsTable.createdAt));
  res.json(rows.map(serializeVersion));
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
  const now = new Date();
  const updates: Partial<typeof initiativesTable.$inferInsert> = {
    updatedAt: now,
  };
  const changed: string[] = [];

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
    "assignedTeam",
    "currentPhase",
  ] as const;
  for (const field of stringFields) {
    if (data[field] !== undefined && data[field] !== existing[field]) {
      (updates as Record<string, unknown>)[field] = data[field];
      changed.push(field);
    }
  }

  const numberFields = [
    "estimatedHoursSavedMonthly",
    "estimatedRevenueOpportunity",
    "estimatedCostSavings",
    "prototypeDay",
  ] as const;
  for (const field of numberFields) {
    if (data[field] !== undefined && data[field] !== existing[field]) {
      (updates as Record<string, unknown>)[field] = data[field];
      changed.push(field);
    }
  }

  const dateFields = ["lastReviewedAt", "nextReviewAt"] as const;
  for (const field of dateFields) {
    if (data[field] !== undefined) {
      let value: Date | null = null;
      if (data[field]) {
        value = new Date(data[field] as string);
        if (Number.isNaN(value.getTime())) {
          res.status(400).json({ error: `Invalid date for ${field}` });
          return;
        }
      }
      (updates as Record<string, unknown>)[field] = value;
      changed.push(field);
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
    if (data[field] !== undefined && data[field] !== existing[field]) {
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
    changed.push("score");
  }

  const statusChanged = changed.includes("status");
  const newStatus = statusChanged ? (data.status as string) : existing.status;

  // Governance auto-rules on status change.
  if (statusChanged) {
    if (data.currentPhase === undefined) {
      updates.currentPhase = newStatus;
    }
    updates.nextReviewAt = new Date(
      now.getTime() + REVIEW_CYCLE_DAYS * 24 * 60 * 60 * 1000,
    );
    if (newStatus.toLowerCase() === "review" && data.lastReviewedAt === undefined) {
      updates.lastReviewedAt = now;
    }
  }

  // No meaningful change — return existing without bumping the version.
  if (changed.length === 0) {
    res.json(serialize(existing));
    return;
  }

  const bumpKind = determineBumpKind(statusChanged, newStatus);
  const newVersion = bumpVersion(existing.version, bumpKind);
  updates.version = newVersion;

  const summary =
    (data.changeSummary && data.changeSummary.trim()) ||
    buildChangeSummary(changed, existing.status, newStatus, statusChanged);

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(initiativesTable)
      .set(updates)
      .where(eq(initiativesTable.id, id))
      .returning();

    await tx.insert(initiativeVersionsTable).values({
      initiativeId: id,
      version: newVersion,
      changedBy: data.updatedBy?.trim() || existing.submitterName || "System",
      summary,
    });

    return updated;
  });

  res.json(serialize(row));
});

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  department: "Department",
  submitterName: "Submitter",
  businessOwner: "Business Owner",
  executiveSponsor: "Executive Sponsor",
  category: "Category",
  status: "Status",
  problemStatement: "Problem Statement",
  currentProcess: "Current Process",
  desiredOutcome: "Desired Outcome",
  aiConcept: "AI Concept",
  prototypeGoal: "Prototype Goal",
  successMetric: "Success Metric",
  customerImpact: "Customer Impact",
  complianceRisk: "Compliance Risk",
  technicalComplexity: "Technical Complexity",
  aiReadiness: "AI Readiness",
  assignedTeam: "Assigned Team",
  currentPhase: "Current Phase",
  estimatedHoursSavedMonthly: "Hours Saved",
  estimatedRevenueOpportunity: "Revenue Opportunity",
  estimatedCostSavings: "Cost Savings",
  prototypeDay: "Prototype Day",
  lastReviewedAt: "Last Reviewed",
  nextReviewAt: "Next Review",
  score: "Score",
};

function buildChangeSummary(
  changed: string[],
  oldStatus: string,
  newStatus: string,
  statusChanged: boolean,
): string {
  if (statusChanged) {
    const rest = changed.filter((c) => c !== "status");
    const base = `Status changed from ${oldStatus} to ${newStatus}`;
    if (rest.length === 0) return base;
    const labels = rest.map((c) => FIELD_LABELS[c] ?? c);
    return `${base}; also updated ${labels.join(", ")}`;
  }
  const labels = changed.map((c) => FIELD_LABELS[c] ?? c);
  return `Updated ${labels.join(", ")}`;
}

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
