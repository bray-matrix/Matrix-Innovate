import { Router, type IRouter } from "express";
import { db, initiativesTable } from "@workspace/db";
import { desc } from "drizzle-orm";

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

export default router;
