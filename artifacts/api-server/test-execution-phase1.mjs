// Compass Phase 1 validation harness.
// Reuses the launch-guard pattern: local mock JWKS + built server, mints a
// valid launch token, exchanges it for a session cookie, then exercises the
// new execution domain end-to-end (orgs/clients/programs/projects/milestones,
// initiative promotion + duplicate protection, dashboard execution summary)
// and re-verifies existing innovation endpoints.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const JWKS_PORT = 9311;
const APP_PORT = 9312;
const ISSUER = "matrix-platform-test";
const AUDIENCE = "matrix-innovation-hub";
const BASE = `http://localhost:${APP_PORT}`;

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";

const jwksServer = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/.well-known/openid-configuration") {
    res.end(
      JSON.stringify({
        issuer: ISSUER,
        jwks_uri: `http://localhost:${JWKS_PORT}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ["RS256"],
        matrix_logout_endpoint: `http://localhost:${JWKS_PORT}/logout`,
      }),
    );
    return;
  }
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwksServer.listen(JWKS_PORT, r));

const child = spawn("node", ["dist/index.mjs"], {
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    MATRIX_PLATFORM_URL: `http://localhost:${JWKS_PORT}`,
    SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret-0123456789",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "ignore", "inherit"],
});

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}
await waitReady();

const launchToken = await new SignJWT({ name: "Validator", email: "v@matrix.com" })
  .setProtectedHeader({ alg: "RS256", kid: "test-key" })
  .setIssuer(ISSUER)
  .setAudience(AUDIENCE)
  .setSubject("validator-1")
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(privateKey);

const sessRes = await fetch(`${BASE}/matrix/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: launchToken }),
});
const cookie = (sessRes.headers.get("set-cookie") ?? "").split(";")[0];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

check("H. Platform authentication (session exchange)", sessRes.status === 200 && !!cookie);

// I. app-info
const appInfo = await (await fetch(`${BASE}/matrix/app-info`)).json();
check("I. /matrix/app-info = Matrix Innovation Hub v1.5.0", appInfo.name === "Matrix Innovation Hub" && appInfo.version === "v1.5.0", JSON.stringify(appInfo));

// J. health
const healthRes = await fetch(`${BASE}/matrix/health`);
const health = await healthRes.json();
check("J. /matrix/health db check", healthRes.status === 200 && health.checks?.database === "ok" && health.version === "v1.5.0");

// A/R. initiative count snapshot
const before = await api("GET", "/api/initiatives");
const initiativeCountBefore = before.json.length;

// Existing innovation endpoints (B-G)
const seedInit = await api("POST", "/api/initiatives", {
  title: "Phase1 Validation Initiative",
  department: "IT",
  submitterName: "Validator",
  category: "Automation",
  businessOwner: "Owner A",
  executiveSponsor: "Sponsor B",
  problemStatement: "test problem",
  currentProcess: "manual",
  desiredOutcome: "automated",
  aiConcept: "LLM assistant",
  prototypeGoal: "demo",
  successMetric: "hours saved",
  estimatedHoursSavedMonthly: 40,
  customerImpact: "Medium",
  aiReadiness: "High",
});
check("C. Initiative scoring works", seedInit.status === 201 && typeof seedInit.json.score === "number", `score=${seedInit.json?.score}`);
const initId = seedInit.json.id;
const versions = await api("GET", `/api/initiatives/${initId}/versions`);
check("D. Version history works", versions.status === 200 && Array.isArray(versions.json));
const statusUpd = await api("PATCH", `/api/initiatives/${initId}`, { status: "Approved" });
check("E. Kanban-style status update works", statusUpd.status === 200 && statusUpd.json.status === "Approved");
const val = await api("POST", "/api/validations", { releaseVersion: "v1.0.0", testerName: "Validator" });
check("F. Validation works", val.status === 201 && Array.isArray(val.json.items) && val.json.items.length > 0);
const bl = await api("POST", "/api/backlog", { title: "Phase1 check item" });
check("G. Product Backlog works", bl.status === 201);
const dash = await api("GET", "/api/dashboard/summary");
check("B. Dashboard works", dash.status === 200 && typeof dash.json.totalInitiatives === "number");

// Execution summary should now count 1 approved unpromoted
const exec1 = await api("GET", "/api/dashboard/execution-summary");
check("Dashboard execution summary", exec1.status === 200 && exec1.json.approvedUnpromotedInitiatives >= 1, JSON.stringify(exec1.json));

// K. Org/Client/Program + Projects CRUD
const org = await api("POST", "/api/organizations", { name: "Acme Org" });
const client = await api("POST", "/api/clients", { name: "Acme Client", organizationId: org.json.id });
const program = await api("POST", "/api/programs", { name: "Acme Program", clientId: client.json.id, owner: "PM" });
check("Org/Client/Program create", org.status === 201 && client.status === 201 && program.status === 201);

// L. internal project without client/program
const internal = await api("POST", "/api/projects", {
  name: "Internal Ops Project", projectType: "Internal Operations", primaryOwner: "Ops Lead",
});
check("L. Internal project (no client/program)", internal.status === 201 && internal.json.clientId === null && internal.json.programId === null);

// M. client project
const clientProj = await api("POST", "/api/projects", {
  name: "Client Impl Project", projectType: "Client Implementation",
  organizationId: org.json.id, clientId: client.json.id, programId: program.json.id,
  primaryOwner: "Delivery Lead", priority: "High", targetDate: new Date(Date.now() + 10 * 864e5).toISOString(),
});
check("M. Client project creation", clientProj.status === 201 && clientProj.json.clientId === client.json.id);
check("M2. targetDate persists (due-soon input)", typeof clientProj.json.targetDate === "string" && clientProj.json.targetDate !== null, String(clientProj.json.targetDate));
const execDue = await api("GET", "/api/dashboard/execution-summary");
check("M3. due-soon count reflects target dates", execDue.status === 200 && execDue.json.dueSoonProjects >= 1, JSON.stringify(execDue.json));

// K. update/list/delete
const upd = await api("PATCH", `/api/projects/${internal.json.id}`, { health: "At Risk", lifecycleStage: "In Progress" });
const list = await api("GET", "/api/projects");
check("K. Projects CRUD (create/update/list)", upd.status === 200 && upd.json.health === "At Risk" && list.json.length >= 2);

// P. milestones
const ms = await api("POST", `/api/projects/${clientProj.json.id}/milestones`, {
  name: "Kickoff", stageGate: true, sequence: 1, dueDate: new Date(Date.now() + 5 * 864e5).toISOString(),
});
const msUpd = await api("PATCH", `/api/projects/${clientProj.json.id}/milestones/${ms.json.id}`, { status: "In Progress" });
const detail = await api("GET", `/api/projects/${clientProj.json.id}`);
check("P. Milestones persist", ms.status === 201 && msUpd.status === 200 && detail.json.milestones.length === 1 && detail.json.milestones[0].status === "In Progress");

// N. promotion
const promo = await api("POST", `/api/initiatives/${initId}/promote`, {
  projectType: "Innovation", primaryOwner: "Owner A",
});
check("N. Initiative -> Project promotion", promo.status === 201 && promo.json.initiativeId === initId && promo.json.name === "Phase1 Validation Initiative");

// duplicate protection
const dup = await api("POST", `/api/initiatives/${initId}/promote`, { projectType: "Innovation", primaryOwner: "Owner A" });
const dupAllowed = await api("POST", `/api/initiatives/${initId}/promote`, { projectType: "Innovation", primaryOwner: "Owner A", allowDuplicate: true });
check("N2. Duplicate protection (409 then explicit allow)", dup.status === 409 && dupAllowed.status === 201);

// O. links
const byInit = await api("GET", `/api/projects?initiativeId=${initId}`);
const promoDetail = await api("GET", `/api/projects/${promo.json.id}`);
check("O. Initiative <-> Project links", byInit.json.length === 2 && promoDetail.json.initiativeTitle === "Phase1 Validation Initiative");

// initiative preserved
const initAfter = await api("GET", `/api/initiatives/${initId}`);
check("A. Initiative preserved after promotion", initAfter.status === 200 && initAfter.json.title === "Phase1 Validation Initiative" && initAfter.json.status === "Approved");

// cleanup test data
await api("DELETE", `/api/projects/${promo.json.id}`);
await api("DELETE", `/api/projects/${dupAllowed.json.id}`);
await api("DELETE", `/api/projects/${internal.json.id}`);
await api("DELETE", `/api/projects/${clientProj.json.id}`);
await api("DELETE", `/api/programs/${program.json.id}`);
await api("DELETE", `/api/clients/${client.json.id}`);
await api("DELETE", `/api/organizations/${org.json.id}`);
await api("DELETE", `/api/backlog/${bl.json.id}`);
await api("DELETE", `/api/validations/${val.json.id}`);
await api("DELETE", `/api/initiatives/${initId}`);
const after = await api("GET", "/api/initiatives");
check("R. Initiative count unchanged after cleanup", after.json.length === initiativeCountBefore, `${initiativeCountBefore} -> ${after.json.length}`);

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECKS FAILED`);
child.kill();
jwksServer.close();
process.exit(failed.length === 0 ? 0 : 1);
