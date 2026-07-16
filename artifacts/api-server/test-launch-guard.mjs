// Matrix Launch Guard validation harness (ticket IH002).
// Spins a local JWKS server, launches the built API server against it, and
// exercises the full launch-token verification matrix.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const JWKS_PORT = 9301;
const APP_PORT = 9302;
const ISSUER = "https://test-matrix-platform.local";
const AUDIENCE = "matrix-innovation-hub";
const BASE = `http://localhost:${APP_PORT}`;

const { publicKey, privateKey } = await generateKeyPair("RS256");
const { privateKey: wrongKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";

const jwksServer = createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwksServer.listen(JWKS_PORT, r));

const child = spawn("node", ["dist/index.mjs"], {
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    MATRIX_JWKS_URL: `http://localhost:${JWKS_PORT}/jwks`,
    MATRIX_ISSUER: ISSUER,
    MATRIX_AUDIENCE: AUDIENCE,
    SESSION_SECRET: "test-session-secret-for-validation-only",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", () => {});
child.stderr.on("data", (d) => process.stderr.write(d));

// wait for server
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`${BASE}/api/healthz`);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

async function mint({ alg = "RS256", key = privateKey, iss = ISSUER, aud = AUDIENCE, exp = "5m", claims = {} } = {}) {
  const jwt = new SignJWT({ name: "Test User", email: "test.user@matrix.example", ...claims })
    .setProtectedHeader(alg === "RS256" ? { alg, kid: "test-key" } : { alg })
    .setSubject("user-123")
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp);
  return jwt.sign(alg === "HS256" ? new TextEncoder().encode("not-the-platform-key-1234567890abc") : key);
}

const results = [];
async function expectStatus(label, promise, expected) {
  const res = await promise;
  const ok = res.status === expected;
  results.push(`${ok ? "PASS" : "FAIL"} — ${label} (expected ${expected}, got ${res.status})`);
  return res;
}
const exchange = (token) =>
  fetch(`${BASE}/matrix/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });

// Unauthenticated API access
await expectStatus("read API without session returns 401", fetch(`${BASE}/api/initiatives`), 401);
await expectStatus("write API without session returns 401", fetch(`${BASE}/api/initiatives`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), 401);
await expectStatus("environment initialize without session returns 401", fetch(`${BASE}/api/environment/initialize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), 401);
await expectStatus("dashboard without session returns 401", fetch(`${BASE}/api/dashboard`), 401);
await expectStatus("healthz stays public", fetch(`${BASE}/api/healthz`), 200);

// Public metadata endpoints
await expectStatus("/matrix/health public", fetch(`${BASE}/matrix/health`), 200);
await expectStatus("/matrix/app-info public", fetch(`${BASE}/matrix/app-info`), 200);
await expectStatus("/matrix/manifest public", fetch(`${BASE}/matrix/manifest`), 200);

// Token rejection matrix
await expectStatus("garbage token rejected", exchange("not-a-jwt-at-all"), 401);
await expectStatus("expired token rejected", exchange(await mint({ exp: Math.floor(Date.now() / 1000) - 600 })), 401);
await expectStatus("wrong issuer rejected", exchange(await mint({ iss: "https://evil.example" })), 401);
await expectStatus("wrong audience rejected", exchange(await mint({ aud: "some-other-app" })), 401);
await expectStatus("wrong signature rejected", exchange(await mint({ key: wrongKey })), 401);
await expectStatus("wrong algorithm (HS256) rejected", exchange(await mint({ alg: "HS256" })), 401);
await expectStatus("contradictory app_id claim rejected", exchange(await mint({ claims: { app_id: "different-app" } })), 401);

// Valid launch
const good = await expectStatus("valid launch token accepted", exchange(await mint()), 200);
const setCookie = good.headers.get("set-cookie") ?? "";
const cookieOk = /matrix_session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie);
results.push(`${cookieOk ? "PASS" : "FAIL"} — session cookie is HttpOnly SameSite=Lax`);
const body = await good.json();
results.push(`${body?.user?.name === "Test User" ? "PASS" : "FAIL"} — authenticated user identity returned`);
const cookie = setCookie.split(";")[0];

// Session works
await expectStatus("GET /matrix/session with cookie returns user", fetch(`${BASE}/matrix/session`, { headers: { cookie } }), 200);
await expectStatus("read API with session returns 200", fetch(`${BASE}/api/initiatives`, { headers: { cookie } }), 200);

// Logout
const lo = await fetch(`${BASE}/matrix/logout`, { method: "POST", headers: { cookie } });
const cleared = /matrix_session=;|Expires=/i.test(lo.headers.get("set-cookie") ?? "");
results.push(`${cleared ? "PASS" : "FAIL"} — logout clears session cookie`);
await expectStatus("session invalid after cookie cleared (no cookie)", fetch(`${BASE}/matrix/session`), 401);

// Tampered session cookie
await expectStatus("tampered session cookie rejected", fetch(`${BASE}/api/initiatives`, { headers: { cookie: "matrix_session=abc.def.ghi" } }), 401);

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
child.kill();
jwksServer.close();
process.exit(failed ? 1 : 0);
