import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../matrix/auth";

// Preserve the v1.6.12 Platform role contract and existing legacy admin aliases.
export function isPlatformAdministrator(req: AuthenticatedRequest): boolean {
  return req.matrixIdentity?.roles?.some(role =>
    ["platform_administrator", "admin", "superadmin", "super_admin", "super admin"].includes(role.toLowerCase()),
  ) ?? false;
}

export const requirePlatformAdministrator: RequestHandler = (req, res, next) => {
  if (!isPlatformAdministrator(req as AuthenticatedRequest)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};