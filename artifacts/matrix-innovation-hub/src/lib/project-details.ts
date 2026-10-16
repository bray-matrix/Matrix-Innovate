// Pure helpers for project detail editing, creation validation, and
// presentation of authoritative (server-calculated) effective health.
// No React or API imports so they can be exercised with node:test.

export const PROJECT_TYPES = [
  "Client Implementation",
  "Internal Technology",
  "Internal Operations",
  "Executive Initiative",
  "Innovation",
  "Other",
] as const;

export const WORK_TYPE_DESCRIPTIONS: Record<string, string> = {
  "Client Implementation": "Delivering or changing something for a Matrix customer.",
  "Internal Technology": "Systems, software, data or IT work used inside Matrix.",
  "Internal Operations": "Improving how a Matrix team or department works day to day.",
  "Executive Initiative": "Leadership-directed work with company-wide visibility.",
  "Innovation": "Trying out a new idea, pilot or proof of concept.",
  "Other": "Work that does not fit the categories above.",
};

export interface ProjectDetailsSource {
  name: string;
  description?: string | null;
  primaryOwner?: string | null;
  supportingOwners?: string | null;
  projectType: string;
  clientId?: number | null;
  organizationId?: number | null;
  programId?: number | null;
  targetDate?: string | null;
}

export interface ProjectDetailsForm {
  name: string;
  description: string;
  primaryOwner: string;
  supportingOwners: string;
  projectType: string;
  clientId: number | null;
  organizationId: number | null;
  programId: number | null;
  /** YYYY-MM-DD or "" */
  targetDate: string;
}

export interface ProjectDetailsPatch {
  name?: string;
  description?: string;
  primaryOwner?: string;
  supportingOwners?: string;
  projectType?: string;
  clientId?: number | null;
  organizationId?: number | null;
  programId?: number | null;
  targetDate?: string | null;
}

export type ProjectDetailsErrors = Partial<Record<"name" | "primaryOwner" | "projectType", string>>;

export function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export function projectToDetailsForm(p: ProjectDetailsSource): ProjectDetailsForm {
  return {
    name: p.name ?? "",
    description: p.description ?? "",
    primaryOwner: p.primaryOwner ?? "",
    supportingOwners: p.supportingOwners ?? "",
    projectType: p.projectType ?? "",
    clientId: p.clientId ?? null,
    organizationId: p.organizationId ?? null,
    programId: p.programId ?? null,
    targetDate: toDateInput(p.targetDate),
  };
}

export function validateProjectDetails(form: Pick<ProjectDetailsForm, "name" | "primaryOwner" | "projectType">): ProjectDetailsErrors {
  const errors: ProjectDetailsErrors = {};
  if (!form.name.trim()) errors.name = "Enter a project name.";
  if (!form.primaryOwner.trim()) errors.primaryOwner = "Enter the project owner, the person accountable for delivery.";
  if (!form.projectType.trim()) errors.projectType = "Choose the work type that best describes this project.";
  return errors;
}

/**
 * Build an update payload containing ONLY fields that changed relative to
 * the original project. Never includes initiativeId or child collections.
 * Cleared relationships and dates are sent as null. An unchanged date is
 * never reserialized.
 */
export function buildProjectDetailsPatch(original: ProjectDetailsSource, form: ProjectDetailsForm): ProjectDetailsPatch {
  const base = projectToDetailsForm(original);
  const patch: ProjectDetailsPatch = {};
  const name = form.name.trim();
  if (name !== base.name.trim()) patch.name = name;
  const owner = form.primaryOwner.trim();
  if (owner !== base.primaryOwner.trim()) patch.primaryOwner = owner;
  if (form.description !== base.description) patch.description = form.description;
  if (form.supportingOwners !== base.supportingOwners) patch.supportingOwners = form.supportingOwners;
  if (form.projectType !== base.projectType) patch.projectType = form.projectType;
  if (form.clientId !== base.clientId) patch.clientId = form.clientId ?? null;
  if (form.organizationId !== base.organizationId) patch.organizationId = form.organizationId ?? null;
  if (form.programId !== base.programId) patch.programId = form.programId ?? null;
  if (form.targetDate !== base.targetDate) patch.targetDate = form.targetDate ? form.targetDate : null;
  return patch;
}

export function hasChanges(patch: object): boolean {
  return Object.keys(patch).length > 0;
}

/** Extract a useful message from an API error (ApiError has .data). */
export function apiErrorMessage(err: unknown, fallback = "Please try again."): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const d = data as { error?: unknown; message?: unknown };
      if (typeof d.error === "string" && d.error) return d.error;
      if (typeof d.message === "string" && d.message) return d.message;
    }
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

export interface EffectiveHealthRow {
  id: number;
  effectiveHealth: string;
  calculatedHealth: string;
  healthOverridden?: boolean;
}

export type HealthView =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; effective: string; calculated: string; overridden: boolean };

/**
 * Join authoritative portfolio health rows by project ID. Never computes
 * health and never falls back to stored health.
 */
export function buildHealthIndex(
  rows: readonly EffectiveHealthRow[] | undefined,
  loading: boolean,
): (projectId: number) => HealthView {
  if (!rows) return () => (loading ? { status: "loading" } : { status: "unavailable" });
  const map = new Map<number, EffectiveHealthRow>();
  for (const r of rows) map.set(r.id, r);
  return (projectId) => {
    const r = map.get(projectId);
    if (!r) return { status: "unavailable" };
    return { status: "ok", effective: r.effectiveHealth, calculated: r.calculatedHealth, overridden: !!r.healthOverridden };
  };
}

export function healthSortValue(v: HealthView): string {
  return v.status === "ok" ? v.effective : "";
}
