import { Router, type IRouter, type Request, type Response } from "express";
import { db, interviewDraftsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../matrix/auth";
import { assertSafeContent } from "../lib/content-safety";

const router: IRouter = Router();
const draft = interviewDraftsTable;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function owner(req: Request, res: Response): string | null {
  const sub = (req as AuthenticatedRequest).matrixIdentity?.sub;
  if (typeof sub !== "string" || !sub.trim()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return sub;
}

function validState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let nodes = 0;
  function visit(v: unknown, depth: number): boolean {
    if (++nodes > 3000 || depth > 12) return false;
    if (v === null || typeof v === "boolean") return true;
    if (typeof v === "string") return v.length <= 20000;
    if (typeof v === "number") return Number.isFinite(v);
    if (Array.isArray(v)) return v.length <= 300 && v.every(item => visit(item, depth + 1));
    if (typeof v === "object" && v !== null) {
      const entries = Object.entries(v);
      return entries.length <= 300 && entries.every(([key, item]) =>
        key.length <= 120 && key !== "__proto__" && key !== "constructor" && key !== "prototype" && visit(item, depth + 1));
    }
    return false;
  }
  try {
    return visit(value, 0) && Buffer.byteLength(JSON.stringify(value), "utf8") <= 128 * 1024;
  } catch {
    return false;
  }
}

function response(row: typeof draft.$inferSelect) {
  return { id: row.id, state: row.state, revision: row.revision };
}

function idFor(req: Request, res: Response): string | null {
  const id = req.params.id;
  if (typeof id !== "string" || !uuid.test(id)) {
    res.status(400).json({ error: "Invalid draft id" });
    return null;
  }
  return id;
}

router.get("/interview/drafts/active", async (req, res) => {
  const sub = owner(req, res);
  if (!sub) return;
  const [row] = await db.select().from(draft)
    .where(and(eq(draft.ownerSub, sub), eq(draft.status, "active"))).limit(1);
  assertSafeContent(row?.state, "draft_resume");
  res.json({ draft: row ? response(row) : null });
});

router.post("/interview/drafts", async (req, res, next) => {
  const sub = owner(req, res);
  if (!sub) return;
  assertSafeContent(req.body, "draft_create");
  if (!validState(req.body?.state)) {
    res.status(400).json({ error: "Invalid interview state" });
    return;
  }
  try {
    const [row] = await db.insert(draft).values({ ownerSub: sub, state: req.body.state }).returning();
    res.status(201).json(response(row));
  } catch (error) {
    if (((error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === "23505") {
      res.status(409).json({ error: "An active interview already exists" });
      return;
    }
    next(error);
  }
});

router.put("/interview/drafts/:id", async (req, res) => {
  const sub = owner(req, res);
  if (!sub) return;
  assertSafeContent(req.body, "draft_autosave");
  const id = idFor(req, res);
  if (!id) return;
  if (!validState(req.body?.state) || !Number.isSafeInteger(req.body?.revision) || req.body.revision < 1) {
    res.status(400).json({ error: "Invalid interview state or revision" });
    return;
  }
  const [row] = await db.update(draft)
    .set({ state: req.body.state, revision: req.body.revision + 1, updatedAt: new Date(), savedInitiativeId: null })
    .where(and(eq(draft.id, id), eq(draft.ownerSub, sub), eq(draft.status, "active"), eq(draft.revision, req.body.revision)))
    .returning();
  if (row) {
    res.json(response(row));
    return;
  }
  const [existing] = await db.select({ id: draft.id }).from(draft)
    .where(and(eq(draft.id, id), eq(draft.ownerSub, sub), eq(draft.status, "active"))).limit(1);
  res.status(existing ? 409 : 404).json({ error: existing ? "Interview revision conflict" : "Draft not found" });
});

// Recovery does not read/return unsafe state and cannot address another owner.
// Register before /:id so "active" is not treated as an invalid UUID.
router.delete("/interview/drafts/active", async (req, res) => {
  const sub = owner(req, res);
  if (!sub) return;
  await db.delete(draft).where(and(eq(draft.ownerSub, sub), eq(draft.status, "active")));
  res.status(204).end();
});

router.delete("/interview/drafts/:id", async (req, res) => {
  const sub = owner(req, res);
  if (!sub) return;
  const id = idFor(req, res);
  if (!id) return;
  const [row] = await db.delete(draft)
    .where(and(eq(draft.id, id), eq(draft.ownerSub, sub), eq(draft.status, "active"))).returning({ id: draft.id });
  if (!row) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  res.status(204).end();
});

router.post("/interview/drafts/:id/complete", async (req, res) => {
  const sub = owner(req, res);
  if (!sub) return;
  const id = idFor(req, res);
  if (!id) return;
  const initiativeId = req.body?.initiativeId;
  if (!Number.isSafeInteger(initiativeId) || initiativeId < 1) {
    res.status(400).json({ error: "Invalid initiative id" });
    return;
  }
  const [row] = await db.update(draft)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(draft.id, id), eq(draft.ownerSub, sub), eq(draft.status, "active"), eq(draft.savedInitiativeId, initiativeId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Draft or matching saved initiative not found" });
    return;
  }
  res.json({ id: row.id, initiativeId: row.savedInitiativeId, status: "completed" });
});

export default router;