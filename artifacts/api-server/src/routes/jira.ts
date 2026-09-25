import { Router, type IRouter, type Request, type Response } from "express";
import { db, jiraConnectionStateTable as connection, jiraProjectsTable as projects, jiraFieldMappingsTable as fields, jiraStatusMappingsTable as statuses } from "@workspace/db";
import { eq, asc, and, isNull } from "drizzle-orm";
import { UpdateJiraProjectBody, SaveJiraFieldMappingBody, SaveJiraStatusMappingBody } from "@workspace/api-zod";
import { JiraClient, JiraError } from "../lib/jira-client";

const router: IRouter = Router();
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); }
  catch (error) {
    // Never log upstream error objects, request payloads, headers, or DB values.
    res.status(error instanceof JiraError ? error.status : 503).json({ error: error instanceof JiraError ? error.message : "Jira operation could not be completed. Check configuration and mapping references." });
  }
};
const id = (req: Request) => {
  const value = Number(req.params.id);
  if (!Number.isSafeInteger(value) || value < 1) throw new JiraError("Invalid Jira project ID.", 400);
  return value;
};
async function projectExists(projectId: number) {
  if (!(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)))[0]) throw new JiraError("Jira project not found.", 404);
}
function projectDto(p: typeof projects.$inferSelect) {
  return { id: p.id, jiraProjectId: p.jiraProjectId, key: p.key, name: p.name, projectType: p.projectType, projectId: p.projectId, syncEnabled: p.syncEnabled, lastDiscoveredAt: p.lastDiscoveredAt.toISOString() };
}
function statusDto(s: typeof statuses.$inferSelect) {
  return { id: s.id, jiraProjectId: s.jiraProjectId, jiraStatusId: s.jiraStatusId, jiraStatusName: s.jiraStatusName, canonicalCategory: s.canonicalCategory };
}
async function connectionState() {
  let state;
  try { state = new JiraClient().state(); }
  catch { state = { configured: false, baseUrl: null, accountEmailMasked: null }; }
  const row = (await db.select().from(connection).where(eq(connection.id, "default")))[0];
  return { ...state, lastTestAt: row?.lastTestAt?.toISOString() ?? null, lastTestStatus: row?.lastTestStatus ?? null, lastTestMessage: row?.lastTestMessage ?? null };
}
router.get("/jira/connection", handle(async (_req, res) => res.json(await connectionState())));
router.post("/jira/connection/test", handle(async (_req, res) => {
  let state = { configured: false, baseUrl: null as string | null, accountEmailMasked: null as string | null };
  let lastTestStatus = "failed";
  let lastTestMessage = "Jira request failed.";
  try {
    const client = new JiraClient();
    state = client.state();
    await client.test();
    lastTestStatus = "connected";
    lastTestMessage = "Connected to Jira.";
  } catch (error) { if (error instanceof JiraError) lastTestMessage = error.message; }
  const values = { ...state, lastTestAt: new Date(), lastTestStatus, lastTestMessage };
  await db.insert(connection).values({ id: "default", ...values }).onConflictDoUpdate({ target: connection.id, set: { ...values, updatedAt: new Date() } });
  res.json(await connectionState());
}));
router.get("/jira/projects", handle(async (_req, res) => res.json((await db.select().from(projects).orderBy(asc(projects.key))).map(projectDto))));
router.post("/jira/projects/discover", handle(async (_req, res) => {
  const discovered = await new JiraClient().projects();
  await db.transaction(async tx => {
    for (const p of discovered) {
      const values = { ...p, lastDiscoveredAt: new Date() };
      await tx.insert(projects).values(values).onConflictDoUpdate({ target: projects.jiraProjectId, set: { ...values, updatedAt: new Date() } });
    }
  });
  res.json((await db.select().from(projects).orderBy(asc(projects.key))).map(projectDto));
}));
router.patch("/jira/projects/:id", handle(async (req, res) => {
  const parsed = UpdateJiraProjectBody.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) throw new JiraError("Invalid project mapping.", 400);
  const row = (await db.update(projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projects.id, id(req))).returning())[0];
  if (!row) throw new JiraError("Jira project not found.", 404);
  res.json(projectDto(row));
}));
router.get("/jira/fields", handle(async (_req, res) => res.json(await new JiraClient().fields())));
router.get("/jira/projects/:id/field-mapping", handle(async (req, res) => {
  const projectId = id(req);
  await projectExists(projectId);
  const row = (await db.select().from(fields).where(eq(fields.jiraProjectId, projectId)))[0];
  res.json(row ? { dueDateField: row.dueDateField, blockedField: row.blockedField, storyPointsField: row.storyPointsField, additionalMappings: row.additionalMappings } : { dueDateField: "duedate", blockedField: null, storyPointsField: null, additionalMappings: null });
}));
router.put("/jira/projects/:id/field-mapping", handle(async (req, res) => {
  const parsed = SaveJiraFieldMappingBody.safeParse(req.body);
  if (!parsed.success) throw new JiraError("Invalid field mapping.", 400);
  const projectId = id(req);
  await projectExists(projectId);
  const client = new JiraClient();
  const safeField = (s: string | null) => s === null ? null : client.safe(s);
  const input = { dueDateField: safeField(parsed.data.dueDateField), blockedField: safeField(parsed.data.blockedField), storyPointsField: safeField(parsed.data.storyPointsField), additionalMappings: parsed.data.additionalMappings ? Object.fromEntries(Object.entries(parsed.data.additionalMappings).map(([k, v]) => [client.safe(k), client.safe(v)])) : null };
  await db.insert(fields).values({ jiraProjectId: projectId, ...input }).onConflictDoUpdate({ target: fields.jiraProjectId, set: { ...input, updatedAt: new Date() } });
  res.json(input);
}));
router.get("/jira/status-mappings", handle(async (_req, res) => res.json((await db.select().from(statuses).orderBy(asc(statuses.jiraStatusName))).map(statusDto))));
router.post("/jira/statuses", handle(async (_req, res) => {
  const discovered = await new JiraClient().statuses();
  await db.transaction(async tx => {
    for (const s of discovered) await tx.insert(statuses).values(s).onConflictDoNothing();
  });
  res.json((await db.select().from(statuses).orderBy(asc(statuses.jiraStatusName))).map(statusDto));
}));
router.put("/jira/status-mappings", handle(async (req, res) => {
  const parsed = SaveJiraStatusMappingBody.safeParse(req.body);
  if (!parsed.success) throw new JiraError("Invalid status mapping.", 400);
  const client = new JiraClient();
  const input = { ...parsed.data, jiraStatusId: client.safe(parsed.data.jiraStatusId), jiraStatusName: client.safe(parsed.data.jiraStatusName) };
  if (input.jiraProjectId !== null) await projectExists(input.jiraProjectId);
  const row = await db.transaction(async tx => {
    // Insert-if-absent then update uses unique indexes to serialize concurrent writers,
    // including NULL/global scope (ordinary composite UNIQUE is insufficient).
    await tx.insert(statuses).values(input).onConflictDoNothing();
    return (await tx.update(statuses).set({ ...input, updatedAt: new Date() }).where(and(eq(statuses.jiraStatusId, input.jiraStatusId), input.jiraProjectId === null ? isNull(statuses.jiraProjectId) : eq(statuses.jiraProjectId, input.jiraProjectId))).returning())[0];
  });
  res.json(statusDto(row));
}));
export default router;