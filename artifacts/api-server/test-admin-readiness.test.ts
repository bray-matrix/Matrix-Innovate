import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db, departmentsTable, environmentEventsTable } from "@workspace/db";
import settingsRouter, { APPLICATION_VERSION } from "./src/routes/settings";
import environmentRouter from "./src/routes/environment";
import jiraRouter from "./src/routes/jira";
import { calculateScore, derivePriority, deriveRevenuePotential, deriveCostSavingsScore, deriveAiReadinessScore, deriveTechnicalComplexityPenalty, deriveRiskPenalty } from "./src/lib/scoring";

function call(router: any, method: string, path: string, roles: string[], body: any = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const route = router.stack.find((r: any) => r.route?.path === path && r.route.methods[method.toLowerCase()]);
    assert.ok(route, `${method} ${path}`);
    let status = 200;
    const req = { method, body, params: { id: "1" }, headers: {}, matrixIdentity: { sub: "fixture", roles } };
    const res: any = { status(v: number) { status = v; return this; }, json(value: unknown) { resolve({ status, body: value }); } };
    let index = 0;
    const next = (error?: unknown) => {
      if (error) { reject(error); return; }
      const layer = route.route.stack[index++];
      if (!layer) { reject(new Error("No response")); return; }
      try { Promise.resolve(layer.handle(req, res, next)).catch(reject); } catch (error) { reject(error); }
    };
    next();
  });
}

test("v1.6.13 settings expose only authoritative, nonsensitive AI architecture; policy unchanged", async () => {
  const select = db.select;
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Settings must not call live AI"); };
    (db as any).select = () => ({
      from(table: unknown) {
        assert.equal(table, departmentsTable, "settings must never read obsolete diagnostic history");
        return { orderBy: async () => [] };
      },
    });
    const result = await call(settingsRouter, "GET", "/settings", []);
    assert.equal(result.status, 200);
    const data = result.body;
    assert.equal(data.applicationVersion, "v1.6.13");
    assert.equal(APPLICATION_VERSION, "v1.6.13");
    assert.equal(JSON.parse(readFileSync("package.json", "utf8")).version, "1.6.13");
    assert.match(readFileSync("../../lib/api-spec/openapi.yaml", "utf8"), /version: 1\.6\.13/);
    assert.equal("aiProvider" in data, false);
    assert.deepEqual(Object.keys(data.aiService).sort(), ["credentials", "deterministicEngine", "deterministicUses", "provider", "service", "status", "statusNotes", "usedFor"].sort());
    assert.equal(data.aiService.service, "Matrix Platform Shared AI Service");
    assert.equal(data.aiService.provider, "Anthropic Claude");
    assert.equal(data.aiService.status, "Not reported");
    assert.match(data.aiService.statusNotes, /documented architecture/);
    assert.match(data.aiService.statusNotes, /No supported live AI health/);
    assert.equal(data.aiService.deterministicEngine, "Rule Engine v1");
    const text = JSON.stringify(data.aiService);
    assert.doesNotMatch(text, /AI_PROVIDER|availableProviders|activeProvider|switchImpact|lastProviderTest|apiKey|secret|token|claude-\d/i);
    assert.deepEqual(data.categories, ["Revenue Growth", "Operational Efficiency", "Customer Experience", "Internal Productivity", "Compliance and Security", "Experimental"]);
    assert.deepEqual(data.statuses, ["Idea", "Review", "Approved", "Prototype", "Pilot", "Production", "Closed", "Declined"]);
    assert.deepEqual(data.scoringWeights.map((w: any) => w.weight), [25, 15, 15, 15, 10, 10, 10, -10, -10]);
  } finally { db.select = select; globalThis.fetch = fetch; }
});

test("retired initialization and provider diagnostics never access DB or generation, including development", async () => {
  const originals = { transaction: db.transaction, select: db.select, insert: db.insert, delete: db.delete };
  const fetch = globalThis.fetch;
  const nodeEnv = process.env.NODE_ENV;
  let accesses = 0;
  try {
    for (const key of Object.keys(originals)) (db as any)[key] = () => { accesses++; throw new Error("Forbidden DB access"); };
    globalThis.fetch = async () => { accesses++; throw new Error("Forbidden network access"); };
    const body = { performedBy: "fixture", archiveSampleInitiatives: true, removeSampleInitiatives: true, clearValidationRecords: true, clearCalculationHistory: true, clearRecommendationHistory: true };
    for (const environment of ["development", "production"]) {
      process.env.NODE_ENV = environment;
      for (const roles of [[], ["User"], ["platform_administrator_extra"]]) {
        assert.equal((await call(environmentRouter, "POST", "/environment/initialize", roles, body)).status, 403);
      }
      assert.equal((await call(environmentRouter, "POST", "/environment/initialize", ["platform_administrator"], body)).status, 410);
      for (const roles of [[], ["platform_administrator"]]) {
        assert.equal((await call(settingsRouter, "POST", "/settings/ai-provider/test", roles)).status, 410);
        assert.equal((await call(settingsRouter, "GET", "/settings/ai-provider/tests", roles)).status, 410);
      }
    }
    assert.equal(accesses, 0, "no transaction, query, provider execution or live request");
    assert.ok((environmentRouter as any).stack.some((r: any) => r.route?.path === "/environment" && r.route.methods.get));
    assert.ok((environmentRouter as any).stack.some((r: any) => r.route?.path === "/environment/history" && r.route.methods.get));
  } finally {
    Object.assign(db, originals); globalThis.fetch = fetch;
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  }
});

test("normal users cannot execute any Jira Admin mutation or upstream action", async () => {
  const transaction = db.transaction;
  const insert = db.insert;
  const fetch = globalThis.fetch;
  let accesses = 0;
  try {
    (db as any).transaction = (db as any).insert = () => { accesses++; throw new Error("Forbidden write"); };
    globalThis.fetch = async () => { accesses++; throw new Error("Forbidden Jira call"); };
    const mutations = (jiraRouter as any).stack.filter((r: any) => r.route && !r.route.methods.get);
    assert.equal(mutations.length, 6);
    for (const route of mutations) {
      const method = Object.keys(route.route.methods)[0].toUpperCase();
      for (const roles of [[], ["User"], ["unknown_platform_role"], ["platform_administrator_extra"]]) {
        assert.equal((await call(jiraRouter, method, route.route.path, roles)).status, 403);
      }
    }
    assert.equal(accesses, 0);
  } finally { db.transaction = transaction; db.insert = insert; globalThis.fetch = fetch; }
});

test("environment history remains an accurate read-only serialization", async () => {
  const select = db.select;
  const transaction = db.transaction;
  const event = { id: 8, performedBy: "Historical administrator", environment: "Development", actions: [{ action: "none", label: "No cleanup actions selected", records: 0, detail: "Historical setup event" }], createdAt: new Date("2025-01-01T12:00:00.000Z") };
  try {
    (db as any).transaction = () => { throw new Error("History must not write"); };
    (db as any).select = () => ({ from(table: unknown) {
      assert.equal(table, environmentEventsTable);
      return { orderBy: async () => [event] };
    } });
    assert.deepEqual(await call(environmentRouter, "GET", "/environment/history", []), {
      status: 200, body: [{ ...event, createdAt: "2025-01-01T12:00:00.000Z" }],
    });
  } finally { db.select = select; db.transaction = transaction; }
});

test("scoring constants, clamp behavior, thresholds and deterministic derivations regress unchanged", () => {
  const max = { businessValue: 25, revenuePotential: 15, costSavingsScore: 15, customerImpactScore: 15, strategicAlignment: 10, aiReadinessScore: 10, prototypeConfidence: 10, technicalComplexityPenalty: 0, riskPenalty: 0 };
  assert.equal(calculateScore(max), 100);
  assert.equal(calculateScore({ ...max, technicalComplexityPenalty: -10, riskPenalty: -10 }), 80);
  assert.equal(calculateScore(Object.fromEntries(Object.keys(max).map(k => [k, -999])) as any), 0);
  assert.deepEqual([0, 49, 50, 64, 65, 79, 80, 100].map(derivePriority), ["Low", "Low", "Medium", "Medium", "High", "High", "Critical", "Critical"]);
  assert.deepEqual([0, 1, 25000, 100000, 250000, 1000000].map(deriveRevenuePotential), [0, 3, 6, 9, 12, 15]);
  assert.deepEqual([0, 1, 10, 40, 80, 160].map(h => deriveCostSavingsScore(0, h)), [0, 3, 6, 9, 12, 15]);
  assert.deepEqual(["low", "medium", "high"].map(v => deriveAiReadinessScore(v, 0)), [3, 6, 9]);
  assert.deepEqual(["low", "medium", "high"].map(v => deriveTechnicalComplexityPenalty(v, 0)), [-2, -5, -8]);
  assert.deepEqual(["low", "medium", "high"].map(v => deriveRiskPenalty(v, 0)), [-1, -4, -8]);
});