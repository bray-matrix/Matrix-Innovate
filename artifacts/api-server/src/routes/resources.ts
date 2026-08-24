import { Router, type IRouter } from "express";
import {
  db,
  projectsTable,
  resourcesTable,
  projectResourceAssignmentsTable,
  type Resource,
  type ProjectResourceAssignment,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  CreateResourceBody,
  UpdateResourceBody,
  CreateProjectResourceAssignmentBody,
  UpdateProjectResourceAssignmentBody,
} from "@workspace/api-zod";
import { computeResourceCapacity } from "../lib/capacity";

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

const serializeResource = (row: Resource) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

function serializeAssignment(
  row: ProjectResourceAssignment,
  names?: { projectName?: string | null; resourceName?: string | null },
) {
  return {
    ...row,
    projectName: names?.projectName ?? null,
    resourceName: names?.resourceName ?? null,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

router.get("/resources", async (_req, res, next) => {
  try {
    const [resources, assignments] = await Promise.all([
      db.select().from(resourcesTable).orderBy(resourcesTable.name),
      db.select().from(projectResourceAssignmentsTable),
    ]);
    const byResource = new Map<number, ProjectResourceAssignment[]>();
    for (const a of assignments) {
      if (a.resourceId === null) continue;
      const list = byResource.get(a.resourceId) ?? [];
      list.push(a);
      byResource.set(a.resourceId, list);
    }
    res.json(
      resources.map((r) => ({
        ...serializeResource(r),
        ...computeResourceCapacity(byResource.get(r.id) ?? []),
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/resources", async (req, res, next) => {
  try {
    const parsed = CreateResourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(resourcesTable)
      .values(parsed.data)
      .returning();
    req.log.info({ resourceId: created.id }, "resource created");
    res.status(201).json(serializeResource(created));
  } catch (err) {
    next(err);
  }
});

router.get("/resources/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [resource] = await db
      .select()
      .from(resourcesTable)
      .where(eq(resourcesTable.id, id));
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    const assignments = await db
      .select({
        assignment: projectResourceAssignmentsTable,
        projectName: projectsTable.name,
      })
      .from(projectResourceAssignmentsTable)
      .innerJoin(
        projectsTable,
        eq(projectResourceAssignmentsTable.projectId, projectsTable.id),
      )
      .where(eq(projectResourceAssignmentsTable.resourceId, id))
      .orderBy(desc(projectResourceAssignmentsTable.id));
    res.json({
      ...serializeResource(resource),
      ...computeResourceCapacity(assignments.map((a) => a.assignment)),
      assignments: assignments.map((a) =>
        serializeAssignment(a.assignment, {
          projectName: a.projectName,
          resourceName: resource.name,
        }),
      ),
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/resources/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateResourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(resourcesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(resourcesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    res.json(serializeResource(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/resources/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Assignments keep their row with resourceId set NULL (FK on delete set
    // null) — they become department-only demand rather than vanishing.
    // Backfill any missing assignment department from the resource inside the
    // same transaction so no row ends up with neither resource nor department.
    const deleted = await db.transaction(async (tx) => {
      const [resource] = await tx
        .select()
        .from(resourcesTable)
        .where(eq(resourcesTable.id, id));
      if (!resource) return [];
      await tx
        .update(projectResourceAssignmentsTable)
        .set({ department: resource.department, updatedAt: new Date() })
        .where(
          and(
            eq(projectResourceAssignmentsTable.resourceId, id),
            isNull(projectResourceAssignmentsTable.department),
          ),
        );
      return tx
        .delete(resourcesTable)
        .where(eq(resourcesTable.id, id))
        .returning();
    });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    req.log.info({ resourceId: id }, "resource deleted");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Project resource assignments (named or department-only demand)
// ---------------------------------------------------------------------------

async function projectExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  return !!row;
}

async function assignmentWithNames(row: ProjectResourceAssignment) {
  let resourceName: string | null = null;
  if (row.resourceId !== null) {
    const [r] = await db
      .select({ name: resourcesTable.name })
      .from(resourcesTable)
      .where(eq(resourcesTable.id, row.resourceId));
    resourceName = r?.name ?? null;
  }
  return serializeAssignment(row, { resourceName });
}

router.get("/projects/:id/resources", async (req, res, next) => {
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
      .select({
        assignment: projectResourceAssignmentsTable,
        resourceName: resourcesTable.name,
      })
      .from(projectResourceAssignmentsTable)
      .leftJoin(
        resourcesTable,
        eq(projectResourceAssignmentsTable.resourceId, resourcesTable.id),
      )
      .where(eq(projectResourceAssignmentsTable.projectId, id))
      .orderBy(desc(projectResourceAssignmentsTable.id));
    res.json(
      rows.map((r) =>
        serializeAssignment(r.assignment, { resourceName: r.resourceName }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/projects/:id/resources", async (req, res, next) => {
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
    const parsed = CreateProjectResourceAssignmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { resourceId, department, startDate, endDate, ...rest } =
      parsed.data;
    // Must be a named-resource assignment or department-only demand.
    if (!resourceId && !department) {
      res
        .status(400)
        .json({ error: "Provide a resourceId or a department (or both)" });
      return;
    }
    // For named assignments, default the department to the resource's own
    // department so that if the resource is later deleted (FK sets resourceId
    // NULL) the row remains meaningful department demand.
    let effectiveDepartment = department ?? null;
    if (resourceId) {
      const [r] = await db
        .select({
          id: resourcesTable.id,
          department: resourcesTable.department,
        })
        .from(resourcesTable)
        .where(eq(resourcesTable.id, resourceId));
      if (!r) {
        res.status(400).json({ error: "Unknown resourceId" });
        return;
      }
      if (!effectiveDepartment) effectiveDepartment = r.department;
    }
    const [created] = await db
      .insert(projectResourceAssignmentsTable)
      .values({
        ...rest,
        projectId: id,
        resourceId: resourceId ?? null,
        department: effectiveDepartment,
        startDate: toDate(startDate),
        endDate: toDate(endDate),
      })
      .returning();
    req.log.info(
      { projectId: id, assignmentId: created.id },
      "resource assignment created",
    );
    res.status(201).json(await assignmentWithNames(created));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/projects/:id/resources/:assignmentId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assignmentId = parseId(req.params.assignmentId);
      if (!id || !assignmentId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const parsed = UpdateProjectResourceAssignmentBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const { startDate, endDate, ...rest } = parsed.data;
      const [existing] = await db
        .select()
        .from(projectResourceAssignmentsTable)
        .where(
          and(
            eq(projectResourceAssignmentsTable.id, assignmentId),
            eq(projectResourceAssignmentsTable.projectId, id),
          ),
        );
      if (!existing) {
        res.status(404).json({ error: "Assignment not found" });
        return;
      }
      // Enforce the same invariant as create: the result must be a named
      // resource assignment or department-only demand, never neither.
      const nextResourceId =
        rest.resourceId !== undefined ? rest.resourceId : existing.resourceId;
      const nextDepartment =
        rest.department !== undefined ? rest.department : existing.department;
      if (!nextResourceId && !nextDepartment) {
        res.status(400).json({
          error: "Assignment must keep a resourceId or a department",
        });
        return;
      }
      if (
        rest.resourceId !== undefined &&
        rest.resourceId !== null &&
        rest.resourceId !== existing.resourceId
      ) {
        const [r] = await db
          .select({ id: resourcesTable.id })
          .from(resourcesTable)
          .where(eq(resourcesTable.id, rest.resourceId));
        if (!r) {
          res.status(400).json({ error: "Unknown resourceId" });
          return;
        }
      }
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (startDate !== undefined) patch["startDate"] = toDate(startDate);
      if (endDate !== undefined) patch["endDate"] = toDate(endDate);
      const [updated] = await db
        .update(projectResourceAssignmentsTable)
        .set(patch)
        .where(
          and(
            eq(projectResourceAssignmentsTable.id, assignmentId),
            eq(projectResourceAssignmentsTable.projectId, id),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Assignment not found" });
        return;
      }
      res.json(await assignmentWithNames(updated));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/projects/:id/resources/:assignmentId",
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const assignmentId = parseId(req.params.assignmentId);
      if (!id || !assignmentId) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const deleted = await db
        .delete(projectResourceAssignmentsTable)
        .where(
          and(
            eq(projectResourceAssignmentsTable.id, assignmentId),
            eq(projectResourceAssignmentsTable.projectId, id),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Assignment not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
