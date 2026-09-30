import { Router, type IRouter } from "express";
import {
  db,
  organizationsTable,
  clientsTable,
  programsTable,
  projectsTable,
  projectMilestonesTable,
  initiativesTable,
  initiativeJiraLinksTable,
  projectJiraLinksTable,
  type Organization,
  type Client,
  type Program,
  type Project,
  type ProjectMilestone,
} from "@workspace/db";
import { eq, desc, asc, and } from "drizzle-orm";
import {
  projectRisksTable,
  projectApprovalsTable,
  readinessAssessmentsTable,
  readinessItemsTable,
} from "@workspace/db";
import {
  computeCalculatedHealth,
  computeReadinessStatus,
  effectiveHealth,
  isHealthOverridden,
  type ReadinessStatus,
} from "../lib/project-health";
import type { AuthenticatedRequest } from "../matrix/auth";
import {
  CreateOrganizationBody,
  UpdateOrganizationBody,
  CreateClientBody,
  UpdateClientBody,
  CreateProgramBody,
  UpdateProgramBody,
  CreateProjectBody,
  UpdateProjectBody,
  CreateProjectMilestoneBody,
  UpdateProjectMilestoneBody,
  PromoteInitiativeBody,
} from "@workspace/api-zod";

// Compass execution domain routes (Phase 1 consolidation).
// Follows the repo's contract-first pattern: Zod-validated input, Drizzle
// persistence, ISO-serialized timestamps. All additive — no Innovation Hub
// route or table is modified.

const router: IRouter = Router();

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function serializeOrganization(row: Organization) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
const serializeClient = (row: Client) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const serializeProgram = (row: Program) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const serializeProject = (row: Project) => ({
  ...row,
  targetDate: iso(row.targetDate),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const serializeMilestone = (row: ProjectMilestone) => ({
  ...row,
  dueDate: iso(row.dueDate),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Zod bodies coerce date-time strings to Date; accept both for safety.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

router.get("/organizations", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(organizationsTable)
      .orderBy(asc(organizationsTable.name));
    res.json(rows.map(serializeOrganization));
  } catch (err) {
    next(err);
  }
});

router.post("/organizations", async (req, res, next) => {
  try {
    const parsed = CreateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(organizationsTable)
      .values(parsed.data)
      .returning();
    req.log.info({ organizationId: created.id }, "organization created");
    res.status(201).json(serializeOrganization(created));
  } catch (err) {
    next(err);
  }
});

router.get("/organizations/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(serializeOrganization(row));
  } catch (err) {
    next(err);
  }
});

router.patch("/organizations/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(organizationsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(organizationsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(serializeOrganization(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/organizations/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(organizationsTable)
      .where(eq(organizationsTable.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

router.get("/clients", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(clientsTable)
      .orderBy(asc(clientsTable.name));
    res.json(rows.map(serializeClient));
  } catch (err) {
    next(err);
  }
});

router.post("/clients", async (req, res, next) => {
  try {
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(clientsTable)
      .values(parsed.data)
      .returning();
    req.log.info({ clientId: created.id }, "client created");
    res.status(201).json(serializeClient(created));
  } catch (err) {
    next(err);
  }
});

router.get("/clients/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(serializeClient(row));
  } catch (err) {
    next(err);
  }
});

router.patch("/clients/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateClientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(clientsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(clientsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(serializeClient(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/clients/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(clientsTable)
      .where(eq(clientsTable.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

router.get("/programs", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(programsTable)
      .orderBy(asc(programsTable.name));
    res.json(rows.map(serializeProgram));
  } catch (err) {
    next(err);
  }
});

router.post("/programs", async (req, res, next) => {
  try {
    const parsed = CreateProgramBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(programsTable)
      .values(parsed.data)
      .returning();
    req.log.info({ programId: created.id }, "program created");
    res.status(201).json(serializeProgram(created));
  } catch (err) {
    next(err);
  }
});

router.get("/programs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(programsTable)
      .where(eq(programsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    res.json(serializeProgram(row));
  } catch (err) {
    next(err);
  }
});

router.patch("/programs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateProgramBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(programsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(programsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    res.json(serializeProgram(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/programs/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(programsTable)
      .where(eq(programsTable.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

router.get("/projects", async (req, res, next) => {
  try {
    const initiativeIdRaw = req.query["initiativeId"];
    let where;
    if (typeof initiativeIdRaw === "string" && initiativeIdRaw !== "") {
      const initiativeId = parseId(initiativeIdRaw);
      if (!initiativeId) {
        res.status(400).json({ error: "Invalid initiativeId" });
        return;
      }
      where = eq(projectsTable.initiativeId, initiativeId);
    }
    const query = db.select().from(projectsTable);
    const rows = where
      ? await query.where(where).orderBy(desc(projectsTable.id))
      : await query.orderBy(desc(projectsTable.id));
    res.json(rows.map(serializeProject));
  } catch (err) {
    next(err);
  }
});

router.post("/projects", async (req, res, next) => {
  try {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { targetDate, ...rest } = parsed.data;
    const [created] = await db
      .insert(projectsTable)
      .values({ ...rest, targetDate: toDate(targetDate) })
      .returning();
    req.log.info({ projectId: created.id }, "project created");
    res.status(201).json(serializeProject(created));
  } catch (err) {
    next(err);
  }
});

router.get("/projects/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const milestones = await db
      .select()
      .from(projectMilestonesTable)
      .where(eq(projectMilestonesTable.projectId, id))
      .orderBy(
        asc(projectMilestonesTable.sequence),
        asc(projectMilestonesTable.id),
      );
    let initiativeTitle: string | null = null;
    if (row.initiativeId) {
      const [initiative] = await db
        .select({ title: initiativesTable.title })
        .from(initiativesTable)
        .where(eq(initiativesTable.id, row.initiativeId));
      initiativeTitle = initiative?.title ?? null;
    }
    // Deterministic health (Phase 2): calculated server-side from risks,
    // milestones, approvals, and readiness; manual override honored.
    const [risks, approvals, assessments] = await Promise.all([
      db
        .select()
        .from(projectRisksTable)
        .where(eq(projectRisksTable.projectId, id)),
      db
        .select()
        .from(projectApprovalsTable)
        .where(eq(projectApprovalsTable.projectId, id)),
      db
        .select()
        .from(readinessAssessmentsTable)
        .where(eq(readinessAssessmentsTable.projectId, id))
        .orderBy(desc(readinessAssessmentsTable.id)),
    ]);
    const readinessStatuses: ReadinessStatus[] = await Promise.all(
      assessments.map(async (a) => {
        const items = await db
          .select()
          .from(readinessItemsTable)
          .where(eq(readinessItemsTable.assessmentId, a.id));
        return computeReadinessStatus(items, a.targetDate);
      }),
    );
    const calculated = computeCalculatedHealth({
      project: row,
      risks,
      milestones,
      approvals,
      readinessStatuses,
    });
    res.json({
      ...serializeProject(row),
      milestones: milestones.map(serializeMilestone),
      initiativeTitle,
      calculatedHealth: calculated,
      effectiveHealth: effectiveHealth(row, calculated),
      healthOverridden: isHealthOverridden(row),
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/projects/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { targetDate, healthOverrideReason, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (targetDate !== undefined) patch["targetDate"] = toDate(targetDate);
    // Setting health records an explicit manual override (who/when/why);
    // setting it back to "Unknown" clears the override so calculated health
    // applies again. Overrides are never silently overwritten server-side.
    if (parsed.data.health !== undefined) {
      if (parsed.data.health === "Unknown") {
        patch["healthOverrideReason"] = null;
        patch["healthOverrideBy"] = null;
        patch["healthOverrideAt"] = null;
      } else {
        const identity = (req as AuthenticatedRequest).matrixIdentity;
        patch["healthOverrideReason"] = healthOverrideReason ?? null;
        patch["healthOverrideBy"] =
          identity?.name ?? identity?.email ?? identity?.sub ?? "unknown";
        patch["healthOverrideAt"] = new Date();
      }
    }
    const [updated] = await db
      .update(projectsTable)
      .set(patch)
      .where(eq(projectsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(serializeProject(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/projects/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(projectsTable)
      .where(eq(projectsTable.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Project milestones
// ---------------------------------------------------------------------------

router.get("/projects/:id/milestones", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectMilestonesTable)
      .where(eq(projectMilestonesTable.projectId, id))
      .orderBy(
        asc(projectMilestonesTable.sequence),
        asc(projectMilestonesTable.id),
      );
    res.json(rows.map(serializeMilestone));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/milestones", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const parsed = CreateProjectMilestoneBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dueDate, ...rest } = parsed.data;
    const [created] = await db
      .insert(projectMilestonesTable)
      .values({ ...rest, projectId: id, dueDate: toDate(dueDate) })
      .returning();
    req.log.info(
      { projectId: id, milestoneId: created.id },
      "project milestone created",
    );
    res.status(201).json(serializeMilestone(created));
  } catch (err) {
    next(err);
  }
});

router.patch("/projects/:id/milestones/:milestoneId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const milestoneId = parseId(req.params.milestoneId);
    if (!id || !milestoneId) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateProjectMilestoneBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dueDate, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (dueDate !== undefined) patch["dueDate"] = toDate(dueDate);
    const [updated] = await db
      .update(projectMilestonesTable)
      .set(patch)
      .where(
        and(
          eq(projectMilestonesTable.id, milestoneId),
          eq(projectMilestonesTable.projectId, id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    res.json(serializeMilestone(updated));
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/projects/:id/milestones/:milestoneId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const milestoneId = parseId(req.params.milestoneId);
      if (!id || !milestoneId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const deleted = await db
        .delete(projectMilestonesTable)
        .where(
          and(
            eq(projectMilestonesTable.id, milestoneId),
            eq(projectMilestonesTable.projectId, id),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Milestone not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Initiative -> Project promotion
// ---------------------------------------------------------------------------
// Creates an execution project linked to the initiative. The initiative row
// is never mutated or deleted — it remains the innovation/business-case
// record. Duplicate promotion is blocked unless allowDuplicate is set.

router.post("/initiatives/:id/promote", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = PromoteInitiativeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!parsed.data.primaryOwner.trim()) {
      res.status(400).json({ error: "Primary Owner is required" });
      return;
    }
    // Transaction with a row lock on the initiative serializes concurrent
    // promotions of the same initiative, making the duplicate check atomic.
    const result = await db.transaction(async (tx) => {
      const [initiative] = await tx
        .select()
        .from(initiativesTable)
        .where(eq(initiativesTable.id, id))
        .for("update");
      if (!initiative) {
        return { kind: "notFound" as const };
      }
      if (!parsed.data.allowDuplicate) {
        const existing = await tx
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.initiativeId, id));
        if (existing.length > 0) {
          return { kind: "duplicate" as const };
        }
      }
      const supportingOwners = [
        initiative.businessOwner,
        initiative.executiveSponsor,
      ]
        .filter(
          (owner): owner is string =>
            !!owner && owner !== parsed.data.primaryOwner,
        )
        .join(", ");
      const [created] = await tx
        .insert(projectsTable)
        .values({
          initiativeId: id,
          organizationId: parsed.data.organizationId ?? null,
          clientId: parsed.data.clientId ?? null,
          programId: parsed.data.programId ?? null,
          name: initiative.title,
          description:
            [
              initiative.executiveSummary || initiative.problemStatement,
              initiative.executiveSummary && initiative.problemStatement ? `Problem / Opportunity: ${initiative.problemStatement}` : null,
              initiative.currentProcess ? `Current Process: ${initiative.currentProcess}` : null,
              initiative.desiredOutcome ? `Desired Outcome: ${initiative.desiredOutcome}` : null,
              initiative.successMetric ? `Success Measures: ${initiative.successMetric}` : null,
            ].filter(Boolean).join("\n\n"),
          projectType: parsed.data.projectType,
          lifecycleStage: "Planning",
          state: "Active",
          health: "Unknown",
          priority: initiative.priority,
          primaryOwner: parsed.data.primaryOwner.trim(),
          supportingOwners,
          targetDate: toDate(parsed.data.targetDate),
        })
        .returning();
      const jiraLinks = await tx.select().from(initiativeJiraLinksTable)
        .where(eq(initiativeJiraLinksTable.initiativeId, id));
      for (const link of jiraLinks) {
        await tx.insert(projectJiraLinksTable).values({
          projectId: created.id, jiraProjectId: link.jiraProjectId,
          jiraIssueId: link.jiraIssueId, jiraIssueKey: link.jiraIssueKey,
          jiraIssueType: link.jiraIssueType,
        }).onConflictDoNothing({ target: [projectJiraLinksTable.projectId, projectJiraLinksTable.jiraIssueId] });
      }
      return { kind: "created" as const, created };
    });
    if (result.kind === "notFound") {
      res.status(404).json({ error: "Initiative not found" });
      return;
    }
    if (result.kind === "duplicate") {
      res.status(409).json({
        error:
          "Initiative already has a linked project. Set allowDuplicate to create an additional related project.",
      });
      return;
    }
    const created = result.created;
    req.log.info(
      { initiativeId: id, projectId: created.id },
      "initiative promoted to project",
    );
    res.status(201).json(serializeProject(created));
  } catch (err) {
    next(err);
  }
});

export default router;
