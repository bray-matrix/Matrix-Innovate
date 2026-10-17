import test from "node:test";
import assert from "node:assert/strict";
import { checkVersions, readVersions, selectVersion } from "./application-version.mjs";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

test("authoritative manifest has distinct release and development versions", () => {
  const versions = readVersions();
  assert.equal(selectVersion(versions, true), "1.6.14");
  assert.equal(selectVersion(versions, false), "1.6.14-dev.2");
});

test("release guard rejects development and other prerelease suffixes without rewriting", () => {
  for (const release of ["1.6.14-dev.2", "1.6.14-dev", "1.6.14-DEV.2", "1.6.14-rc.1", "v1.6.14", "", undefined]) {
    const versions = { release, development: "1.6.14-dev.2" };
    assert.throws(() => selectVersion(versions, true), /Version validation failed: production release/);
    assert.equal(versions.release, release);
  }
});

test("development remains available even when the pending release is a prerelease", () => {
  assert.equal(selectVersion({ release: "1.7.0-dev.1", development: "1.7.0-dev.1" }, false), "1.7.0-dev.1");
});

test("invalid development identifiers fail explicitly", () => {
  assert.throws(() => selectVersion({ development: "not-a-version" }), /Version validation failed/);
});

test("committed package and documentation metadata match the authoritative manifest", () => {
  assert.equal(checkVersions(false), readVersions().development);
  assert.equal(checkVersions(true), readVersions().release);
});

test("release CLI fails clearly; development CLI accepts dev identifiers; drift is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "hub-version-check-"));
  const root = new URL("../", import.meta.url);
  const files = ["scripts/application-version.mjs", "artifacts/api-server/src/application-version.json",
    "artifacts/api-server/package.json", "artifacts/matrix-innovation-hub/package.json", "lib/api-spec/openapi.yaml"];
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), readFileSync(new URL(file, root)));
    }
    const run = (...args) => spawnSync(process.execPath, [join(dir, files[0]), ...args], { encoding: "utf8" });
    const versions = readVersions();
    writeFileSync(join(dir, files[1]), JSON.stringify({ ...versions, release: versions.development }));
    writeFileSync(join(dir, files[4]), readFileSync(join(dir, files[4]), "utf8").replace(`version: ${versions.release}`, `version: ${versions.development}`));
    const rejected = run("--production");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /production release.*-dev/);
    assert.equal(run().status, 0, "normal development must remain available");
    writeFileSync(join(dir, files[1]), JSON.stringify(versions));
    writeFileSync(join(dir, files[4]), readFileSync(new URL(files[4], root)));
    const pkg = JSON.parse(readFileSync(join(dir, files[2]), "utf8"));
    writeFileSync(join(dir, files[2]), JSON.stringify({ ...pkg, version: "0.0.0" }));
    assert.match(run("--production").stderr, /Version metadata drift/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
