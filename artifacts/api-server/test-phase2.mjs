// Compass Phase 2 validation harness (risks, approvals, readiness, portfolio,
// health, attention). Same pattern as test-execution-phase1.mjs.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const JWKS_PORT = 9321;
const APP_PORT = 9322;
const ISSUER = "matrix-platform-test";
const AUDIENCE = "matrix-innovation-hub";
const BASE = `http://localhost:${APP_PORT}`;

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key"; jwk.alg = "RS256"; jwk.use = "sig";
const jwksServer = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/.well-known/openid-configuration") {
    res.end(JSON.stringify({
      issuer: ISSUER,
      jwks_uri: `http://localhost:${JWKS_PORT}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ["RS256"],
      matrix_logout_endpoint: `http://localhost:${JWKS_PORT}/logout`,
    }));
    return;
  }
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwksServer.listen(JWKS_PORT, r));

const child = spawn("node", ["dist/index.mjs"], {
  env: { ...process.env, PORT: String(APP_PORT), MATRIX_PLATFORM_URL: `http://localhost:${JWKS_PORT}`, SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret-0123456789", NODE_ENV: "development" },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const token = await new SignJWT({ name: "Validator", email: "v@matrix.com" })
  .setProtectedHeader({ alg: "RS256", kid: "test-key" })
  .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject("validator-1")
  .setIssuedAt().setExpirationTime("5m").sign(privateKey);
const sessRes = await fetch(`${BASE}/matrix/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
const cookie = (sessRes.headers.get("set-cookie") ?? "").split(";")[0];

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

check("P. Platform authentication", sessRes.status === 200 && !!cookie);
const appInfo = await (await fetch(`${BASE}/matrix/app-info`)).json();
check("A/Q. app-info Innovation Hub v1.6.1", appInfo.name === "Innovation Hub" && appInfo.version === "v1.6.1", JSON.stringify(appInfo));
const health = await (await fetch(`${BASE}/matrix/health`)).json();
check("R. /matrix/health passes", health.checks?.database === "ok" && health.version === "v1.6.1");

const initsBefore = (await api("GET", "/api/initiatives")).json.length;
const projsBefore = (await api("GET", "/api/projects")).json.length;

// baseline mutation guard: unauthenticated mutation must fail
const noAuth = await fetch(`${BASE}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("SEC. Mutations require session", noAuth.status === 401);

// project
const proj = await api("POST", "/api/projects", { name: "P2 Validation Project", projectType: "Internal Technology", primaryOwner: "Owner", targetDate: new Date(Date.now() + 10 * 864e5).toISOString() });
const pid = proj.json.id;

// D/E. risk CRUD + persistence
const risk = await api("POST", `/api/projects/${pid}/risks`, { title: "Data quality risk", severity: "High", probability: "Medium", impact: "High", owner: "QA", mitigationPlan: "profiling" });
const riskUpd = await api("PATCH", `/api/projects/${pid}/risks/${risk.json.id}`, { status: "Mitigating" });
const riskList = await api("GET", `/api/projects/${pid}/risks`);
check("D. Risk CRUD works", risk.status === 201 && riskUpd.status === 200 && riskList.json.length === 1);
check("E. Risks persist after reload", riskList.json[0].status === "Mitigating" && riskList.json[0].severity === "High");

// health: high open risk => At Risk
let detail = await api("GET", `/api/projects/${pid}`);
check("M. Health calc (open High risk => At Risk)", detail.json.calculatedHealth === "At Risk" && detail.json.effectiveHealth === "At Risk" && detail.json.healthOverridden === false, detail.json.calculatedHealth);

// critical risk => Off Track
const crit = await api("POST", `/api/projects/${pid}/risks`, { title: "Showstopper", severity: "Critical" });
detail = await api("GET", `/api/projects/${pid}`);
check("M2. Health calc (open Critical => Off Track)", detail.json.calculatedHealth === "Off Track");

// manual override
const ovr = await api("PATCH", `/api/projects/${pid}`, { health: "On Track", healthOverrideReason: "Exec accepted risk" });
detail = await api("GET", `/api/projects/${pid}`);
check("M3. Manual override tracked & honored", detail.json.healthOverridden === true && detail.json.effectiveHealth === "On Track" && detail.json.calculatedHealth === "Off Track" && detail.json.healthOverrideBy === "Validator" && detail.json.healthOverrideReason === "Exec accepted risk");
await api("PATCH", `/api/projects/${pid}`, { health: "Unknown" });
detail = await api("GET", `/api/projects/${pid}`);
check("M4. Override cleared via Unknown", detail.json.healthOverridden === false && detail.json.effectiveHealth === "Off Track");

// F/G. approvals
const appr = await api("POST", `/api/projects/${pid}/approvals`, { type: "Go-Live Sign-Off", title: "Prod go-live", requestedBy: "Owner", approver: "CIO" });
check("F. Approval CRUD works", appr.status === 201 && appr.json.status === "Pending" && appr.json.requestedAt);
const decide = await api("PATCH", `/api/projects/${pid}/approvals/${appr.json.id}`, { status: "Approved", decisionNotes: "ok" });
const apprList = await api("GET", `/api/projects/${pid}/approvals`);
check("G. Approve/reject persists (decidedAt stamped)", decide.status === 200 && decide.json.status === "Approved" && !!decide.json.decidedAt && apprList.json[0].decisionNotes === "ok");

// decidedAt transition safety
const firstDecidedAt = decide.json.decidedAt;
await new Promise((r) => setTimeout(r, 1100));
const metaEdit = await api("PATCH", `/api/projects/${pid}/approvals/${appr.json.id}`, { decisionNotes: "ok (amended)" });
const repeatDecide = await api("PATCH", `/api/projects/${pid}/approvals/${appr.json.id}`, { status: "Approved" });
check("G2. decidedAt not rewritten by metadata edit / repeat decide", metaEdit.json.decidedAt === firstDecidedAt && repeatDecide.json.decidedAt === firstDecidedAt);
const revert = await api("PATCH", `/api/projects/${pid}/approvals/${appr.json.id}`, { status: "Pending" });
check("G3. decided -> Pending clears decidedAt", revert.json.decidedAt === null);
await api("PATCH", `/api/projects/${pid}/approvals/${appr.json.id}`, { status: "Approved", decisionNotes: "ok" });

// H. global queue
const appr2 = await api("POST", `/api/projects/${pid}/approvals`, { type: "Scope Change", title: "Add module", requestedBy: "PM", approver: "CIO" });
const queue = await api("GET", "/api/approvals");
check("H. Global approval queue (pending first, project name)", queue.status === 200 && queue.json[0].status === "Pending" && queue.json[0].projectName === "P2 Validation Project");

// I/J. readiness
const assess = await api("POST", `/api/projects/${pid}/readiness`, { name: "Go-Live Assessment", seedStandardItems: true, targetDate: new Date(Date.now() + 5 * 864e5).toISOString() });
check("I. Readiness persists (seeded standard items)", assess.status === 201 && assess.json.items.length === 9);
check("J1. Seeded near-target => At Risk", assess.json.readinessStatus === "At Risk", assess.json.readinessStatus);
const aid = assess.json.id;
const failItem = assess.json.items[0];
await api("PATCH", `/api/projects/${pid}/readiness/${aid}/items/${failItem.id}`, { status: "Fail" });
let rd = await api("GET", `/api/projects/${pid}/readiness`);
check("J2. Required Fail => Not Ready", rd.json[0].readinessStatus === "Not Ready");
for (const item of rd.json[0].items) await api("PATCH", `/api/projects/${pid}/readiness/${aid}/items/${item.id}`, { status: "Pass" });
rd = await api("GET", `/api/projects/${pid}/readiness`);
check("J3. All required Pass => Ready", rd.json[0].readinessStatus === "Ready");

// K/L. portfolio
const pf = await api("GET", "/api/portfolio");
const row = pf.json.rows.find((r) => r.id === pid);
check("K. Portfolio real DB data", pf.status === 200 && !!row && row.milestonesTotal === 0 && row.topOpenRiskSeverity === "Critical" && row.pendingApprovals === 1 && row.readinessStatus === "Ready", JSON.stringify(row));
check("L. Portfolio summary counts", pf.json.summary.openCriticalHighRisks === 2 && pf.json.summary.pendingApprovals === 1 && typeof pf.json.summary.activeProjects === "number", JSON.stringify(pf.json.summary));

// O. dashboard attention
const att = await api("GET", "/api/dashboard/attention");
check("O. Dashboard attention metrics", att.status === 200 && att.json.openCriticalHighRisks === 2 && att.json.pendingApprovals === 1 && att.json.notReadyProjects === 0, JSON.stringify(att.json));

// cleanup + T
await api("DELETE", `/api/projects/${pid}`);
const initsAfter = (await api("GET", "/api/initiatives")).json.length;
const projsAfter = (await api("GET", "/api/projects")).json.length;
check("B/T. Initiatives unchanged", initsAfter === initsBefore, `${initsBefore} -> ${initsAfter}`);
check("C/T. Projects unchanged", projsAfter === projsBefore, `${projsBefore} -> ${projsAfter}`);
// cascade check: risk/approval/readiness rows gone with project
const orphan = await api("GET", `/api/projects/${pid}/risks`);
check("Cascade cleanup", orphan.status === 404);

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECKS FAILED`);
child.kill(); jwksServer.close();
process.exit(failed.length === 0 ? 0 : 1);
