import type { Resource, ProjectResourceAssignment } from "@workspace/db";

// Deterministic server-side capacity calculations (Phase 3).
// AI never computes capacity; these rules are the single source of truth.

export const STANDARD_DEPARTMENTS = [
  "Project Management",
  "Development",
  "Operations",
  "Technology",
  "Executive",
  "Sales",
  "Finance",
  "Other",
];

export type CapacityFlag = "Overallocated" | "Near Capacity" | "Available";

// An assignment counts toward current allocation when its status is Active
// (Planned/Completed do not consume capacity) and today falls inside its
// optional date window.
export function isCurrentAssignment(
  a: Pick<ProjectResourceAssignment, "status" | "startDate" | "endDate">,
  now: Date = new Date(),
): boolean {
  if (a.status !== "Active") return false;
  if (a.startDate && a.startDate.getTime() > now.getTime()) return false;
  if (a.endDate && a.endDate.getTime() < now.getTime()) return false;
  return true;
}

export function capacityFlag(allocatedPercent: number): CapacityFlag {
  if (allocatedPercent > 100) return "Overallocated";
  if (allocatedPercent >= 85) return "Near Capacity";
  return "Available";
}

export interface ResourceCapacity {
  allocatedPercent: number;
  availablePercent: number;
  capacityFlag: CapacityFlag;
  activeProjects: number;
  plannedHours: number | null;
}

export function computeResourceCapacity(
  assignments: ProjectResourceAssignment[],
  now: Date = new Date(),
): ResourceCapacity {
  const current = assignments.filter((a) => isCurrentAssignment(a, now));
  const allocatedPercent = current.reduce(
    (sum, a) => sum + (a.allocationPercent ?? 0),
    0,
  );
  const hours = current.reduce<number | null>(
    (sum, a) =>
      a.plannedHours === null ? sum : (sum ?? 0) + a.plannedHours,
    null,
  );
  return {
    allocatedPercent,
    availablePercent: 100 - allocatedPercent,
    capacityFlag: capacityFlag(allocatedPercent),
    activeProjects: new Set(current.map((a) => a.projectId)).size,
    plannedHours: hours,
  };
}

// Department-only demand: assignments with no named resource. Reported
// separately — never attributed to named-resource capacity.
export function isDepartmentDemand(
  a: Pick<ProjectResourceAssignment, "resourceId">,
): boolean {
  return a.resourceId === null;
}

export function summarizeResourceCapacity(
  resources: Resource[],
  assignments: ProjectResourceAssignment[],
  now: Date = new Date(),
) {
  const byResource = new Map<number, ProjectResourceAssignment[]>();
  for (const a of assignments) {
    if (a.resourceId === null) continue;
    const list = byResource.get(a.resourceId) ?? [];
    list.push(a);
    byResource.set(a.resourceId, list);
  }
  let overallocated = 0;
  let nearCapacity = 0;
  for (const r of resources) {
    if (r.status !== "Active") continue;
    const flag = computeResourceCapacity(
      byResource.get(r.id) ?? [],
      now,
    ).capacityFlag;
    if (flag === "Overallocated") overallocated++;
    else if (flag === "Near Capacity") nearCapacity++;
  }
  const unfilledDemand = assignments.filter(
    (a) =>
      isDepartmentDemand(a) &&
      a.status !== "Completed",
  ).length;
  return {
    overallocatedResources: overallocated,
    nearCapacityResources: nearCapacity,
    unfilledDepartmentDemand: unfilledDemand,
  };
}
