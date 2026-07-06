export type BumpKind = "patch" | "minor" | "major";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const DEFAULT_VERSION = "v0.1.0";

export function parseVersion(version: string | null | undefined): SemVer {
  if (!version) return { major: 0, minor: 1, patch: 0 };
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return { major: 0, minor: 1, patch: 0 };
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatVersion(v: SemVer): string {
  return `v${v.major}.${v.minor}.${v.patch}`;
}

export function bumpVersion(current: string, kind: BumpKind): string {
  const v = parseVersion(current);
  switch (kind) {
    case "major":
      return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
    case "minor":
      return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
    case "patch":
    default:
      return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  }
}

// Smart bump policy:
// - reaching Production => major
// - any other pipeline status change => minor
// - all other edits => patch
export function determineBumpKind(
  statusChanged: boolean,
  newStatus: string | undefined,
): BumpKind {
  if (statusChanged && (newStatus ?? "").toLowerCase() === "production") {
    return "major";
  }
  if (statusChanged) return "minor";
  return "patch";
}

export { DEFAULT_VERSION };
