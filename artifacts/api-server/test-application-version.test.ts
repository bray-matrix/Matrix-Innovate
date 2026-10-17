import test from "node:test";
import assert from "node:assert/strict";
import { applicationVersion, APPLICATION_VERSION } from "./src/lib/application-version";
import versions from "./src/application-version.json";
import { APPLICATION_VERSION as settingsVersion } from "./src/routes/settings";
import matrixRouter from "./src/matrix/platform";
import { db } from "@workspace/db";

test("runtime explicitly supports production and development identifiers", () => {
  assert.equal(applicationVersion(true), `v${versions.release}`);
  assert.equal(applicationVersion(false), `v${versions.development}`);
});

test("settings and existing endpoint consumers use the same runtime version", () => {
  assert.equal(APPLICATION_VERSION, `v${process.env.NODE_ENV === "production" ? versions.release : versions.development}`);
  assert.equal(settingsVersion, APPLICATION_VERSION);
});

test("health, app-info and manifest expose the selected version without database writes", async () => {
  const execute = db.execute;
  try {
    // No live database connection: the health probe is the sole database call.
    db.execute = (async () => ({ rows: [{ value: 1 }] })) as typeof db.execute;
    for (const path of ["/health", "/app-info", "/manifest"]) {
      const route = matrixRouter.stack.find((layer: any) => layer.route?.path === path)?.route;
      assert.ok(route, path);
      let body: any;
      const res: any = { status() { return this; }, json(value: unknown) { body = value; return this; } };
      await route.stack[0].handle({ log: { error() {} } }, res, () => {});
      assert.equal(body.version, APPLICATION_VERSION, path);
    }
  } finally {
    db.execute = execute;
  }
});
