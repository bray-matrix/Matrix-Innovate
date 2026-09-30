import { assertSafeContent } from "../lib/content-safety";
import { parseInitiativeBrief, type InitiativeBrief } from "@workspace/initiative-brief";
import { Router, type IRouter } from "express";
import {
  db,
  initiativesTable,
  initiativeVersionsTable,
  calculationEventsTable,
  initiativeJiraLinksTable,
  jiraProjectsTable,
  interviewDraftsTable,
  type CalculationComponentChange,
} from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import type { AuthenticatedRequest } from "../matrix/auth";
import {
  CreateInitiativeBody,
  UpdateInitiativeBody,
} from "@workspace/api-zod";
import {
  calculateScore,
  derivePriority,
  recalculateComponents,
  COMPONENT_LABELS,
  type ScoringComponents,
} from "../lib/scoring";
import { bumpVersion, determineBumpKind, DEFAULT_VERSION } from "../lib/versioning";
import { getAIProvider } from "../lib/ai";
import { JiraClient, JiraError } from "../lib/jira-client";

const router: IRouter = Router();

const REVIEW_CYCLE_DAYS = 14;

type JiraIdentity = Pick<typeof initiativeJiraLinksTable.$inferSelect, "jiraIssueId" | "jiraIssueKey" | "jiraIssueType">;
function serialize(row: typeof initiativesTable.$inferSelect, jiraLinks: JiraIdentity[] = []) {
  return {
    ...row,
    jiraLinks,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function linksByInitiative(ids: number[]): Promise<Map<number, JiraIdentity[]>> {
  const result = new Map<number, JiraIdentity[]>();
  if (!ids.length) return result;
  const links = await db.select().from(initiativeJiraLinksTable)
    .where(inArray(initiativeJiraLinksTable.initiativeId, ids))
    .orderBy(initiativeJiraLinksTable.id);
  for (const link of links) {
    const list = result.get(link.initiativeId) ?? [];
    list.push({ jiraIssueId: link.jiraIssueId, jiraIssueKey: link.jiraIssueKey, jiraIssueType: link.jiraIssueType });
    result.set(link.initiativeId, list);
  }
  return result;
}
const withLinks = async (row: typeof initiativesTable.$inferSelect) =>
  serialize(row, (await linksByInitiative([row.id])).get(row.id) ?? []);

function serializeVersion(row: typeof initiativeVersionsTable.$inferSelect) {
  return {
    id: row.id,
    initiativeId: row.initiativeId,
    version: row.version,
    changedBy: row.changedBy,
    summary: row.summary,
    snapshot: row.snapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

// Fields captured in each version snapshot and used for side-by-side
// comparison. Order here controls display order in the comparison UI.
const SNAPSHOT_FIELDS = [
  "title",
  "department",
  "submitterName",
  "businessOwner",
  "executiveSponsor",
  "category",
  "status",
  "executiveSummary",
  "reviewedBrief",
  "problemStatement",
  "currentProcess",
  "desiredOutcome",
  "aiConcept",
  "prototypeGoal",
  "successMetric",
  "estimatedHoursSavedMonthly",
  "estimatedRevenueOpportunity",
  "estimatedCostSavings",
  "customerImpact",
  "complianceRisk",
  "technicalComplexity",
  "aiReadiness",
  "businessValue",
  "revenuePotential",
  "costSavingsScore",
  "customerImpactScore",
  "strategicAlignment",
  "aiReadinessScore",
  "prototypeConfidence",
  "technicalComplexityPenalty",
  "riskPenalty",
  "score",
  "priority",
  "assignedTeam",
  "currentPhase",
  "prototypeDay",
] as const;

function buildSnapshot(
  row: typeof initiativesTable.$inferSelect,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) {
    snapshot[field] = row[field];
  }
  return snapshot;
}

function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = (typeof value === "object" ? JSON.stringify(value) : String(value)).trim();
  return text === "" ? "—" : text;
}

// The shared export parser validates the semantic fields and their limits.
// Its OpenAPI envelope permits extra properties for export compatibility; do
// not persist arbitrary unbounded nested objects alongside the known model.
const briefShape = {
  metadata: ["title", "type", "department", "submitter", "businessOwner", "executiveSponsor", "generatedAt", "status", "jiraKey"],
  executiveSummary: ["text", "source"],
  businessNeed: ["problem", "currentState", "businessImpact"],
  futureState: ["outcome", "approach", "prototype"],
  expectedValue: ["qualitative", "quantified"],
  successMeasures: ["drafted", "candidates"],
  risks: ["text", "source"],
  unknowns: ["text", "priority"],
  nextSteps: ["text", "source"],
  assessment: ["score", "priority", "readiness", "factors"],
  supportingContext: ["facts", "jiraKey"],
} as const;
const textKeys = ["text", "source"];
function validBriefKeys(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const brief = value as Record<string, unknown>;
  if (Object.keys(brief).some(k => !(k in briefShape))) return false;
  const check = (item: unknown, keys: readonly string[]) =>
    !!item && typeof item === "object" && !Array.isArray(item) &&
    Object.keys(item).every(k => keys.includes(k));
  if (Object.entries(briefShape).some(([key, keys]) =>
    key !== "unknowns" && !check(brief[key], keys))) return false;
  const nested = [
    ...["problem", "currentState", "businessImpact"].map(k => (brief.businessNeed as Record<string, unknown>)[k]),
    ...["outcome", "approach", "prototype"].map(k => (brief.futureState as Record<string, unknown>)[k]),
    (brief.expectedValue as Record<string, unknown>).qualitative,
    ...((brief.expectedValue as Record<string, unknown>).quantified as unknown[] ?? []),
    (brief.successMeasures as Record<string, unknown>).drafted,
    ...((brief.successMeasures as Record<string, unknown>).candidates as unknown[] ?? []),
  ];
  if (nested.some(v => v !== undefined && !check(v, v && typeof v === "object" && "label" in v ? [...textKeys, "label", "status"] : textKeys))) return false;
  const arrays = [
    [(brief.expectedValue as Record<string, unknown>).quantified, [...textKeys, "label", "status"]],
    [(brief.successMeasures as Record<string, unknown>).candidates, textKeys],
    [brief.unknowns, ["text", "priority"]],
    [(brief.assessment as Record<string, unknown>).factors, ["label", "value"]],
    [(brief.supportingContext as Record<string, unknown>).facts, ["category", "value", "source"]],
  ] as const;
  return arrays.every(([items, keys]) => Array.isArray(items) && items.every(item => check(item, keys)));
}

function validatedBrief(input: unknown): InitiativeBrief {
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 64 * 1024) {
    throw new Error("Invalid or oversized Initiative Brief");
  }
  const brief = parseInitiativeBrief(input);
  if (!validBriefKeys(brief)) throw new Error("Invalid Initiative Brief structure");
  return brief;
}

router.get("/initiatives", async (_req, res) => {
  const rows = await db
    .select()
    .from(initiativesTable)
    .orderBy(desc(initiativesTable.createdAt));
  const links = await linksByInitiative(rows.map(row => row.id));
  res.json(rows.map(row => serialize(row, links.get(row.id) ?? [])));
});

router.post("/initiatives", async (req, res, next) => {
  assertSafeContent(req.body, "initiative_save");
  const parsed = CreateInitiativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid initiative data" });
    return;
  }
  const draftId = req.body?.interviewDraftId;
  let draftOwner: string | undefined;
  if (draftId !== undefined) {
    draftOwner = (req as AuthenticatedRequest).matrixIdentity?.sub;
    if (!draftOwner) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (typeof draftId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId)) {
      res.status(400).json({ error: "Invalid interview draft id" });
      return;
    }
  }
  const data = parsed.data;
  let reviewedBrief: InitiativeBrief | null = null;
  if (data.reviewedBrief !== undefined && data.reviewedBrief !== null) {
    try {
      reviewedBrief = validatedBrief(req.body.reviewedBrief);
    } catch {
      res.status(400).json({ error: "Invalid or oversized Initiative Brief" });
      return;
    }
  }
  // Jira I/O is bounded but should not hold a database row lock. A quick
  // owner-scoped receipt check avoids it for normal retries; the locked
  // recheck below remains authoritative if two saves race.
  let alreadySaved = false;
  if (draftId && draftOwner) {
    const [draft] = await db.select({ savedInitiativeId: interviewDraftsTable.savedInitiativeId })
      .from(interviewDraftsTable)
      .where(and(eq(interviewDraftsTable.id, draftId), eq(interviewDraftsTable.ownerSub, draftOwner)))
      .limit(1);
    alreadySaved = !!draft?.savedInitiativeId;
  }
  let issue: Awaited<ReturnType<JiraClient["issue"]>> | null = null;
  try {
    if (!alreadySaved && data.jiraIssueId !== undefined) {
      issue = await new JiraClient().issue(data.jiraIssueId);
    }
  } catch (error) {
    // If a concurrent save won while Jira was being checked, its receipt wins
    // even when Jira has gone offline. Do not create a second initiative.
    if (draftId && draftOwner) {
      const receipt = await db.transaction(async tx => {
        const [draft] = await tx.select({ savedInitiativeId: interviewDraftsTable.savedInitiativeId })
          .from(interviewDraftsTable)
          .where(and(eq(interviewDraftsTable.id, draftId), eq(interviewDraftsTable.ownerSub, draftOwner)))
          .for("update").limit(1);
        if (!draft?.savedInitiativeId) return null;
        const [saved] = await tx.select().from(initiativesTable)
          .where(eq(initiativesTable.id, draft.savedInitiativeId)).limit(1);
        return saved ?? null;
      });
      if (receipt) {
        res.status(201).json(await withLinks(receipt));
        return;
      }
    }
    if (error instanceof JiraError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
    return;
  }

  const now = new Date();
  const status = data.status ?? "Idea";
  const nextReviewAt = new Date(
    now.getTime() + REVIEW_CYCLE_DAYS * 24 * 60 * 60 * 1000,
  );

  let row: typeof initiativesTable.$inferSelect;
  try {
    row = await db.transaction(async (tx) => {
    // Lock the owner's active draft before saving. Start Over and competing
    // saves cannot produce a receipt for an absent or foreign draft.
    if (draftId && draftOwner) {
       const [owned] = await tx.select().from(interviewDraftsTable)
         .where(and(eq(interviewDraftsTable.id, draftId), eq(interviewDraftsTable.ownerSub, draftOwner)))
        .for("update").limit(1);
      if (!owned) throw new Error("INTERVIEW_DRAFT_NOT_FOUND");
       if (owned.savedInitiativeId) {
         const [saved] = await tx.select().from(initiativesTable).where(eq(initiativesTable.id, owned.savedInitiativeId)).limit(1);
         if (saved) return saved;
         throw new Error("INTERVIEW_DRAFT_NOT_FOUND");
       }
       if (owned.status !== "active") throw new Error("INTERVIEW_DRAFT_NOT_FOUND");
    }
     // Always recheck receipt under the lock: the preflight is only an I/O
     // optimization and does not decide whether the draft may create a row.
     const components: ScoringComponents = {
       businessValue: data.businessValue ?? 0,
       revenuePotential: data.revenuePotential ?? 0,
       costSavingsScore: data.costSavingsScore ?? 0,
       customerImpactScore: data.customerImpactScore ?? 0,
       strategicAlignment: data.strategicAlignment ?? 0,
       aiReadinessScore: data.aiReadinessScore ?? 0,
       prototypeConfidence: data.prototypeConfidence ?? 0,
       technicalComplexityPenalty: data.technicalComplexityPenalty ?? 0,
       riskPenalty: data.riskPenalty ?? 0,
     };
     const scoringSupplied = (Object.keys(components) as (keyof ScoringComponents)[])
       .some(key => data[key] !== undefined);
     const score = scoringSupplied ? calculateScore(components) : 0;
    const [created] = await tx
      .insert(initiativesTable)
      .values({
        title: data.title,
        department: data.department,
        submitterName: data.submitterName,
        businessOwner: data.businessOwner ?? null,
        executiveSponsor: data.executiveSponsor ?? null,
        executiveSummary:
          data.executiveSummary === undefined ||
          data.executiveSummary.trim() === ""
            ? null
            : data.executiveSummary,
        reviewedBrief,
        ...components,
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
        score,
        priority: derivePriority(score),
      })
      .returning();

    await tx.insert(initiativeVersionsTable).values({
      initiativeId: created.id,
      version: DEFAULT_VERSION,
      changedBy: data.submitterName || "System",
      summary: "Initiative created",
      snapshot: buildSnapshot(created),
    });
    if (issue) {
      const [project] = await tx.select({ id: jiraProjectsTable.id }).from(jiraProjectsTable)
        .where(eq(jiraProjectsTable.jiraProjectId, issue.jiraProjectId)).limit(1);
      await tx.insert(initiativeJiraLinksTable).values({
        initiativeId: created.id, jiraProjectId: project?.id ?? null,
        jiraIssueId: issue.jiraIssueId, jiraIssueKey: issue.jiraIssueKey,
        jiraIssueType: issue.jiraIssueType,
      });
    }

    if (draftId && draftOwner) {
      await tx.update(interviewDraftsTable)
         .set({ savedInitiativeId: created.id, status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(interviewDraftsTable.id, draftId), eq(interviewDraftsTable.ownerSub, draftOwner), eq(interviewDraftsTable.status, "active")));
    }

    return created;
  });
  } catch (error) {
    if (error instanceof JiraError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "INTERVIEW_DRAFT_NOT_FOUND") {
      res.status(404).json({ error: "Active interview draft not found" });
      return;
    }
    next(error);
    return;
  }

  res.status(201).json(await withLinks(row));
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

router.get("/initiatives/:id/recommendations", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [initiative] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  const allInitiatives = await db.select().from(initiativesTable);
  // All AI-generated intelligence goes through the provider abstraction —
  // never a vendor implementation directly.
  const provider = getAIProvider();
  const recommendations = await provider.generateRecommendations({
    initiative,
    allInitiatives,
  });
  res.json(recommendations);
});

router.post("/initiatives/:id/recalculate", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
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

  const inputs = {
    estimatedRevenueOpportunity: existing.estimatedRevenueOpportunity,
    estimatedCostSavings: existing.estimatedCostSavings,
    estimatedHoursSavedMonthly: existing.estimatedHoursSavedMonthly,
    aiReadiness: existing.aiReadiness,
    technicalComplexity: existing.technicalComplexity,
    complianceRisk: existing.complianceRisk,
  };
  const previousComponents: ScoringComponents = {
    businessValue: existing.businessValue,
    revenuePotential: existing.revenuePotential,
    costSavingsScore: existing.costSavingsScore,
    customerImpactScore: existing.customerImpactScore,
    strategicAlignment: existing.strategicAlignment,
    aiReadinessScore: existing.aiReadinessScore,
    prototypeConfidence: existing.prototypeConfidence,
    technicalComplexityPenalty: existing.technicalComplexityPenalty,
    riskPenalty: existing.riskPenalty,
  };
  const components = recalculateComponents(inputs, previousComponents);
  const score = calculateScore(components);
  const priority = derivePriority(score);

  // Build the per-component diff with reasons for every changed value.
  // Explanation text comes from the AI provider abstraction (rule-based today).
  const aiProvider = getAIProvider();
  const reasons = await aiProvider.explainScoreChange(inputs, components);
  const componentKeys = Object.keys(
    COMPONENT_LABELS,
  ) as (keyof ScoringComponents)[];
  const changes: CalculationComponentChange[] = [];
  const unchangedComponents: string[] = [];
  for (const key of componentKeys) {
    if (components[key] !== previousComponents[key]) {
      changes.push({
        component: key,
        label: COMPONENT_LABELS[key],
        previous: previousComponents[key],
        next: components[key],
        reason: reasons[key],
      });
    } else {
      unchangedComponents.push(COMPONENT_LABELS[key]);
    }
  }

  const changed =
    changes.length > 0 || score !== existing.score || priority !== existing.priority;

  // Data-drift edge case: the stored total can be out of sync with the stored
  // components (e.g. legacy or manually adjusted data). Ensure the result
  // always explains why the score moved, even when no component changed.
  if (changed && changes.length === 0) {
    changes.push({
      component: "total",
      label: "Innovation Score",
      previous: existing.score,
      next: score,
      reason:
        "The stored total was out of sync with its scoring components; it was recomputed from the current component values.",
    });
  }
  const changedBy = existing.submitterName || "System";

  const buildResult = async (
    row: typeof initiativesTable.$inferSelect,
  ) => ({
    initiative: await withLinks(row),
    changed,
    previousScore: existing.score,
    newScore: score,
    netScoreChange: score - existing.score,
    previousPriority: existing.priority,
    newPriority: priority,
    changes,
    unchangedComponents,
    sourceLabel: aiProvider.sourceLabel,
  });

  if (!changed) {
    // Audit even no-change recalculations so the full history is preserved.
    await db.insert(calculationEventsTable).values({
      initiativeId: id,
      changedBy,
      previousScore: existing.score,
      newScore: score,
      previousPriority: existing.priority,
      newPriority: priority,
      changes: [],
    });
    res.json(await buildResult(existing));
    return;
  }

  const newVersion = bumpVersion(existing.version, "patch");
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(initiativesTable)
      .set({
        ...components,
        score,
        priority,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(initiativesTable.id, id))
      .returning();

    await tx.insert(initiativeVersionsTable).values({
      initiativeId: id,
      version: newVersion,
      changedBy,
      summary: `Recalculated scoring and AI readiness (score ${existing.score} to ${score})`,
      snapshot: buildSnapshot(updated),
    });

    await tx.insert(calculationEventsTable).values({
      initiativeId: id,
      changedBy,
      previousScore: existing.score,
      newScore: score,
      previousPriority: existing.priority,
      newPriority: priority,
      changes,
    });

    return updated;
  });

  res.json(await buildResult(row));
});

router.get("/initiatives/:id/calculations", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [initiative] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  const events = await db
    .select()
    .from(calculationEventsTable)
    .where(eq(calculationEventsTable.initiativeId, id))
    .orderBy(desc(calculationEventsTable.createdAt), desc(calculationEventsTable.id));
  res.json(
    events.map((event) => ({
      id: event.id,
      initiativeId: event.initiativeId,
      changedBy: event.changedBy,
      previousScore: event.previousScore,
      newScore: event.newScore,
      previousPriority: event.previousPriority,
      newPriority: event.newPriority,
      changes: event.changes,
      createdAt: event.createdAt.toISOString(),
    })),
  );
});

router.get("/initiatives/:id/compare", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [initiative] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, id));
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }

  const versions = await db
    .select()
    .from(initiativeVersionsTable)
    .where(eq(initiativeVersionsTable.initiativeId, id))
    .orderBy(desc(initiativeVersionsTable.createdAt), desc(initiativeVersionsTable.id))
    .limit(2);

  if (versions.length < 2) {
    res.json({
      available: false,
      currentVersion: initiative.version,
      previousVersion: null,
      reason: "There is no previous version to compare against yet.",
      fields: [],
    });
    return;
  }

  const previous = versions[1];
  if (!previous.snapshot) {
    res.json({
      available: false,
      currentVersion: initiative.version,
      previousVersion: previous.version,
      reason:
        "The previous version predates snapshot support, so a field comparison is not available.",
      fields: [],
    });
    return;
  }

  const currentSnapshot = buildSnapshot(initiative);
  const previousSnapshot = previous.snapshot as Record<string, unknown>;
  const fields = SNAPSHOT_FIELDS.map((field) => {
    const previousValue = formatSnapshotValue(previousSnapshot[field]);
    const currentValue = formatSnapshotValue(currentSnapshot[field]);
    return {
      field,
      label: FIELD_LABELS[field] ?? field,
      previous: previousValue,
      current: currentValue,
      changed: previousValue !== currentValue,
    };
  });

  res.json({
    available: true,
    currentVersion: initiative.version,
    previousVersion: previous.version,
    reason: null,
    fields,
  });
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
  res.json(await withLinks(row));
});

router.patch("/initiatives/:id", async (req, res) => {
  assertSafeContent(req.body, "initiative_review");
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
  let reviewedBrief: InitiativeBrief | null | undefined;
  if (data.reviewedBrief !== undefined) {
    try {
      reviewedBrief = data.reviewedBrief === null ? null : validatedBrief(req.body.reviewedBrief);
    } catch {
      res.status(400).json({ error: "Invalid or oversized Initiative Brief" });
      return;
    }
  }
  const now = new Date();
  const updates: Partial<typeof initiativesTable.$inferInsert> = {
    updatedAt: now,
  };
  const changed: string[] = [];
  if (reviewedBrief !== undefined && JSON.stringify(reviewedBrief) !== JSON.stringify(existing.reviewedBrief)) {
    updates.reviewedBrief = reviewedBrief;
    changed.push("reviewedBrief");
  }

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

  // Executive summary override: empty string clears the override (falls back
  // to the auto-generated summary), so normalize before change detection.
  if (data.executiveSummary !== undefined) {
    const normalized =
      data.executiveSummary.trim() === "" ? null : data.executiveSummary;
    if (normalized !== existing.executiveSummary) {
      updates.executiveSummary = normalized;
      changed.push("executiveSummary");
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
    res.json(await withLinks(existing));
    return;
  }

  const bumpKind = determineBumpKind(statusChanged, newStatus);
  const newVersion = bumpVersion(existing.version, bumpKind);
  updates.version = newVersion;
  // Validate the merged record too: an edit must not re-persist legacy restricted text.
  assertSafeContent({ ...existing, ...updates }, "initiative_update");

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
      snapshot: buildSnapshot(updated),
    });

    return updated;
  });

  res.json(await withLinks(row));
});

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  department: "Department",
  submitterName: "Submitter",
  businessOwner: "Business Owner",
  executiveSponsor: "Executive Sponsor",
  category: "Category",
  status: "Status",
  executiveSummary: "Executive Summary",
  reviewedBrief: "Reviewed Initiative Brief",
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
  priority: "Priority",
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
