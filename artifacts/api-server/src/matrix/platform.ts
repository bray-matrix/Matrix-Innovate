import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { APPLICATION_VERSION } from "../routes/settings";

// Matrix Platform integration (Matrix SDK v1).
// Platform infrastructure is intentionally kept separate from business routes
// and outside the business OpenAPI contract (SDK doc 08 - Best Practices).

export const MATRIX_SDK_VERSION = "1.0";

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

// SDK doc 02 - Authentication: "Matrix Platform authenticates. Applications
// trust the launch token. No separate login." The token is trusted as-is and
// is never logged or persisted.
export function matrixLaunchContext(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header("authorization");
  const bearerMatch = authHeader ? /^Bearer\s+(.+)$/i.exec(authHeader) : null;
  const token = req.header("x-matrix-launch-token") ?? bearerMatch?.[1];
  const user = req.header("x-matrix-user");
  if (token) {
    (req as Request & { matrixLaunch?: { authenticated: boolean; user: string | null } }).matrixLaunch = {
      authenticated: true,
      user: user ?? null,
    };
  }
  next();
}

const router: IRouter = Router();

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
