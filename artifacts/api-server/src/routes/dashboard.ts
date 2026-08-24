import { Router, type IRouter } from "express";
import { db, initiativesTable, projectsTable } from "@workspace/db";
import { desc, isNotNull } from "drizzle-orm";

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

export default router;
