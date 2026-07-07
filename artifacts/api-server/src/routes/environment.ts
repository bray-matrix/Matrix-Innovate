import { Router, type IRouter } from "express";
import {
  db,
  initiativesTable,
  initiativeVersionsTable,
  calculationEventsTable,
  validationRecordsTable,
  archivedInitiativesTable,
  environmentEventsTable,
  systemFlagsTable,
  type EnvironmentEvent,
  type EnvironmentActionResult,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { InitializeEnvironmentBody } from "@workspace/api-zod";

const router: IRouter = Router();

const FIRST_TIME_SETUP_FLAG = "firstTimeSetupComplete";

function currentEnvironment(): string {
  return process.env.NODE_ENV === "production" ? "Production" : "Development";
}

function serializeEvent(event: EnvironmentEvent) {
  return { ...event, createdAt: event.createdAt.toISOString() };
}

async function isFirstTimeSetupComplete(): Promise<boolean> {
  const [flag] = await db
    .select()
    .from(systemFlagsTable)
    .where(eq(systemFlagsTable.key, FIRST_TIME_SETUP_FLAG));
  return flag?.value ?? false;
}

router.get("/environment", async (_req, res, next) => {
  try {
    const [initiatives, validationRecords, calculationEvents, archived, setupComplete] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(initiativesTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(validationRecordsTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(calculationEventsTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(archivedInitiativesTable),
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
  } catch (err) {
    next(err);
  }
});

router.get("/environment/history", async (_req, res, next) => {
  try {
    const events = await db
      .select()
      .from(environmentEventsTable)
      .orderBy(desc(environmentEventsTable.id));
    res.json(events.map(serializeEvent));
  } catch (err) {
    next(err);
  }
});

router.post("/environment/initialize", async (req, res, next) => {
  try {
    const parsed = InitializeEnvironmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const body = parsed.data;
    const performedBy = body.performedBy.trim();
    if (!performedBy) {
      res.status(400).json({ message: "performedBy is required" });
      return;
    }

    // All writes run in a single transaction so a partial failure leaves the
    // environment untouched (all-or-nothing).
    const { event, actions } = await db.transaction(async (tx) => {
      const actions: EnvironmentActionResult[] = [];

      if (body.archiveSampleInitiatives) {
        const initiatives = await tx.select().from(initiativesTable);
        for (const initiative of initiatives) {
          const versions = await tx
            .select()
            .from(initiativeVersionsTable)
            .where(eq(initiativeVersionsTable.initiativeId, initiative.id));
          const calculations = await tx
            .select()
            .from(calculationEventsTable)
            .where(eq(calculationEventsTable.initiativeId, initiative.id));
          await tx.insert(archivedInitiativesTable).values({
            originalId: initiative.id,
            title: initiative.title,
            snapshot: { initiative, versions, calculations },
            archivedBy: performedBy,
          });
        }
        const deleted = await tx.delete(initiativesTable).returning({
          id: initiativesTable.id,
        });
        actions.push({
          action: "archiveSampleInitiatives",
          label: "Archive sample initiatives",
          records: deleted.length,
          detail:
            deleted.length > 0
              ? `${deleted.length} initiative(s) snapshotted to the archive and removed from the active pipeline.`
              : "No initiatives to archive.",
        });
      }

      if (body.removeSampleInitiatives) {
        const deleted = await tx.delete(initiativesTable).returning({
          id: initiativesTable.id,
        });
        actions.push({
          action: "removeSampleInitiatives",
          label: "Remove sample initiatives",
          records: deleted.length,
          detail:
            deleted.length > 0
              ? `${deleted.length} initiative(s) permanently removed.`
              : body.archiveSampleInitiatives
                ? "Nothing left to remove — initiatives were already archived."
                : "No initiatives to remove.",
        });
      }

      if (body.clearValidationRecords) {
        const deleted = await tx.delete(validationRecordsTable).returning({
          id: validationRecordsTable.id,
        });
        actions.push({
          action: "clearValidationRecords",
          label: "Clear validation records",
          records: deleted.length,
          detail: `${deleted.length} validation record(s) and their checklist items removed. Validation templates are code-defined and preserved.`,
        });
      }

      if (body.clearCalculationHistory) {
        const deleted = await tx.delete(calculationEventsTable).returning({
          id: calculationEventsTable.id,
        });
        actions.push({
          action: "clearCalculationHistory",
          label: "Clear calculation history",
          records: deleted.length,
          detail: `${deleted.length} calculation event(s) removed.`,
        });
      }

      if (body.clearRecommendationHistory) {
        actions.push({
          action: "clearRecommendationHistory",
          label: "Clear recommendation history",
          records: 0,
          detail:
            "Recommendations are computed on demand by the Intelligence Engine; no stored history exists to clear.",
        });
      }

      if (actions.length === 0) {
        actions.push({
          action: "none",
          label: "No cleanup actions selected",
          records: 0,
          detail:
            "Environment marked as initialized without any data changes.",
        });
      }

      await tx
        .insert(systemFlagsTable)
        .values({
          key: FIRST_TIME_SETUP_FLAG,
          value: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemFlagsTable.key,
          set: { value: true, updatedAt: new Date() },
        });

      const [event] = await tx
        .insert(environmentEventsTable)
        .values({
          performedBy,
          environment: currentEnvironment(),
          actions,
        })
        .returning();

      return { event, actions };
    });

    req.log.info(
      { environmentEventId: event.id, actions: actions.map((a) => a.action) },
      "environment initialized",
    );
    res.status(201).json(serializeEvent(event));
  } catch (err) {
    next(err);
  }
});

export default router;
