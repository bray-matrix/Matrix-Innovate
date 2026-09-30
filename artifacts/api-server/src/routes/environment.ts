import { Router, type IRouter } from "express";
import {
  db, initiativesTable, calculationEventsTable, validationRecordsTable,
  archivedInitiativesTable, environmentEventsTable, systemFlagsTable,
  type EnvironmentEvent,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { requirePlatformAdministrator } from "../lib/admin-authorization";

const router: IRouter = Router();
const FIRST_TIME_SETUP_FLAG = "firstTimeSetupComplete";

function currentEnvironment(): string {
  return process.env.NODE_ENV === "production" ? "Production" : "Development";
}

function serializeEvent(event: EnvironmentEvent) {
  return { ...event, createdAt: event.createdAt.toISOString() };
}

async function isFirstTimeSetupComplete(): Promise<boolean> {
  const [flag] = await db.select().from(systemFlagsTable)
    .where(eq(systemFlagsTable.key, FIRST_TIME_SETUP_FLAG));
  return flag?.value ?? false;
}

router.get("/environment", async (_req, res, next) => {
  try {
    const [initiatives, validationRecords, calculationEvents, archived, setupComplete] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(initiativesTable),
        db.select({ count: sql<number>`count(*)::int` }).from(validationRecordsTable),
        db.select({ count: sql<number>`count(*)::int` }).from(calculationEventsTable),
        db.select({ count: sql<number>`count(*)::int` }).from(archivedInitiativesTable),
        isFirstTimeSetupComplete(),
      ]);
    res.json({
      environment: currentEnvironment(),
      firstTimeSetupComplete: setupComplete,
      counts: {
        initiatives: initiatives[0]?.count ?? 0,
        validationRecords: validationRecords[0]?.count ?? 0,
        calculationEvents: calculationEvents[0]?.count ?? 0,
        archivedInitiatives: archived[0]?.count ?? 0,
      },
    });
  } catch (err) { next(err); }
});

router.get("/environment/history", async (_req, res, next) => {
  try {
    const events = await db.select().from(environmentEventsTable).orderBy(desc(environmentEventsTable.id));
    res.json(events.map(serializeEvent));
  } catch (err) { next(err); }
});

// Setup/reset execution has been removed in every environment. Historical reads remain.
router.post("/environment/initialize", requirePlatformAdministrator, (_req, res) => {
  res.status(410).json({ error: "Environment initialization has been retired. Status and history remain read-only." });
});

export default router;