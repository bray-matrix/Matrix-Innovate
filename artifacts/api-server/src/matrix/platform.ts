import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { APPLICATION_VERSION } from "../routes/settings";
import {
  getMatrixAuthConfig,
  LaunchTokenError,
  mintSessionToken,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyLaunchToken,
  verifySessionToken,
} from "./auth";

// Matrix Platform integration (Matrix SDK v1.1 Trust Model).
// Platform infrastructure is intentionally kept separate from business routes
// and outside the business OpenAPI contract (SDK doc 08 - Best Practices).

export const MATRIX_SDK_VERSION = "1.1";

const APP_NAME = "Matrix Innovation Hub";
const APP_SLUG = "matrix-innovation-hub";
const APP_OWNER = "CIO / AI Innovation Office";

function baseUrls(): { productionUrl: string | null; previewUrl: string | null } {
  const prodDomain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const devDomain = process.env["REPLIT_DEV_DOMAIN"]?.trim();
  return {
    productionUrl: prodDomain ? `https://${prodDomain}` : null,
    previewUrl: devDomain ? `https://${devDomain}` : null,
  };
}

const router: IRouter = Router();

// Launch exchange: the frontend sends the fragment-delivered launch token
// exactly once; the server verifies it against the platform JWKS and mints a
// short-lived HttpOnly session cookie. The raw token is never logged.
router.post("/session", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) {
    res.status(400).json({ error: "Missing launch token" });
    return;
  }
  try {
    const identity = await verifyLaunchToken(token);
    const session = await mintSessionToken(identity);
    res.cookie(SESSION_COOKIE, session, sessionCookieOptions());
    res.json({ user: { sub: identity.sub, name: identity.name, email: identity.email } });
  } catch (err) {
    if (err instanceof LaunchTokenError) {
      req.log.warn({ reason: err.message }, "Matrix launch token rejected");
      res.status(401).json({ error: "Invalid Matrix launch token" });
      return;
    }
    throw err;
  }
});

router.get("/session", async (req, res) => {
  const cookie = readSessionCookie(req);
  const identity = cookie ? await verifySessionToken(cookie) : null;
  if (!identity) {
    res.status(401).json({ error: "Matrix Platform session required" });
    return;
  }
  res.json({ user: { sub: identity.sub, name: identity.name, email: identity.email } });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true, platformUrl: getMatrixAuthConfig().platformUrl });
});

router.get("/app-info", (_req, res) => {
  res.json({
    name: APP_NAME,
    slug: APP_SLUG,
    version: APPLICATION_VERSION,
    sdkVersion: MATRIX_SDK_VERSION,
    owner: APP_OWNER,
    authentication: "matrix-platform",
  });
});

router.get("/health", async (req, res) => {
  let databaseOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    databaseOk = false;
    req.log.error({ err }, "Matrix health check: database unreachable");
  }
  const status = databaseOk ? "ok" : "degraded";
  res.status(databaseOk ? 200 : 503).json({
    status,
    version: APPLICATION_VERSION,
    checks: { database: databaseOk ? "ok" : "error" },
  });
});

router.get("/manifest", (_req, res) => {
  const { productionUrl, previewUrl } = baseUrls();
  res.json({
    name: APP_NAME,
    slug: APP_SLUG,
    version: APPLICATION_VERSION,
    sdkVersion: MATRIX_SDK_VERSION,
    owner: APP_OWNER,
    productionUrl,
    previewUrl,
    healthEndpoint: "/matrix/health",
    versionEndpoint: "/matrix/app-info",
  });
});

export default router;
