import { Router, type IRouter } from "express";
import {
  db,
  projectsTable,
  projectMilestonesTable,
  projectRisksTable,
  projectApprovalsTable,
  readinessAssessmentsTable,
  readinessItemsTable,
  clientsTable,
  programsTable,
  organizationsTable,
  resourcesTable,
  projectResourceAssignmentsTable,
} from "@workspace/db";
import { summarizeResourceCapacity } from "../lib/capacity";
import {
  computeReadinessStatus,
  computeCalculatedHealth,
  effectiveHealth,
  isHealthOverridden,
  type ReadinessStatus,
} from "../lib/project-health";

// Portfolio rollup — pure aggregation over real execution/governance tables.
// Health here is the deterministic server-side calculation (with manual
// overrides honored via effectiveHealth).

const router: IRouter = Router();

const OPEN_RISK = new Set(["Open", "Mitigating"]);
const CLOSED_STAGES = new Set(["Completed", "Cancelled"]);
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];
const DUE_SOON_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadPortfolioData() {
  const [
    projects,
    milestones,
    risks,
    approvals,
    assessments,
    items,
    clients,
    programs,
    organizations,
  ] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(projectMilestonesTable),
    db.select().from(projectRisksTable),
    db.select().from(projectApprovalsTable),
    db.select().from(readinessAssessmentsTable),
    db.select().from(readinessItemsTable),
    db.select().from(clientsTable),
    db.select().from(programsTable),
    db.select().from(organizationsTable),
  ]);
  return {
    projects,
    milestones,
    risks,
    approvals,
    assessments,
    items,
    clients,
    programs,
    organizations,
  };
}

export function buildPortfolioRows(
  data: Awaited<ReturnType<typeof loadPortfolioData>>,
  now: Date = new Date(),
) {
  const clientNames = new Map(data.clients.map((c) => [c.id, c.name]));
  const programNames = new Map(data.programs.map((p) => [p.id, p.name]));
  const orgNames = new Map(data.organizations.map((o) => [o.id, o.name]));
  const itemsByAssessment = new Map<number, typeof data.items>();
  for (const item of data.items) {
    const list = itemsByAssessment.get(item.assessmentId) ?? [];
    list.push(item);
    itemsByAssessment.set(item.assessmentId, list);
  }
  // Index all child records by projectId once (O(rows)) instead of filtering
  // full arrays per project.
  function groupByProject<T extends { projectId: number }>(rows: T[]) {
    const map = new Map<number, T[]>();
    for (const row of rows) {
      const list = map.get(row.projectId) ?? [];
      list.push(row);
      map.set(row.projectId, list);
    }
    return map;
  }
  const milestonesByProject = groupByProject(data.milestones);
  const risksByProject = groupByProject(data.risks);
  const approvalsByProject = groupByProject(data.approvals);
  const assessmentsByProject = groupByProject(data.assessments);

  return data.projects.map((project) => {
    const milestones = milestonesByProject.get(project.id) ?? [];
    const risks = risksByProject.get(project.id) ?? [];
    const approvals = approvalsByProject.get(project.id) ?? [];
    const assessments = [...(assessmentsByProject.get(project.id) ?? [])].sort(
      (a, b) => b.id - a.id,
    );
    const readinessStatuses: ReadinessStatus[] = assessments.map((a) =>
      computeReadinessStatus(itemsByAssessment.get(a.id) ?? [], a.targetDate, now),
    );
    const calculated = computeCalculatedHealth(
      { project, risks, milestones, approvals, readinessStatuses },
      now,
    );
    const openRisks = risks.filter((r) => OPEN_RISK.has(r.status));
    const topOpenRiskSeverity =
      openRisks.length === 0
        ? "None"
        : SEVERITY_ORDER[
            Math.min(
              ...openRisks.map((r) => {
                const idx = SEVERITY_ORDER.indexOf(r.severity);
                return idx === -1 ? SEVERITY_ORDER.length - 1 : idx;
              }),
            )
          ];
    const context =
      (project.clientId && clientNames.get(project.clientId)) ||
      (project.programId && programNames.get(project.programId)) ||
      (project.organizationId && orgNames.get(project.organizationId)) ||
      "Internal";
    return {
      project,
      row: {
        id: project.id,
        name: project.name,
        projectType: project.projectType,
        context,
        clientId: project.clientId,
        primaryOwner: project.primaryOwner,
        lifecycleStage: project.lifecycleStage,
        state: project.state,
        health: project.health,
        calculatedHealth: calculated,
        effectiveHealth: effectiveHealth(project, calculated),
        healthOverridden: isHealthOverridden(project),
        priority: project.priority,
        targetDate: project.targetDate ? project.targetDate.toISOString() : null,
        milestonesTotal: milestones.length,
        milestonesCompleted: milestones.filter(
          (m) => m.status === "Completed",
        ).length,
        topOpenRiskSeverity,
        pendingApprovals: approvals.filter((a) => a.status === "Pending")
          .length,
        readinessStatus: readinessStatuses[0] ?? "Not Started",
      },
    };
  });
}

router.get("/portfolio", async (_req, res, next) => {
  try {
    const now = new Date();
    const data = await loadPortfolioData();
    const [resources, resourceAssignments] = await Promise.all([
      db.select().from(resourcesTable),
      db.select().from(projectResourceAssignmentsTable),
    ]);
    const resourceSummary = summarizeResourceCapacity(
      resources,
      resourceAssignments,
      now,
    );
    const built = buildPortfolioRows(data, now);
    const active = built.filter(
      ({ project }) =>
        !CLOSED_STAGES.has(project.lifecycleStage) && project.state !== "Closed",
    );
    const summary = {
      activeProjects: active.filter(
        ({ project }) => project.state !== "On Hold" && project.lifecycleStage !== "On Hold",
      ).length,
      atRiskProjects: active.filter(
        ({ row }) => row.effectiveHealth === "At Risk",
      ).length,
      offTrackProjects: active.filter(
        ({ row }) => row.effectiveHealth === "Off Track",
      ).length,
      onHoldProjects: built.filter(
        ({ project }) =>
          project.state === "On Hold" || project.lifecycleStage === "On Hold",
      ).length,
      dueSoonProjects: active.filter(
        ({ project }) =>
          project.targetDate !== null &&
          project.targetDate.getTime() - now.getTime() <= DUE_SOON_MS,
      ).length,
      openCriticalHighRisks: data.risks.filter(
        (r) =>
          OPEN_RISK.has(r.status) &&
          (r.severity === "Critical" || r.severity === "High"),
      ).length,
      pendingApprovals: data.approvals.filter((a) => a.status === "Pending")
        .length,
      notReadyProjects: active.filter(
        ({ row }) => row.readinessStatus === "Not Ready",
      ).length,
      ...resourceSummary,
    };
    res.json({ summary, rows: built.map(({ row }) => row) });
  } catch (err) {
    next(err);
  }
});

export default router;
