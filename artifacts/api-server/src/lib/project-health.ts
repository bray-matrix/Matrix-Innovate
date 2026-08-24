import type {
  Project,
  ProjectMilestone,
  ProjectRisk,
  ProjectApproval,
  ReadinessAssessment,
  ReadinessItem,
} from "@workspace/db";

// Deterministic, server-side readiness and health calculations (Phase 2).
// AI is never responsible for health. Rules are intentionally simple and
// documented; adjust here, not in the UI.

export const STANDARD_READINESS_CATEGORIES = [
  "Requirements",
  "Development",
  "Testing",
  "Data",
  "Operations",
  "Client",
  "Security / Compliance",
  "Production",
  "Training / Documentation",
];

const NEAR_DATE_MS = 14 * 24 * 60 * 60 * 1000;
const SIGNIFICANT_OVERDUE_MS = 14 * 24 * 60 * 60 * 1000;

export type ReadinessStatus = "Ready" | "At Risk" | "Not Ready" | "Not Started";

// NOT READY: any required item failed.
// READY: at least one required item and all required items Pass/Not Applicable.
// NOT STARTED: no items, or nothing has been tested yet (and not near target).
// AT RISK: work incomplete — required items still Not Tested (always flagged
// when the assessment/project target date is near or past).
export function computeReadinessStatus(
  items: Pick<ReadinessItem, "status" | "required">[],
  targetDate: Date | null,
  now: Date = new Date(),
): ReadinessStatus {
  if (items.length === 0) return "Not Started";
  const required = items.filter((i) => i.required);
  if (required.some((i) => i.status === "Fail")) return "Not Ready";
  if (
    required.length > 0 &&
    required.every((i) => i.status === "Pass" || i.status === "Not Applicable")
  ) {
    return "Ready";
  }
  const untouched = items.every((i) => i.status === "Not Tested");
  const nearTarget =
    targetDate !== null && targetDate.getTime() - now.getTime() <= NEAR_DATE_MS;
  if (untouched && !nearTarget) return "Not Started";
  return "At Risk";
}

export type CalculatedHealth = "On Track" | "At Risk" | "Off Track" | "Unknown";

export interface HealthInputs {
  project: Pick<
    Project,
    "lifecycleStage" | "state" | "targetDate" | "health" | "healthOverrideAt"
  >;
  risks: Pick<ProjectRisk, "severity" | "status">[];
  milestones: Pick<ProjectMilestone, "status" | "dueDate" | "stageGate">[];
  approvals: Pick<ProjectApproval, "status" | "type">[];
  readinessStatuses: ReadinessStatus[];
}

const OPEN_RISK = new Set(["Open", "Mitigating"]);
const CLOSED_STAGES = new Set(["Completed", "Cancelled"]);
const CRITICAL_APPROVAL_TYPES = new Set(["Go-Live Sign-Off", "Stage Gate"]);

function milestoneOverdueMs(
  m: Pick<ProjectMilestone, "status" | "dueDate">,
  now: Date,
): number {
  if (!m.dueDate || m.status === "Completed") return 0;
  return Math.max(0, now.getTime() - m.dueDate.getTime());
}

export function computeCalculatedHealth(
  inputs: HealthInputs,
  now: Date = new Date(),
): CalculatedHealth {
  const { project, risks, milestones, approvals, readinessStatuses } = inputs;
  if (CLOSED_STAGES.has(project.lifecycleStage) || project.state === "Closed") {
    return "Unknown";
  }
  const openRisks = risks.filter((r) => OPEN_RISK.has(r.status));
  const nearTarget =
    project.targetDate !== null &&
    project.targetDate.getTime() - now.getTime() <= NEAR_DATE_MS;

  // OFF TRACK
  if (openRisks.some((r) => r.severity === "Critical")) return "Off Track";
  if (readinessStatuses.includes("Not Ready") && nearTarget) return "Off Track";
  if (
    milestones.some(
      (m) => m.stageGate && milestoneOverdueMs(m, now) > SIGNIFICANT_OVERDUE_MS,
    )
  ) {
    return "Off Track";
  }

  // AT RISK
  const anyOverdue = milestones.some((m) => milestoneOverdueMs(m, now) > 0);
  const pendingCritical = approvals.some(
    (a) => a.status === "Pending" && CRITICAL_APPROVAL_TYPES.has(a.type),
  );
  const incompleteMilestones = milestones.some((m) => m.status !== "Completed");
  if (
    openRisks.some((r) => r.severity === "High") ||
    anyOverdue ||
    pendingCritical ||
    readinessStatuses.includes("At Risk") ||
    readinessStatuses.includes("Not Ready") ||
    (nearTarget && incompleteMilestones)
  ) {
    return "At Risk";
  }

  // ON TRACK with sufficient data, otherwise UNKNOWN
  const hasData =
    milestones.length > 0 ||
    risks.length > 0 ||
    readinessStatuses.length > 0 ||
    project.targetDate !== null;
  return hasData ? "On Track" : "Unknown";
}

export function isHealthOverridden(
  project: Pick<Project, "healthOverrideAt">,
): boolean {
  return project.healthOverrideAt !== null;
}

export function effectiveHealth(
  project: Pick<Project, "health" | "healthOverrideAt">,
  calculated: CalculatedHealth,
): string {
  return isHealthOverridden(project) ? project.health : calculated;
}
