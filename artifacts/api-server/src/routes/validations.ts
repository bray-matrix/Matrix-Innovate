import { Router, type IRouter } from "express";
import {
  db,
  validationRecordsTable,
  validationItemsTable,
  type ValidationRecord,
  type ValidationItem,
} from "@workspace/db";
import { eq, desc, asc, and } from "drizzle-orm";
import {
  CreateValidationBody,
  UpdateValidationBody,
  UpdateValidationItemBody,
} from "@workspace/api-zod";
import { APPLICATION_VERSION } from "./settings";

const router: IRouter = Router();

// Checklist templates seeded into every new validation record. One entry per
// validation step, grouped by feature area. Extend this list as features ship.
interface ChecklistTemplate {
  featureArea: string;
  breadcrumb: string;
  whatToValidate: string;
  expectedResult: string;
}

const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  // Dashboard
  {
    featureArea: "Dashboard",
    breadcrumb: "Sidebar > Dashboard",
    whatToValidate:
      "KPI cards load with real numbers (savings, revenue, hours saved, active initiatives, success rate, average score).",
    expectedResult:
      "All KPI cards display values consistent with the initiative list; no blank or NaN values.",
  },
  {
    featureArea: "Dashboard",
    breadcrumb: "Sidebar > Dashboard > My Attention Required",
    whatToValidate:
      "Attention section lists initiatives awaiting review, prototypes nearing the 14-day deadline, and high-value initiatives without an executive sponsor.",
    expectedResult:
      "Each attention card links to the correct initiative and reflects current data.",
  },
  {
    featureArea: "Dashboard",
    breadcrumb: "Sidebar > Dashboard > Charts",
    whatToValidate: "Pipeline and status charts render without errors.",
    expectedResult:
      "Charts display and match the status counts on the Kanban board.",
  },
  // AI Innovation Interview
  {
    featureArea: "AI Innovation Interview",
    breadcrumb: "Sidebar > AI Innovation Interview",
    whatToValidate:
      "Complete a full interview conversation and submit the resulting initiative.",
    expectedResult:
      "Interview walks through all questions, builds a draft, and creates an initiative that appears in the list.",
  },
  {
    featureArea: "AI Innovation Interview",
    breadcrumb: "Sidebar > AI Innovation Interview",
    whatToValidate: "Abandon an interview midway and restart it.",
    expectedResult:
      "No orphan initiative is created; restarting begins a clean session.",
  },
  // Initiative List
  {
    featureArea: "Initiative List",
    breadcrumb: "Sidebar > Initiatives",
    whatToValidate:
      "Initiative table loads with search, filters, sorting, and export.",
    expectedResult:
      "Rows can be searched, filtered by status/department, sorted by score, and exported; row click opens the detail page.",
  },
  {
    featureArea: "Initiative List",
    breadcrumb: "Sidebar > Submit Initiative",
    whatToValidate:
      "Submit a new initiative through the classic form with all required fields.",
    expectedResult:
      "Initiative is created with a computed score and priority and appears at the top of the list.",
  },
  // Initiative Detail / Workspace
  {
    featureArea: "Initiative Detail / Workspace",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Edit Mode",
    whatToValidate:
      "Toggle Edit Mode, change canvas fields, business value numbers, risks, owner/sponsor, and save.",
    expectedResult:
      "Save creates a new version, values persist after reload, and the sticky save bar disappears.",
  },
  {
    featureArea: "Initiative Detail / Workspace",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Executive Summary",
    whatToValidate:
      "Edit the Executive Summary, save, then clear it and save again.",
    expectedResult:
      "Custom summary overrides the auto-generated one; clearing it falls back to the auto-generated summary.",
  },
  {
    featureArea: "Initiative Detail / Workspace",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Recalculate",
    whatToValidate:
      "Press Recalculate after changing risk or value fields.",
    expectedResult:
      "Score and priority update from stored fields; a version history entry records the score change; no-op recalculation does not bump the version.",
  },
  // Scoring
  {
    featureArea: "Scoring",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Score",
    whatToValidate:
      "Adjust scoring sliders and save the score.",
    expectedResult:
      "Total score matches the 100-point model weights, priority updates accordingly, and the value persists.",
  },
  {
    featureArea: "Scoring",
    breadcrumb: "Sidebar > Admin > Scoring Weights",
    whatToValidate: "Scoring weight configuration matches the scoring page.",
    expectedResult:
      "Weights shown in Admin add up to 100 (plus penalties) and match the scoring form sections.",
  },
  // Kanban
  {
    featureArea: "Kanban",
    breadcrumb: "Sidebar > Kanban",
    whatToValidate:
      "Drag an initiative card between status columns.",
    expectedResult:
      "Card moves, status persists after reload, and the dashboard counts update.",
  },
  // Documents
  {
    featureArea: "Documents",
    breadcrumb: "Sidebar > Documents",
    whatToValidate: "Governance document library loads.",
    expectedResult:
      "All governance documents are listed with title, version, owner, and status.",
  },
  // Admin
  {
    featureArea: "Admin",
    breadcrumb: "Sidebar > Admin",
    whatToValidate:
      "Admin configuration (departments, categories, statuses, scoring weights) displays.",
    expectedResult:
      "Configuration values match those used in the submit form and Kanban columns; app version matches the sidebar.",
  },
  // Intelligence Engine
  {
    featureArea: "Intelligence Engine",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Initiative Intelligence",
    whatToValidate:
      "Intelligence section loads recommendations for an initiative.",
    expectedResult:
      "Similar initiatives, prototype scope, complexity, duration, team roles, risks, expected value, confidence, and next action all render.",
  },
  {
    featureArea: "Intelligence Engine",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Initiative Intelligence",
    whatToValidate:
      "Recommendations refresh after editing an initiative's fields.",
    expectedResult:
      "After a save or recalculate, recommendations reflect the updated fields.",
  },
  // Version History
  {
    featureArea: "Version History",
    breadcrumb: "Sidebar > Initiatives > [initiative] > Version History",
    whatToValidate:
      "Version history table lists every change with version, date, user, and summary.",
    expectedResult:
      "Each save, status change, and recalculation adds a row; versions increase monotonically.",
  },
  {
    featureArea: "Version History",
    breadcrumb:
      "Sidebar > Initiatives > [initiative] > Compare with Previous",
    whatToValidate:
      "Open the version comparison dialog after at least two versions exist.",
    expectedResult:
      "Dialog shows previous vs current side-by-side with changed fields highlighted; button is disabled with fewer than two versions.",
  },
];

type Result = "Pass" | "Fail" | "Not Tested";

function deriveStatus(items: Pick<ValidationItem, "result">[]): {
  status: string;
  counts: { passed: number; failed: number; notTested: number };
} {
  const passed = items.filter((i) => i.result === "Pass").length;
  const failed = items.filter((i) => i.result === "Fail").length;
  const notTested = items.length - passed - failed;

  let status: string;
  if (failed > 0) {
    status = "Failed";
  } else if (notTested === 0 && items.length > 0) {
    status = "Passed";
  } else if (passed > 0) {
    status = "In Progress";
  } else {
    status = "Not Started";
  }
  return { status, counts: { passed, failed, notTested } };
}

function serializeRecord(
  record: ValidationRecord,
  items: Pick<ValidationItem, "result">[],
) {
  const { counts } = deriveStatus(items);
  return {
    id: record.id,
    applicationVersion: record.applicationVersion,
    releaseName: record.releaseName,
    status: record.status,
    validationDate: record.validationDate
      ? record.validationDate.toISOString()
      : null,
    validatorName: record.validatorName,
    summary: record.summary,
    overallNotes: record.overallNotes,
    totalItems: items.length,
    passedItems: counts.passed,
    failedItems: counts.failed,
    notTestedItems: counts.notTested,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeDetail(record: ValidationRecord, items: ValidationItem[]) {
  return {
    ...serializeRecord(record, items),
    items: items.map((item) => ({
      id: item.id,
      recordId: item.recordId,
      featureArea: item.featureArea,
      breadcrumb: item.breadcrumb,
      whatToValidate: item.whatToValidate,
      expectedResult: item.expectedResult,
      result: item.result as Result,
      comments: item.comments,
      sortOrder: item.sortOrder,
    })),
  };
}

async function loadDetail(recordId: number) {
  const [record] = await db
    .select()
    .from(validationRecordsTable)
    .where(eq(validationRecordsTable.id, recordId));
  if (!record) return null;
  const items = await db
    .select()
    .from(validationItemsTable)
    .where(eq(validationItemsTable.recordId, recordId))
    .orderBy(asc(validationItemsTable.sortOrder));
  return { record, items };
}

router.get("/validations", async (_req, res) => {
  const records = await db
    .select()
    .from(validationRecordsTable)
    .orderBy(desc(validationRecordsTable.createdAt));
  const allItems = await db.select().from(validationItemsTable);
  const byRecord = new Map<number, ValidationItem[]>();
  for (const item of allItems) {
    const list = byRecord.get(item.recordId) ?? [];
    list.push(item);
    byRecord.set(item.recordId, list);
  }
  res.json(
    records.map((record) =>
      serializeRecord(record, byRecord.get(record.id) ?? []),
    ),
  );
});

router.post("/validations", async (req, res) => {
  const parsed = CreateValidationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid validation data" });
    return;
  }
  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [record] = await tx
      .insert(validationRecordsTable)
      .values({
        applicationVersion: APPLICATION_VERSION,
        releaseName: data.releaseName?.trim() ?? "",
        validatorName: data.validatorName?.trim() ?? "",
        status: "Not Started",
      })
      .returning();

    const items = await tx
      .insert(validationItemsTable)
      .values(
        CHECKLIST_TEMPLATES.map((template, index) => ({
          recordId: record.id,
          featureArea: template.featureArea,
          breadcrumb: template.breadcrumb,
          whatToValidate: template.whatToValidate,
          expectedResult: template.expectedResult,
          result: "Not Tested",
          comments: "",
          sortOrder: index,
        })),
      )
      .returning();

    return { record, items };
  });

  req.log.info(
    { recordId: result.record.id, version: APPLICATION_VERSION },
    "validation checklist generated",
  );
  res.status(201).json(serializeDetail(result.record, result.items));
});

router.get("/validations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }
  const detail = await loadDetail(id);
  if (!detail) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }
  res.json(serializeDetail(detail.record, detail.items));
});

router.patch("/validations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }
  const parsed = UpdateValidationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid validation data" });
    return;
  }
  const data = parsed.data;

  const existing = await loadDetail(id);
  if (!existing) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }

  const updates: Partial<typeof validationRecordsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.releaseName !== undefined) updates.releaseName = data.releaseName;
  if (data.validatorName !== undefined)
    updates.validatorName = data.validatorName;
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.overallNotes !== undefined)
    updates.overallNotes = data.overallNotes;

  const [updated] = await db
    .update(validationRecordsTable)
    .set(updates)
    .where(eq(validationRecordsTable.id, id))
    .returning();

  res.json(serializeDetail(updated, existing.items));
});

router.delete("/validations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }
  const [deleted] = await db
    .delete(validationRecordsTable)
    .where(eq(validationRecordsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Validation record not found" });
    return;
  }
  res.status(204).end();
});

router.patch("/validations/:id/items/:itemId", async (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(itemId) ||
    itemId <= 0
  ) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  const parsed = UpdateValidationItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid checklist item data" });
    return;
  }
  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Lock the parent record row so concurrent item updates serialize their
    // status/date recomputation instead of racing each other.
    const [record] = await tx
      .select()
      .from(validationRecordsTable)
      .where(eq(validationRecordsTable.id, id))
      .for("update");
    if (!record) return { notFound: "record" as const };

    const [existingItem] = await tx
      .select()
      .from(validationItemsTable)
      .where(
        and(
          eq(validationItemsTable.id, itemId),
          eq(validationItemsTable.recordId, id),
        ),
      );
    if (!existingItem) return { notFound: "item" as const };

    const itemUpdates: Partial<typeof validationItemsTable.$inferInsert> = {};
    if (data.result !== undefined) itemUpdates.result = data.result;
    if (data.comments !== undefined) itemUpdates.comments = data.comments;

    if (Object.keys(itemUpdates).length > 0) {
      await tx
        .update(validationItemsTable)
        .set(itemUpdates)
        .where(eq(validationItemsTable.id, itemId));
    }

    // Re-derive the parent record status from the updated item set.
    const items = await tx
      .select()
      .from(validationItemsTable)
      .where(eq(validationItemsTable.recordId, id))
      .orderBy(asc(validationItemsTable.sortOrder));
    const { status } = deriveStatus(items);

    const recordUpdates: Partial<typeof validationRecordsTable.$inferInsert> =
      {
        updatedAt: new Date(),
      };
    if (status !== record.status) {
      recordUpdates.status = status;
    }
    // Stamp the validation date only when the run transitions into a terminal
    // state (Passed/Failed); clear it only when it transitions back out.
    const wasTerminal =
      record.status === "Passed" || record.status === "Failed";
    const isTerminal = status === "Passed" || status === "Failed";
    if (isTerminal && !wasTerminal) {
      recordUpdates.validationDate = new Date();
    } else if (!isTerminal && wasTerminal) {
      recordUpdates.validationDate = null;
    }

    const [updatedRecord] = await tx
      .update(validationRecordsTable)
      .set(recordUpdates)
      .where(eq(validationRecordsTable.id, id))
      .returning();

    return { updatedRecord, items };
  });

  if ("notFound" in result) {
    res.status(404).json({
      error:
        result.notFound === "record"
          ? "Validation record not found"
          : "Checklist item not found",
    });
    return;
  }

  res.json(serializeDetail(result.updatedRecord, result.items));
});

export default router;
