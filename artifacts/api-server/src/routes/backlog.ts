import { Router, type IRouter } from "express";
import {
  db,
  backlogItemsTable,
  parkingLotItemsTable,
  type BacklogItem,
  type ParkingLotItem,
} from "@workspace/db";
import { eq, desc, and, ne, notInArray } from "drizzle-orm";
import {
  CreateBacklogItemBody,
  UpdateBacklogItemBody,
  CreateParkingLotItemBody,
  UpdateParkingLotItemBody,
} from "@workspace/api-zod";
import { APPLICATION_VERSION } from "./settings";

const router: IRouter = Router();

// Display ids are derived from the serial primary key: PB-0001 / PL-0001.
function formatDisplayId(prefix: "PB" | "PL", id: number): string {
  return `${prefix}-${String(id).padStart(4, "0")}`;
}

function serializeBacklogItem(item: BacklogItem) {
  return {
    ...item,
    displayId: formatDisplayId("PB", item.id),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeParkingLotItem(item: ParkingLotItem) {
  return {
    ...item,
    displayId: formatDisplayId("PL", item.id),
    createdAt: item.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Product backlog
// ---------------------------------------------------------------------------

router.get("/backlog", async (_req, res, next) => {
  try {
    const items = await db
      .select()
      .from(backlogItemsTable)
      .orderBy(desc(backlogItemsTable.id));
    res.json(items.map(serializeBacklogItem));
  } catch (err) {
    next(err);
  }
});

router.post("/backlog", async (req, res, next) => {
  try {
    const parsed = CreateBacklogItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(backlogItemsTable)
      .values(parsed.data)
      .returning();
    req.log.info({ backlogItemId: created.id }, "backlog item created");
    res.status(201).json(serializeBacklogItem(created));
  } catch (err) {
    next(err);
  }
});

router.patch("/backlog/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const parsed = UpdateBacklogItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(backlogItemsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(backlogItemsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Backlog item not found" });
      return;
    }
    res.json(serializeBacklogItem(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/backlog/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(backlogItemsTable)
      .where(eq(backlogItemsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ message: "Backlog item not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Parking lot
// ---------------------------------------------------------------------------

router.get("/parking-lot", async (_req, res, next) => {
  try {
    const items = await db
      .select()
      .from(parkingLotItemsTable)
      .orderBy(desc(parkingLotItemsTable.id));
    res.json(items.map(serializeParkingLotItem));
  } catch (err) {
    next(err);
  }
});

router.post("/parking-lot", async (req, res, next) => {
  try {
    const parsed = CreateParkingLotItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(parkingLotItemsTable)
      .values(parsed.data)
      .returning();
    req.log.info({ parkingLotItemId: created.id }, "parking lot item created");
    res.status(201).json(serializeParkingLotItem(created));
  } catch (err) {
    next(err);
  }
});

router.patch("/parking-lot/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const parsed = UpdateParkingLotItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(parkingLotItemsTable)
      .set(parsed.data)
      .where(eq(parkingLotItemsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Parking lot item not found" });
      return;
    }
    res.json(serializeParkingLotItem(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/parking-lot/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(parkingLotItemsTable)
      .where(eq(parkingLotItemsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ message: "Parking lot item not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Product health (dashboard widget)
// ---------------------------------------------------------------------------

router.get("/product-health", async (_req, res, next) => {
  try {
    const [openItems, completedThisRelease, parkingLotItems] =
      await Promise.all([
        db
          .select({ id: backlogItemsTable.id })
          .from(backlogItemsTable)
          .where(
            notInArray(backlogItemsTable.status, ["Complete", "Deferred"]),
          ),
        db
          .select({ id: backlogItemsTable.id })
          .from(backlogItemsTable)
          .where(
            and(
              eq(backlogItemsTable.status, "Complete"),
              eq(backlogItemsTable.targetVersion, APPLICATION_VERSION),
            ),
          ),
        db.select({ id: parkingLotItemsTable.id }).from(parkingLotItemsTable),
      ]);
    res.json({
      openBacklogItems: openItems.length,
      parkingLotItems: parkingLotItems.length,
      completedThisRelease: completedThisRelease.length,
      applicationVersion: APPLICATION_VERSION,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
