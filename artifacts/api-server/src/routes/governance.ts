import { Router, type IRouter } from "express";
import {
  db,
  projectsTable,
  projectRisksTable,
  projectApprovalsTable,
  readinessAssessmentsTable,
  readinessItemsTable,
  type ProjectRisk,
  type ProjectApproval,
  type ReadinessAssessment,
  type ReadinessItem,
} from "@workspace/db";
import { eq, asc, desc, and, inArray } from "drizzle-orm";
import {
  CreateProjectRiskBody,
  UpdateProjectRiskBody,
  CreateProjectApprovalBody,
  UpdateProjectApprovalBody,
  CreateReadinessAssessmentBody,
  UpdateReadinessAssessmentBody,
  CreateReadinessItemBody,
  UpdateReadinessItemBody,
} from "@workspace/api-zod";
import {
  computeReadinessStatus,
  STANDARD_READINESS_CATEGORIES,
} from "../lib/project-health";

// Phase 2 governance routes: risks, approvals, go-live readiness.
// Readiness status is always computed server-side and never stored.

const router: IRouter = Router();

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const serializeRisk = (row: ProjectRisk) => ({
  ...row,
  dueDate: iso(row.dueDate),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const serializeApproval = (row: ProjectApproval) => ({
  ...row,
  requestedAt: row.requestedAt.toISOString(),
  decidedAt: iso(row.decidedAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const serializeItem = (row: ReadinessItem) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
function serializeAssessment(row: ReadinessAssessment, items: ReadinessItem[]) {
  return {
    ...row,
    targetDate: iso(row.targetDate),
    readinessStatus: computeReadinessStatus(items, row.targetDate),
    items: items.map(serializeItem),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function projectExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  return !!row;
}

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];

router.get("/projects/:id/risks", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectRisksTable)
      .where(eq(projectRisksTable.projectId, id));
    rows.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        b.id - a.id,
    );
    res.json(rows.map(serializeRisk));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/risks", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const parsed = CreateProjectRiskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dueDate, ...rest } = parsed.data;
    const [created] = await db
      .insert(projectRisksTable)
      .values({ ...rest, projectId: id, dueDate: toDate(dueDate) })
      .returning();
    req.log.info({ projectId: id, riskId: created.id }, "risk created");
    res.status(201).json(serializeRisk(created));
  } catch (err) {
    next(err);
  }
});

router.patch("/projects/:id/risks/:riskId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const riskId = parseId(req.params.riskId);
    if (!id || !riskId) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateProjectRiskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dueDate, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (dueDate !== undefined) patch["dueDate"] = toDate(dueDate);
    const [updated] = await db
      .update(projectRisksTable)
      .set(patch)
      .where(
        and(
          eq(projectRisksTable.id, riskId),
          eq(projectRisksTable.projectId, id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Risk not found" });
      return;
    }
    res.json(serializeRisk(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/projects/:id/risks/:riskId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const riskId = parseId(req.params.riskId);
    if (!id || !riskId) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(projectRisksTable)
      .where(
        and(
          eq(projectRisksTable.id, riskId),
          eq(projectRisksTable.projectId, id),
        ),
      )
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Risk not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

const DECIDED_STATUSES = new Set(["Approved", "Rejected", "Cancelled"]);

router.get("/projects/:id/approvals", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectApprovalsTable)
      .where(eq(projectApprovalsTable.projectId, id))
      .orderBy(desc(projectApprovalsTable.id));
    rows.sort(
      (a, b) =>
        Number(b.status === "Pending") - Number(a.status === "Pending") ||
        b.id - a.id,
    );
    res.json(rows.map(serializeApproval));
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/approvals", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const parsed = CreateProjectApprovalBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(projectApprovalsTable)
      .values({ ...parsed.data, projectId: id, status: "Pending" })
      .returning();
    req.log.info(
      { projectId: id, approvalId: created.id },
      "approval requested",
    );
    res.status(201).json(serializeApproval(created));
  } catch (err) {
    next(err);
  }
});

router.patch("/projects/:id/approvals/:approvalId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const approvalId = parseId(req.params.approvalId);
    if (!id || !approvalId) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateProjectApprovalBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [current] = await db
      .select()
      .from(projectApprovalsTable)
      .where(
        and(
          eq(projectApprovalsTable.id, approvalId),
          eq(projectApprovalsTable.projectId, id),
        ),
      );
    if (!current) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    const patch: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    // Server stamps decidedAt only on a real Pending -> decided transition,
    // and clears it only when reverting to Pending. A metadata edit on an
    // already-decided approval never rewrites the recorded decision time.
    if (
      parsed.data.status !== undefined &&
      parsed.data.status !== current.status
    ) {
      if (DECIDED_STATUSES.has(parsed.data.status)) {
        if (!current.decidedAt) patch["decidedAt"] = new Date();
      } else {
        patch["decidedAt"] = null;
      }
    }
    const [updated] = await db
      .update(projectApprovalsTable)
      .set(patch)
      .where(
        and(
          eq(projectApprovalsTable.id, approvalId),
          eq(projectApprovalsTable.projectId, id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    req.log.info(
      { projectId: id, approvalId, status: updated.status },
      "approval updated",
    );
    res.json(serializeApproval(updated));
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/projects/:id/approvals/:approvalId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const approvalId = parseId(req.params.approvalId);
      if (!id || !approvalId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const deleted = await db
        .delete(projectApprovalsTable)
        .where(
          and(
            eq(projectApprovalsTable.id, approvalId),
            eq(projectApprovalsTable.projectId, id),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// Global approval queue: pending first, then most recent.
router.get("/approvals", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        approval: projectApprovalsTable,
        projectName: projectsTable.name,
      })
      .from(projectApprovalsTable)
      .innerJoin(
        projectsTable,
        eq(projectApprovalsTable.projectId, projectsTable.id),
      )
      .orderBy(desc(projectApprovalsTable.id));
    rows.sort(
      (a, b) =>
        Number(b.approval.status === "Pending") -
          Number(a.approval.status === "Pending") ||
        b.approval.id - a.approval.id,
    );
    res.json(
      rows.map((r) => ({
        ...serializeApproval(r.approval),
        projectName: r.projectName,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Go-Live Readiness
// ---------------------------------------------------------------------------

async function loadAssessmentItems(
  assessmentIds: number[],
): Promise<Map<number, ReadinessItem[]>> {
  const map = new Map<number, ReadinessItem[]>();
  if (assessmentIds.length === 0) return map;
  const items = await db
    .select()
    .from(readinessItemsTable)
    .where(inArray(readinessItemsTable.assessmentId, assessmentIds))
    .orderBy(asc(readinessItemsTable.sequence), asc(readinessItemsTable.id));
  for (const item of items) {
    const list = map.get(item.assessmentId) ?? [];
    list.push(item);
    map.set(item.assessmentId, list);
  }
  return map;
}

router.get("/projects/:id/readiness", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const assessments = await db
      .select()
      .from(readinessAssessmentsTable)
      .where(eq(readinessAssessmentsTable.projectId, id))
      .orderBy(desc(readinessAssessmentsTable.id));
    const itemsByAssessment = await loadAssessmentItems(
      assessments.map((a) => a.id),
    );
    res.json(
      assessments.map((a) =>
        serializeAssessment(a, itemsByAssessment.get(a.id) ?? []),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/readiness", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await projectExists(id))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const parsed = CreateReadinessAssessmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { seedStandardItems, targetDate, ...rest } = parsed.data;
    const created = await db.transaction(async (tx) => {
      const [assessment] = await tx
        .insert(readinessAssessmentsTable)
        .values({ ...rest, projectId: id, targetDate: toDate(targetDate) })
        .returning();
      if (seedStandardItems) {
        await tx.insert(readinessItemsTable).values(
          STANDARD_READINESS_CATEGORIES.map((category, index) => ({
            assessmentId: assessment.id,
            category,
            requirement: `${category} readiness confirmed`,
            required: true,
            sequence: index + 1,
          })),
        );
      }
      return assessment;
    });
    const items = await db
      .select()
      .from(readinessItemsTable)
      .where(eq(readinessItemsTable.assessmentId, created.id))
      .orderBy(asc(readinessItemsTable.sequence), asc(readinessItemsTable.id));
    req.log.info(
      { projectId: id, assessmentId: created.id },
      "readiness assessment created",
    );
    res.status(201).json(serializeAssessment(created, items));
  } catch (err) {
    next(err);
  }
});

async function loadAssessment(
  projectId: number,
  assessmentId: number,
): Promise<ReadinessAssessment | null> {
  const [row] = await db
    .select()
    .from(readinessAssessmentsTable)
    .where(
      and(
        eq(readinessAssessmentsTable.id, assessmentId),
        eq(readinessAssessmentsTable.projectId, projectId),
      ),
    );
  return row ?? null;
}

router.patch("/projects/:id/readiness/:assessmentId", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const assessmentId = parseId(req.params.assessmentId);
    if (!id || !assessmentId) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateReadinessAssessmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { targetDate, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (targetDate !== undefined) patch["targetDate"] = toDate(targetDate);
    const [updated] = await db
      .update(readinessAssessmentsTable)
      .set(patch)
      .where(
        and(
          eq(readinessAssessmentsTable.id, assessmentId),
          eq(readinessAssessmentsTable.projectId, id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    const items = await db
      .select()
      .from(readinessItemsTable)
      .where(eq(readinessItemsTable.assessmentId, assessmentId))
      .orderBy(asc(readinessItemsTable.sequence), asc(readinessItemsTable.id));
    res.json(serializeAssessment(updated, items));
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/projects/:id/readiness/:assessmentId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assessmentId = parseId(req.params.assessmentId);
      if (!id || !assessmentId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const deleted = await db
        .delete(readinessAssessmentsTable)
        .where(
          and(
            eq(readinessAssessmentsTable.id, assessmentId),
            eq(readinessAssessmentsTable.projectId, id),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Assessment not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/projects/:id/readiness/:assessmentId/items",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assessmentId = parseId(req.params.assessmentId);
      if (!id || !assessmentId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const assessment = await loadAssessment(id, assessmentId);
      if (!assessment) {
        res.status(404).json({ error: "Assessment not found" });
        return;
      }
      const parsed = CreateReadinessItemBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const [created] = await db
        .insert(readinessItemsTable)
        .values({ ...parsed.data, assessmentId })
        .returning();
      res.status(201).json(serializeItem(created));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/projects/:id/readiness/:assessmentId/items/:itemId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assessmentId = parseId(req.params.assessmentId);
      const itemId = parseId(req.params.itemId);
      if (!id || !assessmentId || !itemId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const assessment = await loadAssessment(id, assessmentId);
      if (!assessment) {
        res.status(404).json({ error: "Assessment not found" });
        return;
      }
      const parsed = UpdateReadinessItemBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const [updated] = await db
        .update(readinessItemsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(readinessItemsTable.id, itemId),
            eq(readinessItemsTable.assessmentId, assessmentId),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      res.json(serializeItem(updated));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/projects/:id/readiness/:assessmentId/items/:itemId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assessmentId = parseId(req.params.assessmentId);
      const itemId = parseId(req.params.itemId);
      if (!id || !assessmentId || !itemId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const deleted = await db
        .delete(readinessItemsTable)
        .where(
          and(
            eq(readinessItemsTable.id, itemId),
            eq(readinessItemsTable.assessmentId, assessmentId),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
