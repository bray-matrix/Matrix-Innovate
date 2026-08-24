import { Router, type IRouter } from "express";
import {
  db,
  initiativesTable,
  projectsTable,
  projectMilestonesTable,
  projectRisksTable,
  projectApprovalsTable,
  readinessAssessmentsTable,
  readinessItemsTable,
} from "@workspace/db";
import { desc, isNotNull, eq, ne, and, lt, inArray } from "drizzle-orm";
import { computeReadinessStatus } from "../lib/project-health";

const router: IRouter = Router();

const ALL_STATUSES = [
  "Idea",
  "Review",
  "Approved",
  "Prototype",
  "Pilot",
  "Production",
  "Closed",
  "Declined",
];

function serialize(row: typeof initiativesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/dashboard/summary", async (_req, res) => {
  const rows = await db
    .select()
    .from(initiativesTable)
    .orderBy(desc(initiativesTable.createdAt));

  const totalInitiatives = rows.length;
  const awaitingReview = rows.filter((r) => r.status === "Review").length;
  const activePrototypes = rows.filter((r) => r.status === "Prototype").length;
  const inPilot = rows.filter((r) => r.status === "Pilot").length;
  const inProduction = rows.filter((r) => r.status === "Production").length;
  const averageScore =
    totalInitiatives === 0
      ? 0
      : Math.round(
          (rows.reduce((sum, r) => sum + r.score, 0) / totalInitiatives) * 10,
        ) / 10;

  const statusCounts = ALL_STATUSES.map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }));

  const recentInitiatives = rows.slice(0, 5).map(serialize);

  res.json({
    totalInitiatives,
    awaitingReview,
    activePrototypes,
    inPilot,
    inProduction,
    averageScore,
    statusCounts,
    recentInitiatives,
  });
});

// Execution summary for the Compass dashboard strip: project counts plus
// approved-or-beyond initiatives that have not been promoted to a project.
const APPROVED_OR_BEYOND = ["Approved", "Prototype", "Pilot", "Production"];
const DUE_SOON_DAYS = 30;

router.get("/dashboard/execution-summary", async (_req, res, next) => {
  try {
    const [projects, promotedRows, initiatives] = await Promise.all([
      db.select().from(projectsTable),
      db
        .select({ initiativeId: projectsTable.initiativeId })
        .from(projectsTable)
        .where(isNotNull(projectsTable.initiativeId)),
      db
        .select({ id: initiativesTable.id, status: initiativesTable.status })
        .from(initiativesTable),
    ]);

    const closedStages = new Set(["Completed", "Cancelled"]);
    const activeProjects = projects.filter(
      (p) => !closedStages.has(p.lifecycleStage) && p.state !== "Closed",
    ).length;
    const atRiskProjects = projects.filter(
      (p) =>
        (p.health === "At Risk" || p.health === "Off Track") &&
        !closedStages.has(p.lifecycleStage),
    ).length;
    const dueSoonCutoff = new Date(
      Date.now() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000,
    );
    const dueSoonProjects = projects.filter(
      (p) =>
        p.targetDate !== null &&
        p.targetDate <= dueSoonCutoff &&
        !closedStages.has(p.lifecycleStage),
    ).length;

    const promotedIds = new Set(
      promotedRows.map((r) => r.initiativeId).filter((id) => id !== null),
    );
    const approvedUnpromotedInitiatives = initiatives.filter(
      (i) => APPROVED_OR_BEYOND.includes(i.status) && !promotedIds.has(i.id),
    ).length;

    res.json({
      totalProjects: projects.length,
      activeProjects,
      atRiskProjects,
      dueSoonProjects,
      approvedUnpromotedInitiatives,
    });
  } catch (err) {
    next(err);
  }
});

// Execution attention indicators (Phase 2): items needing action now.
router.get("/dashboard/attention", async (_req, res, next) => {
  try {
    const now = new Date();
    const [risks, pendingApprovals, overdue, assessments, activeProjects] =
      await Promise.all([
        db
          .select({ id: projectRisksTable.id })
          .from(projectRisksTable)
          .where(
            and(
              inArray(projectRisksTable.status, ["Open", "Mitigating"]),
              inArray(projectRisksTable.severity, ["Critical", "High"]),
            ),
          ),
        db
          .select({ id: projectApprovalsTable.id })
          .from(projectApprovalsTable)
          .where(eq(projectApprovalsTable.status, "Pending")),
        db
          .select({ id: projectMilestonesTable.id })
          .from(projectMilestonesTable)
          .where(
            and(
              ne(projectMilestonesTable.status, "Completed"),
              lt(projectMilestonesTable.dueDate, now),
            ),
          ),
        db.select().from(readinessAssessmentsTable),
        db
          .select({
            id: projectsTable.id,
            lifecycleStage: projectsTable.lifecycleStage,
            state: projectsTable.state,
          })
          .from(projectsTable),
      ]);
    const items =
      assessments.length > 0
        ? await db
            .select()
            .from(readinessItemsTable)
            .where(
              inArray(
                readinessItemsTable.assessmentId,
                assessments.map((a) => a.id),
              ),
            )
        : [];
    const closed = new Set(["Completed", "Cancelled"]);
    const activeIds = new Set(
      activeProjects
        .filter((p) => !closed.has(p.lifecycleStage) && p.state !== "Closed")
        .map((p) => p.id),
    );
    const notReadyProjects = new Set(
      assessments
        .filter(
          (a) =>
            activeIds.has(a.projectId) &&
            computeReadinessStatus(
              items.filter((i) => i.assessmentId === a.id),
              a.targetDate,
              now,
            ) === "Not Ready",
        )
        .map((a) => a.projectId),
    ).size;
    res.json({
      openCriticalHighRisks: risks.length,
      pendingApprovals: pendingApprovals.length,
      notReadyProjects,
      overdueMilestones: overdue.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
