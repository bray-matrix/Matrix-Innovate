// Compass Phase 3 validation harness: resources, capacity, reports, PDF.
// Same mock-JWKS pattern as test-phase2.mjs.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const JWKS_PORT = 9331;
const APP_PORT = 9332;
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
  .setIssuedAt().setExpirationTime("10m").sign(privateKey);
const sessRes = await fetch(`${BASE}/matrix/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
const cookie = (sessRes.headers.get("set-cookie") ?? "").split(";")[0];

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json, headers: r.headers };
}
const counts = async () => ({
  initiatives: (await api("GET", "/api/initiatives")).json.length,
  projects: (await api("GET", "/api/projects")).json.length,
});

check("W. Platform authentication", sessRes.status === 200 && !!cookie);
const appInfo = await (await fetch(`${BASE}/matrix/app-info`)).json();
check("A/X. app-info Matrix Innovation Hub v1.5.1", appInfo.name === "Matrix Innovation Hub" && appInfo.version === "v1.5.1", JSON.stringify(appInfo));
const health = await (await fetch(`${BASE}/matrix/health`)).json();
check("Y. /matrix/health passes", health.checks?.database === "ok" && health.version === "v1.5.1");

const before = await counts();
const noAuth = await fetch(`${BASE}/api/resources`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const noAuthPdf = await fetch(`${BASE}/api/reports/executive-portfolio/pdf`);
check("SEC. Resource mutations + reports require auth", noAuth.status === 401 && noAuthPdf.status === 401);

// D. resource CRUD
const r1 = await api("POST", "/api/resources", { name: "P3 Alice", department: "Development", roleTitle: "Engineer", weeklyCapacityHours: 40 });
const r2 = await api("POST", "/api/resources", { name: "P3 Bob", department: "Operations" });
const rUpd = await api("PATCH", `/api/resources/${r2.json.id}`, { roleTitle: "Ops Lead" });
const rList = await api("GET", "/api/resources");
check("D. Resource CRUD works", r1.status === 201 && rUpd.status === 200 && rUpd.json.roleTitle === "Ops Lead" && rList.json.some((r) => r.name === "P3 Alice"));

// project + assignments
const proj = await api("POST", "/api/projects", { name: "P3 Validation Project", projectType: "Internal Technology", primaryOwner: "Owner" });
const pid = proj.json.id;
const a1 = await api("POST", `/api/projects/${pid}/resources`, { resourceId: r1.json.id, roleDescription: "Build", allocationPercent: 60, status: "Active" });
const a2 = await api("POST", `/api/projects/${pid}/resources`, { resourceId: r1.json.id, roleDescription: "Support", allocationPercent: 50, status: "Active" });
const aDemand = await api("POST", `/api/projects/${pid}/resources`, { department: "Finance", roleDescription: "Analyst", allocationPercent: 100, status: "Active" });
const aBad = await api("POST", `/api/projects/${pid}/resources`, { roleDescription: "nobody" });
const aList = await api("GET", `/api/projects/${pid}/resources`);
check("E. Assignments persist", a1.status === 201 && a2.status === 201 && aList.json.length === 3 && aList.json.some((a) => a.resourceName === "P3 Alice"));
check("F. Department-only demand works (and bare assignment rejected)", aDemand.status === 201 && aDemand.json.resourceId === null && aBad.status === 400);

// G/H. capacity
const rDetail = await api("GET", `/api/resources/${r1.json.id}`);
check("G. Capacity calculation correct", rDetail.json.allocatedPercent === 110 && rDetail.json.availablePercent === -10 && rDetail.json.activeProjects === 1 && rDetail.json.assignments.length === 2, JSON.stringify({a: rDetail.json.allocatedPercent}));
check("H. Overallocated detection correct", rDetail.json.capacityFlag === "Overallocated");
const aFix = await api("PATCH", `/api/projects/${pid}/resources/${a2.json.id}`, { allocationPercent: 30 });
const rDetail2 = await api("GET", `/api/resources/${r1.json.id}`);
check("H2. Near Capacity flag", aFix.status === 200 && rDetail2.json.allocatedPercent === 90 && rDetail2.json.capacityFlag === "Near Capacity");

// J. portfolio resource summary
const pf = await api("GET", "/api/portfolio");
check("J. Portfolio resource summary", pf.json.summary.nearCapacityResources === 1 && pf.json.summary.overallocatedResources === 0 && pf.json.summary.unfilledDepartmentDemand === 1, JSON.stringify(pf.json.summary));

// K. catalog
const cat = await api("GET", "/api/reports");
check("K. /reports catalog (8 reports)", cat.status === 200 && cat.json.length === 8);

// add governance data for report content
await api("POST", `/api/projects/${pid}/risks`, { title: "P3 risk", severity: "Critical", owner: "QA", mitigationPlan: "fix" });
await api("POST", `/api/projects/${pid}/approvals`, { type: "Go-Live Sign-Off", title: "P3 approval", requestedBy: "PM", approver: "CIO" });
const assess = await api("POST", `/api/projects/${pid}/readiness`, { name: "P3 assessment", seedStandardItems: true });
await api("PATCH", `/api/projects/${pid}/readiness/${assess.json.id}/items/${assess.json.items[0].id}`, { status: "Fail" });
const client = await api("POST", "/api/clients", { name: "P3 Client" });
const program = await api("POST", "/api/programs", { name: "P3 Program" });
await api("PATCH", `/api/projects/${pid}`, { clientId: client.json.id, programId: program.json.id });

const get = (rep, key) => rep.sections.find((s) => s.key === key);
const meta = (rep) => rep.appName === "Matrix Innovation Hub" && rep.appVersion === "v1.5.1" && !!rep.generatedAt;

// L. executive portfolio
const ex = (await api("GET", "/api/reports/executive-portfolio")).json;
check("L. Executive Portfolio correct", meta(ex) && get(ex, "summary").cards.some((c) => c.label === "Active Projects") && get(ex, "highest-risk").rows.some((r) => r.name === "P3 Validation Project") && get(ex, "projects").rows.length >= 1);

// M. project status
const psScopeErr = await api("GET", "/api/reports/project-status");
const ps = (await api("GET", `/api/reports/project-status?projectId=${pid}`)).json;
check("M. Project Status correct", psScopeErr.status === 400 && meta(ps) && ps.scopeLabel === "P3 Validation Project" && get(ps, "risks").rows.length === 1 && get(ps, "resources").rows.length === 3 && get(ps, "readiness").rows.length === 1);

// N/O. client/program
const cp = (await api("GET", `/api/reports/client-portfolio?clientId=${client.json.id}`)).json;
const pp = (await api("GET", `/api/reports/program-portfolio?programId=${program.json.id}`)).json;
check("N. Client Portfolio correct", meta(cp) && cp.scopeLabel === "P3 Client" && get(cp, "projects").rows.length === 1);
check("O. Program Portfolio correct", meta(pp) && pp.scopeLabel === "P3 Program" && get(pp, "projects").rows.length === 1);

// P. resource capacity report
const rc = (await api("GET", "/api/reports/resource-capacity")).json;
check("P. Resource Capacity correct", meta(rc) && get(rc, "resources").rows.some((r) => r.name === "P3 Alice" && r.flag === "Near Capacity") && get(rc, "demand").rows.some((r) => r.department === "Finance"));

// Q. risk & approval
const ra = (await api("GET", "/api/reports/risk-approval")).json;
check("Q. Risk & Approval correct (severity-first)", meta(ra) && get(ra, "risks").rows[0].severity === "Critical" && get(ra, "approvals").rows.some((r) => r.title === "P3 approval"));

// R. go-live readiness
const gl = (await api("GET", "/api/reports/go-live-readiness")).json;
const glRow = get(gl, "readiness").rows.find((r) => r.project === "P3 Validation Project");
check("R. Go-Live Readiness correct (Not Ready first)", meta(gl) && get(gl, "readiness").rows[0].status === "Not Ready" && glRow.failed !== "—");

// S. board pack
const bp = (await api("GET", "/api/reports/board-pack")).json;
check("S. Board Pack correct", meta(bp) && get(bp, "executive-summary") && get(bp, "attention").rows.some((r) => r.category === "Critical Risk") && get(bp, "innovation-pipeline") && get(bp, "upcoming-30"));

// T/U. PDF
const pdfRes = await fetch(`${BASE}/api/reports/board-pack/pdf`, { headers: { cookie } });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
check("T. PDF export works", pdfRes.status === 200 && pdfRes.headers.get("content-type") === "application/pdf" && pdfBuf.subarray(0, 5).toString() === "%PDF-" && pdfBuf.length > 1500, `bytes=${pdfBuf.length}`);
const badPdf = await api("GET", "/api/reports/nope/pdf");
check("T2. Unknown report 404", badPdf.status === 404);

// integrity: patch cannot leave neither resource nor department; unknown resourceId rejected
const namedNoDept = await api("POST", `/api/projects/${pid}/resources`, { resourceId: r2.json.id, roleDescription: "Ops", allocationPercent: 20, status: "Active" });
check("I2. Named assignment inherits resource department", namedNoDept.status === 201 && namedNoDept.json.department === "Operations");
const badPatch = await api("PATCH", `/api/projects/${pid}/resources/${namedNoDept.json.id}`, { resourceId: null, department: null });
const badRes = await api("PATCH", `/api/projects/${pid}/resources/${namedNoDept.json.id}`, { resourceId: 999999 });
check("I3. Invariant enforced on update", badPatch.status === 400 && badRes.status === 400);

// deletion converts named assignments into department demand (with department retained)
await api("DELETE", `/api/resources/${r2.json.id}`);
const afterDel = await api("GET", `/api/projects/${pid}/resources`);
const orphan = afterDel.json.find((a) => a.id === namedNoDept.json.id);
check("I4. Deleted resource becomes department demand", !!orphan && orphan.resourceId === null && orphan.department === "Operations");

// cleanup
const afterDelete = await api("GET", `/api/projects/${pid}/resources`);
await api("DELETE", `/api/projects/${pid}`);
await api("DELETE", `/api/clients/${client.json.id}`);
await api("DELETE", `/api/programs/${program.json.id}`);
await api("DELETE", `/api/resources/${r1.json.id}`);
const after = await counts();
const resLeft = (await api("GET", "/api/resources")).json.filter((r) => r.name.startsWith("P3 "));
check("B. Initiatives preserved", before.initiatives === after.initiatives, `${before.initiatives} -> ${after.initiatives}`);
check("C. Projects preserved", before.projects === after.projects, `${before.projects} -> ${after.projects}`);
check("Cleanup complete", resLeft.length === 0);

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECKS FAILED`);
child.kill(); jwksServer.close();
process.exit(failed.length === 0 ? 0 : 1);
