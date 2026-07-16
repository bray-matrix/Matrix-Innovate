import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

// Matrix Platform Launch Guard (Matrix SDK v1.1 Trust Model).
// Launch tokens are verified against the platform JWKS (RS256, issuer,
// audience, expiration). A successful exchange mints a short-lived local
// session cookie (HS256, signed with SESSION_SECRET). Raw launch tokens are
// never logged or persisted server-side.

export interface MatrixIdentity {
  sub: string;
  name: string | null;
  email: string | null;
}

export interface MatrixAuthConfig {
  issuer: string;
  jwksUrl: string;
  audience: string;
  platformUrl: string;
  sessionTtlSeconds: number;
}

export function getMatrixAuthConfig(): MatrixAuthConfig {
  const platformUrl =
    process.env["MATRIX_PLATFORM_URL"] ?? "https://matrix-platform.replit.app";
  return {
    platformUrl,
    issuer: process.env["MATRIX_ISSUER"] ?? platformUrl,
    jwksUrl: process.env["MATRIX_JWKS_URL"] ?? `${platformUrl}/api/platform/jwks`,
    audience: process.env["MATRIX_AUDIENCE"] ?? "matrix-innovation-hub",
    sessionTtlSeconds: parseSessionTtl(process.env["MATRIX_SESSION_TTL_SECONDS"]),
  };
}

function parseSessionTtl(raw: string | undefined): number {
  const DEFAULT_TTL = 28800;
  if (raw === undefined || raw === "") return DEFAULT_TTL;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "MATRIX_SESSION_TTL_SECONDS must be a positive integer number of seconds",
    );
  }
  return value;
}

function getSessionSecret(): Uint8Array {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrlUsed: string | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const { jwksUrl } = getMatrixAuthConfig();
  if (!jwks || jwksUrlUsed !== jwksUrl) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksUrlUsed = jwksUrl;
  }
  return jwks;
}

export class LaunchTokenError extends Error {
  constructor(reason: string) {
    super(`Launch token rejected: ${reason}`);
    this.name = "LaunchTokenError";
  }
}

const APP_ID_CLAIMS = ["app_id", "application_id", "appId", "client_id"] as const;

export async function verifyLaunchToken(token: string): Promise<MatrixIdentity> {
  const { issuer, audience } = getMatrixAuthConfig();

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getJwks(), {
      algorithms: ["RS256"],
      issuer,
      audience,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    throw new LaunchTokenError(err instanceof Error ? err.message : "verification failed");
  }

  const sub = typeof payload["sub"] === "string" ? payload["sub"].trim() : "";
  if (!sub) {
    throw new LaunchTokenError("missing required identity claim (sub)");
  }

  for (const claim of APP_ID_CLAIMS) {
    const value = payload[claim];
    if (typeof value === "string" && value !== "" && value !== audience) {
      throw new LaunchTokenError(`application-id claim "${claim}" contradicts audience`);
    }
  }

  return {
    sub,
    name: typeof payload["name"] === "string" ? payload["name"] : null,
    email: typeof payload["email"] === "string" ? payload["email"] : null,
  };
}

// ---------------------------------------------------------------------------
// Local application session (HttpOnly cookie holding a short-lived HS256 JWT)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "matrix_session";

export async function mintSessionToken(identity: MatrixIdentity): Promise<string> {
  const { sessionTtlSeconds, audience } = getMatrixAuthConfig();
  return new SignJWT({ name: identity.name, email: identity.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.sub)
    .setIssuer("matrix-innovation-hub-session")
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + sessionTtlSeconds)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<MatrixIdentity | null> {
  const { audience } = getMatrixAuthConfig();
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
      issuer: "matrix-innovation-hub-session",
      audience,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      sub: payload.sub,
      name: typeof payload["name"] === "string" ? payload["name"] : null,
      email: typeof payload["email"] === "string" ? payload["email"] : null,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
  path: string;
} {
  const { sessionTtlSeconds } = getMatrixAuthConfig();
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: sessionTtlSeconds * 1000,
    path: "/",
  };
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export interface AuthenticatedRequest extends Request {
  matrixIdentity?: MatrixIdentity;
}

export async function requireMatrixSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readSessionCookie(req);
  const identity = token ? await verifySessionToken(token) : null;
  if (!identity) {
    res.status(401).json({ error: "Matrix Platform session required" });
    return;
  }
  (req as AuthenticatedRequest).matrixIdentity = identity;
  next();
}
