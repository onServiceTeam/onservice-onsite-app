/**
 * Phase 14 Dispatch 08 — Bug 402.
 * DPO-only middleware. Endpoints that expose consent records, breach
 * logs, or other DPO-scope data must require the user be either
 * super_admin or DPO. Pre-D08 these endpoints were gated only by
 * requireAdmin — any admin (support, dispatcher, finance) could query.
 *
 * NPC RA 10173 §21 — least-privilege exposure of consent + DPO records.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.middleware';
import { createAppError } from './error.middleware';

const DPO_ROLES = new Set<string>(['super_admin', 'dpo']);

export function requireDpoRole(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(createAppError('Authentication required.', 401));
    return;
  }
  if (!DPO_ROLES.has(req.user.role)) {
    next(createAppError('This endpoint requires DPO or super_admin role.', 403));
    return;
  }
  next();
}

const SUPER_ADMIN_ONLY = new Set<string>(['super_admin']);

export function requireSuperAdminRole(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(createAppError('Authentication required.', 401));
    return;
  }
  if (!SUPER_ADMIN_ONLY.has(req.user.role)) {
    next(createAppError('This endpoint requires super_admin role.', 403));
    return;
  }
  next();
}
