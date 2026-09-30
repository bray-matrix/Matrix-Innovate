import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "private-interview-tests-"));
try {
  const output = join(dir, "tests.cjs");
  await build({ entryPoints: ["test-interview-drafts.test.ts"], outfile: output, bundle: true,
    platform: "node", format: "cjs", external: ["pg-native"], logLevel: "silent" });
  const result = spawnSync(process.execPath, ["--test", output], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}