import versions from "../application-version.json";

// The manifest is authoritative. NODE_ENV is already explicitly set by the
// existing development workflow and production service; no new env var is needed.
export function applicationVersion(production = process.env.NODE_ENV === "production"): string {
  const value = production ? versions.release : versions.development;
  if (production && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Invalid production release version: stable x.y.z required; development/prerelease identifiers are not permitted.");
  }
  return `v${value}`;
}

export const APPLICATION_VERSION = applicationVersion();
