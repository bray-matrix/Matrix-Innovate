import {
  db,
  initiativesTable,
  resourcesTable,
  projectResourceAssignmentsTable,
  readinessItemsTable,
  type Project,
  type ProjectResourceAssignment,
  type Resource,
} from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { projectsTable, type Initiative } from "@workspace/db";
import { loadPortfolioData, buildPortfolioRows } from "../routes/portfolio";
import {
  computeResourceCapacity,
  isCurrentAssignment,
  isDepartmentDemand,
  summarizeResourceCapacity,
} from "./capacity";
import { APPLICATION_VERSION } from "../routes/settings";

// Centralized deterministic reporting engine (Phase 3).
// database/repositories -> this service -> structured report model
// -> web renderer / PDF renderer. AI never computes report facts.

export interface ReportCard {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "critical" | null;
}
export interface ReportColumn {
  key: string;
  label: string;
}
export interface ReportSection {
  key: string;
  title: string;
  kind: "cards" | "table" | "keyValues" | "note";
  cards?: ReportCard[];
  columns?: ReportColumn[];
  rows?: Record<string, string>[];
  keyValues?: ReportCard[];
  note?: string | null;
  emptyMessage?: string | null;
}
export interface Report {
  reportKey: string;
  title: string;
  generatedAt: string;
  appName: string;
  appVersion: string;
  scopeLabel?: string | null;
  sections: ReportSection[];
}

export interface ReportScope {
  projectId?: number;
  clientId?: number;
  programId?: number;
}

export const REPORT_CATALOG = [
  { key: "executive-portfolio", title: "Executive Portfolio", description: "Portfolio-wide health, delivery dates, risk, approval, readiness, and capacity picture with project drill-down.", scope: "none" },
  { key: "project-status", title: "Project Status", description: "Full status for a selected project: context, health, milestones, risks, approvals, readiness, and staffing.", scope: "project" },
  { key: "client-portfolio", title: "Client Portfolio", description: "Delivery rollup for a selected client: projects, health, milestones, risks, approvals, readiness.", scope: "client" },
  { key: "program-portfolio", title: "Program Portfolio", description: "Delivery rollup for a selected program.", scope: "program" },
  { key: "resource-capacity", title: "Resource Capacity", description: "Named-resource allocation, availability, overallocation, and unfilled department demand.", scope: "none" },
  { key: "risk-approval", title: "Risk & Approval Summary", description: "Open Critical/High risks and pending approvals, severity-first.", scope: "none" },
  { key: "go-live-readiness", title: "Go-Live Readiness", description: "Readiness status per project with failed and untested required items.", scope: "none" },
  { key: "board-pack", title: "Board / Leadership Pack", description: "Concise decision-focused summary: attention required, upcoming 30/60/90 days, innovation pipeline.", scope: "none" },
] as const;

export type ReportKey = (typeof REPORT_CATALOG)[number]["key"];

const DAY_MS = 24 * 60 * 60 * 1000;
const fmtDate = (d: Date | null | undefined): string =>
  d ? d.toISOString().slice(0, 10) : "—";
const s = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : String(v);

type PortfolioData = Awaited<ReturnType<typeof loadPortfolioData>>;
type BuiltRows = ReturnType<typeof buildPortfolioRows>;

interface InnovationPipeline {
  initiativesUnderReview: Initiative[];
  initiativesApproved: Initiative[];
  initiativesAwaitingPromotion: Initiative[];
}

interface ReportContext {
  data: PortfolioData;
  built: BuiltRows;
  resources: Resource[];
  assignments: ProjectResourceAssignment[];
  pipeline: InnovationPipeline;
  now: Date;
}

// Mirrors the dashboard's definition: approved-or-beyond initiatives with no
// project referencing them are "awaiting promotion".
const APPROVED_OR_BEYOND = new Set([
  "Approved",
  "Prototype",
  "Pilot",
  "Production",
]);

async function loadContext(): Promise<ReportContext> {
  const now = new Date();
  const [data, resources, assignments, initiatives, promotedRows] =
    await Promise.all([
      loadPortfolioData(),
      db.select().from(resourcesTable),
      db.select().from(projectResourceAssignmentsTable),
      db.select().from(initiativesTable),
      db
        .select({ initiativeId: projectsTable.initiativeId })
        .from(projectsTable)
        .where(isNotNull(projectsTable.initiativeId)),
    ]);
  const promoted = new Set(
    promotedRows.map((r) => r.initiativeId).filter((id) => id !== null),
  );
  const pipeline: InnovationPipeline = {
    initiativesUnderReview: initiatives.filter(
      (i) => i.status === "Under Review",
    ),
    initiativesApproved: initiatives.filter((i) =>
      APPROVED_OR_BEYOND.has(i.status),
    ),
    initiativesAwaitingPromotion: initiatives.filter(
      (i) => APPROVED_OR_BEYOND.has(i.status) && !promoted.has(i.id),
    ),
  };
  return {
    data,
    built: buildPortfolioRows(data, now),
    resources,
    assignments,
    pipeline,
    now,
  };
}

function envelope(
  key: ReportKey,
  scopeLabel: string | null,
  sections: ReportSection[],
): Report {
  const entry = REPORT_CATALOG.find((r) => r.key === key)!;
  return {
    reportKey: key,
    title: entry.title,
    generatedAt: new Date().toISOString(),
    appName: "Innovation Hub",
    appVersion: APPLICATION_VERSION,
    scopeLabel,
    sections,
  };
}

const ACTIVE = (p: Project) =>
  !["Completed", "Cancelled"].includes(p.lifecycleStage) && p.state !== "Closed";

function dueWithin(p: Project, days: number, now: Date): boolean {
  if (!p.targetDate) return false;
  const delta = p.targetDate.getTime() - now.getTime();
  return delta >= 0 && delta <= days * DAY_MS;
}

function projectRowsTable(built: BuiltRows): ReportSection {
  return {
    key: "projects",
    title: "Projects",
    kind: "table",
    columns: [
      { key: "name", label: "Project" },
      { key: "context", label: "Context" },
      { key: "owner", label: "Owner" },
      { key: "stage", label: "Stage" },
      { key: "health", label: "Health" },
      { key: "priority", label: "Priority" },
      { key: "target", label: "Target" },
      { key: "milestones", label: "Milestones" },
      { key: "topRisk", label: "Top Risk" },
      { key: "approvals", label: "Pending Approvals" },
      { key: "readiness", label: "Readiness" },
    ],
    rows: built.map(({ row }) => ({
      name: row.name,
      context: row.context,
      owner: s(row.primaryOwner),
      stage: row.lifecycleStage,
      health: row.effectiveHealth,
      priority: row.priority,
      target: row.targetDate ? row.targetDate.slice(0, 10) : "—",
      milestones: `${row.milestonesCompleted}/${row.milestonesTotal}`,
      topRisk: row.topOpenRiskSeverity,
      approvals: String(row.pendingApprovals),
      readiness: row.readinessStatus,
    })),
    emptyMessage: "No projects in scope.",
  };
}

const OPEN_RISK = new Set(["Open", "Mitigating"]);

function healthDistribution(built: BuiltRows): ReportCard[] {
  const active = built.filter(({ project }) => ACTIVE(project));
  const count = (h: string) =>
    active.filter(({ row }) => row.effectiveHealth === h).length;
  return [
    { label: "On Track", value: String(count("On Track")), tone: "positive" },
    { label: "At Risk", value: String(count("At Risk")), tone: "warning" },
    { label: "Off Track", value: String(count("Off Track")), tone: "critical" },
    { label: "Unknown", value: String(count("Unknown")) },
  ];
}

// ---------------------------------------------------------------------------
// Individual reports
// ---------------------------------------------------------------------------

async function executivePortfolio(ctx: ReportContext): Promise<Report> {
  const { data, built, now } = ctx;
  const active = built.filter(({ project }) => ACTIVE(project));
  const capacity = summarizeResourceCapacity(ctx.resources, ctx.assignments, now);
  const overdueMilestones = data.milestones.filter(
    (m) => m.dueDate && m.status !== "Completed" && m.dueDate.getTime() < now.getTime(),
  );
  const approvedAwaiting = ctx.pipeline.initiativesAwaitingPromotion;
  const sections: ReportSection[] = [
    {
      key: "summary",
      title: "Portfolio Summary",
      kind: "cards",
      cards: [
        { label: "Active Projects", value: String(active.length) },
        ...healthDistribution(built),
        { label: "Due ≤30d", value: String(active.filter(({ project }) => dueWithin(project, 30, now)).length) },
        { label: "Due ≤60d", value: String(active.filter(({ project }) => dueWithin(project, 60, now)).length) },
        { label: "Due ≤90d", value: String(active.filter(({ project }) => dueWithin(project, 90, now)).length) },
        { label: "Overdue Milestones", value: String(overdueMilestones.length), tone: overdueMilestones.length ? "warning" : "default" },
        { label: "Pending Approvals", value: String(data.approvals.filter((a) => a.status === "Pending").length) },
        { label: "Overallocated Resources", value: String(capacity.overallocatedResources), tone: capacity.overallocatedResources ? "critical" : "default" },
        { label: "Unfilled Department Demand", value: String(capacity.unfilledDepartmentDemand) },
      ],
    },
    {
      key: "highest-risk",
      title: "Highest-Risk Projects",
      kind: "table",
      columns: [
        { key: "name", label: "Project" },
        { key: "health", label: "Health" },
        { key: "topRisk", label: "Top Open Risk" },
        { key: "readiness", label: "Readiness" },
        { key: "target", label: "Target" },
      ],
      rows: active
        .filter(({ row }) => ["Off Track", "At Risk"].includes(row.effectiveHealth) || ["Critical", "High"].includes(row.topOpenRiskSeverity))
        .map(({ row }) => ({
          name: row.name,
          health: row.effectiveHealth,
          topRisk: row.topOpenRiskSeverity,
          readiness: row.readinessStatus,
          target: row.targetDate ? row.targetDate.slice(0, 10) : "—",
        })),
      emptyMessage: "No projects currently flagged.",
    },
    {
      key: "innovation",
      title: "Approved Initiatives Awaiting Promotion",
      kind: "table",
      columns: [
        { key: "title", label: "Initiative" },
        { key: "department", label: "Department" },
        { key: "status", label: "Status" },
      ],
      rows: approvedAwaiting.map((i) => ({
        title: i.title,
        department: i.department,
        status: i.status,
      })),
      emptyMessage: "No approved initiatives awaiting promotion.",
    },
    projectRowsTable(built),
  ];
  return envelope("executive-portfolio", null, sections);
}

async function projectStatus(ctx: ReportContext, projectId: number): Promise<Report | null> {
  const entry = ctx.built.find(({ project }) => project.id === projectId);
  if (!entry) return null;
  const { project, row } = entry;
  const { data } = ctx;
  let initiativeTitle: string | null = null;
  if (project.initiativeId) {
    const [i] = await db
      .select({ title: initiativesTable.title })
      .from(initiativesTable)
      .where(eq(initiativesTable.id, project.initiativeId));
    initiativeTitle = i?.title ?? null;
  }
  const milestones = data.milestones.filter((m) => m.projectId === projectId);
  const risks = data.risks.filter((r) => r.projectId === projectId);
  const approvals = data.approvals.filter((a) => a.projectId === projectId);
  const assessments = data.assessments.filter((a) => a.projectId === projectId).sort((a, b) => b.id - a.id);
  const itemsByAssessment = new Map<number, typeof data.items>();
  for (const item of data.items) {
    const list = itemsByAssessment.get(item.assessmentId) ?? [];
    list.push(item);
    itemsByAssessment.set(item.assessmentId, list);
  }
  const assignments = ctx.assignments.filter((a) => a.projectId === projectId);
  const resourceNames = new Map(ctx.resources.map((r) => [r.id, r.name]));
  const sections: ReportSection[] = [
    {
      key: "summary",
      title: "Project Summary",
      kind: "keyValues",
      keyValues: [
        { label: "Project", value: project.name },
        { label: "Type", value: project.projectType },
        { label: "Context", value: row.context },
        { label: "Owner", value: s(project.primaryOwner) },
        { label: "Lifecycle Stage", value: project.lifecycleStage },
        { label: "Health", value: row.effectiveHealth, tone: row.effectiveHealth === "Off Track" ? "critical" : row.effectiveHealth === "At Risk" ? "warning" : "default" },
        { label: "Health Basis", value: row.healthOverridden ? `Manual override (${s(project.healthOverrideBy)}: ${s(project.healthOverrideReason)})` : "Calculated" },
        { label: "Priority", value: project.priority },
        { label: "Target Date", value: fmtDate(project.targetDate) },
        { label: "Originating Initiative", value: s(initiativeTitle) },
      ],
    },
    {
      key: "milestones",
      title: "Milestones",
      kind: "table",
      columns: [
        { key: "name", label: "Milestone" },
        { key: "status", label: "Status" },
        { key: "due", label: "Due" },
        { key: "stageGate", label: "Stage Gate" },
      ],
      rows: milestones.map((m) => ({
        name: m.name,
        status: m.status,
        due: fmtDate(m.dueDate),
        stageGate: m.stageGate ? "Yes" : "No",
      })),
      emptyMessage: "No milestones.",
    },
    {
      key: "risks",
      title: "Risks",
      kind: "table",
      columns: [
        { key: "title", label: "Risk" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Status" },
        { key: "owner", label: "Owner" },
        { key: "mitigation", label: "Mitigation" },
        { key: "due", label: "Due" },
      ],
      rows: risks.map((r) => ({
        title: r.title,
        severity: r.severity,
        status: r.status,
        owner: s(r.owner),
        mitigation: s(r.mitigationPlan),
        due: fmtDate(r.dueDate),
      })),
      emptyMessage: "No risks recorded.",
    },
    {
      key: "approvals",
      title: "Approvals",
      kind: "table",
      columns: [
        { key: "title", label: "Approval" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "approver", label: "Approver" },
        { key: "decided", label: "Decided" },
      ],
      rows: approvals.map((a) => ({
        title: a.title,
        type: a.type,
        status: a.status,
        approver: s(a.approver),
        decided: fmtDate(a.decidedAt),
      })),
      emptyMessage: "No approvals recorded.",
    },
    {
      key: "readiness",
      title: "Go-Live Readiness",
      kind: "table",
      columns: [
        { key: "assessment", label: "Assessment" },
        { key: "target", label: "Target" },
        { key: "status", label: "Status" },
        { key: "failed", label: "Failed Required" },
        { key: "untested", label: "Untested Required" },
      ],
      rows: assessments.map((a) => {
        const items = itemsByAssessment.get(a.id) ?? [];
        return {
          assessment: a.name,
          target: fmtDate(a.targetDate),
          status: entry.row.readinessStatus,
          failed: String(items.filter((i) => i.required && i.status === "Fail").length),
          untested: String(items.filter((i) => i.required && i.status === "Not Tested").length),
        };
      }),
      emptyMessage: "No readiness assessments.",
    },
    {
      key: "resources",
      title: "Resource Assignments",
      kind: "table",
      columns: [
        { key: "who", label: "Resource / Demand" },
        { key: "role", label: "Role" },
        { key: "allocation", label: "Allocation %" },
        { key: "hours", label: "Planned Hours" },
        { key: "window", label: "Window" },
        { key: "status", label: "Status" },
      ],
      rows: assignments.map((a) => ({
        who: a.resourceId !== null ? s(resourceNames.get(a.resourceId)) : `${s(a.department)} (demand)`,
        role: s(a.roleDescription),
        allocation: a.allocationPercent === null ? "—" : `${a.allocationPercent}%`,
        hours: s(a.plannedHours),
        window: a.startDate || a.endDate ? `${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}` : "—",
        status: a.status,
      })),
      emptyMessage: "No resource assignments.",
    },
  ];
  return envelope("project-status", project.name, sections);
}

async function scopedPortfolio(
  ctx: ReportContext,
  key: "client-portfolio" | "program-portfolio",
  scopeId: number,
): Promise<Report | null> {
  const isClient = key === "client-portfolio";
  const scopeRow = (isClient ? ctx.data.clients : ctx.data.programs).find((c) => c.id === scopeId);
  if (!scopeRow) return null;
  const scoped = ctx.built.filter(({ project }) =>
    isClient ? project.clientId === scopeId : project.programId === scopeId,
  );
  const risks = ctx.data.risks.filter((r) => scoped.some(({ project }) => project.id === r.projectId));
  const approvals = ctx.data.approvals.filter((a) => scoped.some(({ project }) => project.id === a.projectId));
  const milestones = ctx.data.milestones.filter((m) => scoped.some(({ project }) => project.id === m.projectId));
  const sections: ReportSection[] = [
    {
      key: "summary",
      title: `${isClient ? "Client" : "Program"} Summary`,
      kind: "cards",
      cards: [
        { label: "Projects", value: String(scoped.length) },
        ...healthDistribution(scoped),
        { label: "Milestones Completed", value: `${milestones.filter((m) => m.status === "Completed").length}/${milestones.length}` },
        { label: "Open Critical/High Risks", value: String(risks.filter((r) => OPEN_RISK.has(r.status) && ["Critical", "High"].includes(r.severity)).length) },
        { label: "Pending Approvals", value: String(approvals.filter((a) => a.status === "Pending").length) },
        { label: "Not Ready (Go-Live)", value: String(scoped.filter(({ row }) => row.readinessStatus === "Not Ready").length) },
      ],
    },
    projectRowsTable(scoped),
  ];
  return envelope(key, scopeRow.name, sections);
}

async function resourceCapacity(ctx: ReportContext): Promise<Report> {
  const byResource = new Map<number, ProjectResourceAssignment[]>();
  for (const a of ctx.assignments) {
    if (a.resourceId === null) continue;
    const list = byResource.get(a.resourceId) ?? [];
    list.push(a);
    byResource.set(a.resourceId, list);
  }
  const withCapacity = ctx.resources.map((r) => ({
    resource: r,
    capacity: computeResourceCapacity(byResource.get(r.id) ?? [], ctx.now),
  }));
  const projectNames = new Map(ctx.data.projects.map((p) => [p.id, p.name]));
  const demand = ctx.assignments.filter((a) => isDepartmentDemand(a) && a.status !== "Completed");
  const summary = summarizeResourceCapacity(ctx.resources, ctx.assignments, ctx.now);
  const sections: ReportSection[] = [
    {
      key: "summary",
      title: "Capacity Summary",
      kind: "cards",
      cards: [
        { label: "Resources", value: String(ctx.resources.length) },
        { label: "Overallocated", value: String(summary.overallocatedResources), tone: summary.overallocatedResources ? "critical" : "default" },
        { label: "Near Capacity", value: String(summary.nearCapacityResources), tone: summary.nearCapacityResources ? "warning" : "default" },
        { label: "Unfilled Department Demand", value: String(summary.unfilledDepartmentDemand) },
      ],
    },
    {
      key: "resources",
      title: "Resources",
      kind: "table",
      columns: [
        { key: "name", label: "Resource" },
        { key: "department", label: "Department" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "capacityHours", label: "Weekly Hours" },
        { key: "allocated", label: "Allocated %" },
        { key: "available", label: "Available %" },
        { key: "flag", label: "Flag" },
        { key: "projects", label: "Active Projects" },
      ],
      rows: withCapacity.map(({ resource, capacity }) => ({
        name: resource.name,
        department: resource.department,
        role: s(resource.roleTitle),
        status: resource.status,
        capacityHours: s(resource.weeklyCapacityHours),
        allocated: `${capacity.allocatedPercent}%`,
        available: `${capacity.availablePercent}%`,
        flag: capacity.capacityFlag,
        projects: String(capacity.activeProjects),
      })),
      emptyMessage: "No resources defined.",
    },
    {
      key: "demand",
      title: "Department-Only Demand (Unfilled)",
      kind: "table",
      columns: [
        { key: "project", label: "Project" },
        { key: "department", label: "Department" },
        { key: "role", label: "Role" },
        { key: "allocation", label: "Allocation %" },
        { key: "status", label: "Status" },
      ],
      rows: demand.map((a) => ({
        project: s(projectNames.get(a.projectId)),
        department: s(a.department),
        role: s(a.roleDescription),
        allocation: a.allocationPercent === null ? "—" : `${a.allocationPercent}%`,
        status: a.status,
      })),
      emptyMessage: "No unfilled department demand.",
    },
  ];
  return envelope("resource-capacity", null, sections);
}

async function riskApproval(ctx: ReportContext): Promise<Report> {
  const projectNames = new Map(ctx.data.projects.map((p) => [p.id, p.name]));
  const order = ["Critical", "High", "Medium", "Low"];
  const openRisks = ctx.data.risks
    .filter((r) => OPEN_RISK.has(r.status))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.id - a.id);
  const pending = ctx.data.approvals.filter((a) => a.status === "Pending");
  const ageDays = (d: Date) => Math.floor((ctx.now.getTime() - d.getTime()) / DAY_MS);
  const sections: ReportSection[] = [
    {
      key: "risks",
      title: "Open Risks (Severity-First)",
      kind: "table",
      columns: [
        { key: "severity", label: "Severity" },
        { key: "title", label: "Risk" },
        { key: "project", label: "Project" },
        { key: "owner", label: "Owner" },
        { key: "mitigation", label: "Mitigation" },
        { key: "due", label: "Due" },
      ],
      rows: openRisks.map((r) => ({
        severity: r.severity,
        title: r.title,
        project: s(projectNames.get(r.projectId)),
        owner: s(r.owner),
        mitigation: s(r.mitigationPlan),
        due: fmtDate(r.dueDate),
      })),
      emptyMessage: "No open risks.",
    },
    {
      key: "approvals",
      title: "Pending Approvals",
      kind: "table",
      columns: [
        { key: "title", label: "Approval" },
        { key: "type", label: "Type" },
        { key: "project", label: "Project" },
        { key: "approver", label: "Approver" },
        { key: "age", label: "Age (days)" },
      ],
      rows: pending.map((a) => ({
        title: a.title,
        type: a.type,
        project: s(projectNames.get(a.projectId)),
        approver: s(a.approver),
        age: String(ageDays(a.requestedAt)),
      })),
      emptyMessage: "No pending approvals.",
    },
  ];
  return envelope("risk-approval", null, sections);
}

async function goLiveReadiness(ctx: ReportContext): Promise<Report> {
  const priority = ["Not Ready", "At Risk", "Not Started", "Ready"];
  const itemsByAssessment = new Map<number, typeof ctx.data.items>();
  for (const item of ctx.data.items) {
    const list = itemsByAssessment.get(item.assessmentId) ?? [];
    list.push(item);
    itemsByAssessment.set(item.assessmentId, list);
  }
  const rows = ctx.built
    .filter(({ project }) => ACTIVE(project))
    .map(({ project, row }) => {
      const assessments = ctx.data.assessments.filter((a) => a.projectId === project.id).sort((a, b) => b.id - a.id);
      const latest = assessments[0];
      const items = latest ? (itemsByAssessment.get(latest.id) ?? []) : [];
      const failed = items.filter((i) => i.required && i.status === "Fail");
      const untested = items.filter((i) => i.required && i.status === "Not Tested");
      return {
        sortKey: priority.indexOf(row.readinessStatus),
        cells: {
          project: project.name,
          target: latest ? fmtDate(latest.targetDate) : fmtDate(project.targetDate),
          status: row.readinessStatus,
          failed: failed.length ? failed.map((i) => `${i.category}: ${i.requirement}${i.owner ? ` (${i.owner})` : ""}`).join("; ") : "—",
          untested: untested.length ? untested.map((i) => `${i.category}: ${i.requirement}${i.owner ? ` (${i.owner})` : ""}`).join("; ") : "—",
        },
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
  return envelope("go-live-readiness", null, [
    {
      key: "readiness",
      title: "Go-Live Readiness by Project",
      kind: "table",
      columns: [
        { key: "project", label: "Project" },
        { key: "target", label: "Target" },
        { key: "status", label: "Readiness" },
        { key: "failed", label: "Failed Required Items" },
        { key: "untested", label: "Untested Required Items" },
      ],
      rows: rows.map((r) => r.cells),
      emptyMessage: "No active projects.",
    },
  ]);
}

async function boardPack(ctx: ReportContext): Promise<Report> {
  const { data, built, now } = ctx;
  const active = built.filter(({ project }) => ACTIVE(project));
  const capacity = summarizeResourceCapacity(ctx.resources, ctx.assignments, now);
  const offTrack = active.filter(({ row }) => row.effectiveHealth === "Off Track");
  const criticalRisks = data.risks.filter((r) => OPEN_RISK.has(r.status) && r.severity === "Critical");
  const overdue = data.milestones.filter(
    (m) => m.dueDate && m.status !== "Completed" && m.dueDate.getTime() < now.getTime(),
  );
  const failedReadiness = data.items.filter((i) => i.required && i.status === "Fail");
  const pending = data.approvals.filter((a) => a.status === "Pending");
  const projectNames = new Map(data.projects.map((p) => [p.id, p.name]));
  const assessmentProject = new Map(data.assessments.map((a) => [a.id, a.projectId]));
  const horizon = (days: number, from: number) =>
    active.filter(({ project }) => project.targetDate && project.targetDate.getTime() - now.getTime() > from * DAY_MS && project.targetDate.getTime() - now.getTime() <= days * DAY_MS);
  const horizonRows = (list: BuiltRows) =>
    list.map(({ project, row }) => ({
      project: project.name,
      target: fmtDate(project.targetDate),
      health: row.effectiveHealth,
      milestones: `${row.milestonesCompleted}/${row.milestonesTotal}`,
    }));
  const initiativesUnderReview = ctx.pipeline.initiativesUnderReview;
  const initiativesApproved = ctx.pipeline.initiativesApproved;
  const awaiting = ctx.pipeline.initiativesAwaitingPromotion;
  const sections: ReportSection[] = [
    {
      key: "executive-summary",
      title: "Executive Summary",
      kind: "cards",
      cards: [
        { label: "Active Projects", value: String(active.length) },
        ...healthDistribution(built),
        { label: "Targets ≤90d", value: String(active.filter(({ project }) => dueWithin(project, 90, now)).length) },
        { label: "Overallocated Resources", value: String(capacity.overallocatedResources), tone: capacity.overallocatedResources ? "critical" : "default" },
        { label: "Unfilled Department Demand", value: String(capacity.unfilledDepartmentDemand) },
      ],
    },
    {
      key: "attention",
      title: "Attention Required",
      kind: "table",
      columns: [
        { key: "category", label: "Category" },
        { key: "item", label: "Item" },
        { key: "detail", label: "Detail" },
      ],
      rows: [
        ...offTrack.map(({ project, row }) => ({ category: "Off Track Project", item: project.name, detail: `Health: ${row.effectiveHealth}; top risk ${row.topOpenRiskSeverity}` })),
        ...criticalRisks.map((r) => ({ category: "Critical Risk", item: r.title, detail: `${s(projectNames.get(r.projectId))} — owner ${s(r.owner)}` })),
        ...overdue.map((m) => ({ category: "Overdue Milestone", item: m.name, detail: `${s(projectNames.get(m.projectId))} — due ${fmtDate(m.dueDate)}` })),
        ...failedReadiness.map((i) => ({ category: "Failed Readiness Requirement", item: `${i.category}: ${i.requirement}`, detail: s(projectNames.get(assessmentProject.get(i.assessmentId) ?? -1)) })),
        ...pending.map((a) => ({ category: "Pending Approval", item: a.title, detail: `${s(projectNames.get(a.projectId))} — ${a.type}, approver ${s(a.approver)}` })),
      ],
      emptyMessage: "Nothing currently requires leadership attention.",
    },
    {
      key: "upcoming-30",
      title: "Upcoming — Next 30 Days",
      kind: "table",
      columns: [
        { key: "project", label: "Project" },
        { key: "target", label: "Target" },
        { key: "health", label: "Health" },
        { key: "milestones", label: "Milestones" },
      ],
      rows: horizonRows(horizon(30, 0)),
      emptyMessage: "No target dates in the next 30 days.",
    },
    {
      key: "upcoming-60",
      title: "Upcoming — 31 to 60 Days",
      kind: "table",
      columns: [
        { key: "project", label: "Project" },
        { key: "target", label: "Target" },
        { key: "health", label: "Health" },
        { key: "milestones", label: "Milestones" },
      ],
      rows: horizonRows(horizon(60, 30)),
      emptyMessage: "No target dates in this window.",
    },
    {
      key: "upcoming-90",
      title: "Upcoming — 61 to 90 Days",
      kind: "table",
      columns: [
        { key: "project", label: "Project" },
        { key: "target", label: "Target" },
        { key: "health", label: "Health" },
        { key: "milestones", label: "Milestones" },
      ],
      rows: horizonRows(horizon(90, 60)),
      emptyMessage: "No target dates in this window.",
    },
    {
      key: "innovation-pipeline",
      title: "Innovation Pipeline",
      kind: "cards",
      cards: [
        { label: "Under Review", value: String(initiativesUnderReview.length) },
        { label: "Approved", value: String(initiativesApproved.length) },
        { label: "Approved Awaiting Promotion", value: String(awaiting.length) },
      ],
    },
    {
      key: "awaiting-promotion",
      title: "Approved Initiatives Awaiting Promotion",
      kind: "table",
      columns: [
        { key: "title", label: "Initiative" },
        { key: "department", label: "Department" },
      ],
      rows: awaiting.map((i) => ({ title: i.title, department: i.department })),
      emptyMessage: "None awaiting promotion.",
    },
  ];
  return envelope("board-pack", null, sections);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateReport(
  key: string,
  scope: ReportScope,
): Promise<Report | { error: "unknown" | "scope" | "notFound" }> {
  const entry = REPORT_CATALOG.find((r) => r.key === key);
  if (!entry) return { error: "unknown" };
  if (entry.scope === "project" && !scope.projectId) return { error: "scope" };
  if (entry.scope === "client" && !scope.clientId) return { error: "scope" };
  if (entry.scope === "program" && !scope.programId) return { error: "scope" };
  const ctx = await loadContext();
  let report: Report | null = null;
  switch (entry.key) {
    case "executive-portfolio":
      report = await executivePortfolio(ctx);
      break;
    case "project-status":
      report = await projectStatus(ctx, scope.projectId!);
      break;
    case "client-portfolio":
      report = await scopedPortfolio(ctx, "client-portfolio", scope.clientId!);
      break;
    case "program-portfolio":
      report = await scopedPortfolio(ctx, "program-portfolio", scope.programId!);
      break;
    case "resource-capacity":
      report = await resourceCapacity(ctx);
      break;
    case "risk-approval":
      report = await riskApproval(ctx);
      break;
    case "go-live-readiness":
      report = await goLiveReadiness(ctx);
      break;
    case "board-pack":
      report = await boardPack(ctx);
      break;
  }
  return report ?? { error: "notFound" };
}
