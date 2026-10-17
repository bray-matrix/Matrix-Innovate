import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
export function readVersions() {
  return JSON.parse(readFileSync(new URL("artifacts/api-server/src/application-version.json", root), "utf8"));
}

export function selectVersion(versions, production = false) {
  const value = production ? versions.release : versions.development;
  const valid = production
    ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
    : /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
  if (typeof value !== "string" || !valid.test(value)) {
    throw new Error(`Version validation failed: ${production ? "production release" : "development"} version "${value}" is invalid. Production requires a stable x.y.z version, without -dev or other prerelease suffixes. Edit application-version.json explicitly; versions are never silently rewritten.`);
  }
  return value;
}

function metadata(versions) {
  return [
    ...["artifacts/api-server/package.json", "artifacts/matrix-innovation-hub/package.json"].map(path => {
      const url = new URL(path, root);
      const current = readFileSync(url, "utf8");
      const next = current.replace(/("version"\s*:\s*")[^"]+(")/, `$1${versions.development}$2`);
      return { path, url, current, next };
    }),
    (() => {
      const path = "lib/api-spec/openapi.yaml";
      const url = new URL(path, root);
      const current = readFileSync(url, "utf8");
      const next = current.replace(/^(  version: ).+$/m, `$1${versions.release}`);
      return { path, url, current, next };
    })(),
  ];
}

export function checkVersions(production = false) {
  const versions = readVersions();
  const selected = selectVersion(versions, production);
  for (const entry of metadata(versions)) {
    if (entry.current !== entry.next) {
      throw new Error(`Version metadata drift in ${entry.path}. Run pnpm version:sync and regenerate API documentation before building.`);
    }
  }
  return selected;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--sync")) {
      const versions = readVersions();
      selectVersion(versions, true);
      selectVersion(versions, false);
      for (const entry of metadata(versions)) {
        if (entry.current !== entry.next) writeFileSync(entry.url, entry.next);
      }
    }
    const production = process.argv.includes("--production");
    console.log(`Version validation passed (${production ? "release" : "development"}): v${checkVersions(production)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
