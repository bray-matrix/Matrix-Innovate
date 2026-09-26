import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable, jiraProjectsTable, projectJiraLinksTable as links } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { CreateProjectJiraLinkBody, SearchJiraIssuesQueryParams } from "@workspace/api-zod";
import { JiraClient, JiraError, type JiraWorkItem } from "../lib/jira-client";
import type { AuthenticatedRequest } from "../matrix/auth";

// All routes are mounted behind the existing /api requireMatrixSession guard.
// This relationship API has no Jira write capability.
const router: IRouter = Router();
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); }
  catch (error) {
    // Never log provider errors, credentials, or database values.
    res.status(error instanceof JiraError ? error.status : 503).json({
      error: error instanceof JiraError ? error.message : "Linked work could not be loaded or changed. Please try again.",
    });
  }
};
function positiveId(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new JiraError("Invalid project or link ID.", 400);
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new JiraError("Invalid project or link ID.", 400);
  return id;
}
async function requireProject(req: Request): Promise<number> {
  const projectId = positiveId(req.params.projectId);
  if (!(await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1))[0]) throw new JiraError("Project not found.", 404);
  return projectId;
}
type Link = typeof links.$inferSelect;
function dto(link: Link, details: JiraWorkItem | null) {
  return {
    id: link.id, projectId: link.projectId, jiraProjectId: link.jiraProjectId,
    jiraIssueId: link.jiraIssueId, jiraIssueKey: link.jiraIssueKey, jiraIssueType: link.jiraIssueType,
    relationshipType: link.relationshipType, displayOrder: link.displayOrder, notes: link.notes,
    createdBy: link.createdBy, createdAt: link.createdAt.toISOString(), updatedAt: link.updatedAt.toISOString(),
    details, unavailable: details === null,
  };
}

router.get("/jira/issues/search", handle(async (req, res) => {
  const parsed = SearchJiraIssuesQueryParams.safeParse(req.query);
  if (!parsed.success) throw new JiraError("Invalid Jira search. Use at most 200 characters and a limit from 1 to 25.", 400);
  res.json(await new JiraClient().searchIssues(parsed.data.q, parsed.data.projectKey, parsed.data.limit));
}));

router.get("/jira/issues/:issueId/intake-context", handle(async (req, res) => {
  if (typeof req.params.issueId !== "string") throw new JiraError("Invalid Jira issue ID.", 400);
  res.json(await new JiraClient().intakeContext(req.params.issueId));
}));

router.get("/projects/:projectId/jira-links", handle(async (req, res) => {
  const projectId = await requireProject(req);
  const saved = await db.select().from(links).where(eq(links.projectId, projectId)).orderBy(asc(links.displayOrder), asc(links.id));
  const result = saved.map(link => dto(link, null));
  if (!saved.length) { res.json(result); return; }
  // A whole resolution has an 8-second budget, not N sequential timeouts.
  // Four workers maximum; unattempted/unavailable records retain their identities.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const disconnected = () => controller.abort();
  res.on("close", disconnected);
  try {
    const client = new JiraClient();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, saved.length) }, async () => {
      while (!controller.signal.aborted) {
        const index = next++;
        if (index >= saved.length) return;
        try { result[index] = dto(saved[index], await client.issue(saved[index].jiraIssueId, controller.signal)); }
        catch { /* saved identity remains available; Jira failures never fail Project Detail */ }
      }
    }));
  } catch { /* invalid/missing Jira configuration also degrades to saved references */ }
  finally { clearTimeout(timer); res.off("close", disconnected); }
  res.json(result);
}));

router.post("/projects/:projectId/jira-links", handle(async (req, res) => {
  const parsed = CreateProjectJiraLinkBody.safeParse(req.body);
  if (!parsed.success) throw new JiraError("Select a valid Jira issue to link.", 400);
  const projectId = await requireProject(req);
  // Never trust browser-supplied key/type/project; verify the identity live first.
  const client = new JiraClient();
  const issue = await client.issue(parsed.data.jiraIssueId);
  const [discoveredProject] = await db.select({ id: jiraProjectsTable.id }).from(jiraProjectsTable)
    .where(eq(jiraProjectsTable.jiraProjectId, issue.jiraProjectId)).limit(1);
  const identity = (req as AuthenticatedRequest).matrixIdentity;
  const [link] = await db.insert(links).values({
    projectId, jiraProjectId: discoveredProject?.id ?? null, jiraIssueId: issue.jiraIssueId,
    jiraIssueKey: issue.jiraIssueKey, jiraIssueType: issue.jiraIssueType,
    createdBy: identity?.sub ?? null,
  }).onConflictDoNothing({ target: [links.projectId, links.jiraIssueId] }).returning();
  if (!link) throw new JiraError("This Jira work item is already linked to this project.", 409);
  res.status(201).json(dto(link, issue));
}));

router.delete("/projects/:projectId/jira-links/:linkId", handle(async (req, res) => {
  const projectId = await requireProject(req);
  const linkId = positiveId(req.params.linkId);
  const [removed] = await db.delete(links).where(and(eq(links.id, linkId), eq(links.projectId, projectId))).returning({ id: links.id });
  if (!removed) throw new JiraError("Linked Jira work item not found.", 404);
  res.status(204).send();
}));

export default router;