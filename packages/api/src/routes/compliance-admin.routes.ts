/**
 * Phase 11 — Compliance admin routes.
 * Mounted at `/api/v1/admin/compliance`. All endpoints require admin role.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as compliance from '../services/compliance.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseInt32(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseBool(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

// ─── Consent ────────────────────────────────────────────────────────────────

router.get(
  '/consent',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await compliance.searchConsent({
        userId: parseString(req.query.userId),
        consentType: parseString(req.query.consentType),
        version: parseString(req.query.version),
        limit: parseInt32(req.query.limit),
        offset: parseInt32(req.query.offset),
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/consent/users/:userId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await compliance.listConsentForUser(req.params.userId as string);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── DSR ────────────────────────────────────────────────────────────────────

router.get(
  '/dsr',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const status = parseString(req.query.status) as compliance.DsrStatus | undefined;
      const data = await compliance.listDsrs({
        status,
        overdueOnly: parseBool(req.query.overdueOnly),
        limit: parseInt32(req.query.limit),
        offset: parseInt32(req.query.offset),
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/dsr/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await compliance.getDsr(req.params.id as string);
      if (!data) throw createAppError('Data subject request not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.patch(
  '/dsr/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const newStatus = body.newStatus;
      if (typeof newStatus !== 'string') {
        throw createAppError('newStatus is required.', 400);
      }
      const data = await compliance.updateDsrStatus({
        id: req.params.id as string,
        adminId: req.user!.userId,
        newStatus: newStatus as compliance.DsrStatus,
        adminNotes: typeof body.adminNotes === 'string' ? body.adminNotes : undefined,
        rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
        responsePayloadUrl: typeof body.responsePayloadUrl === 'string' ? body.responsePayloadUrl : undefined,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Audit log CSV export ──────────────────────────────────────────────────

router.get(
  '/audit-log/export.csv',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const csv = await compliance.exportAuditLogCsv({
        userId: parseString(req.query.userId),
        action: parseString(req.query.action),
        entityType: parseString(req.query.entityType),
        from: parseString(req.query.from),
        to: parseString(req.query.to),
        limit: parseInt32(req.query.limit),
      });
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${dateStr}.csv"`);
      res.send(csv);
    } catch (error) { next(error); }
  },
);

// ─── BIR calendar + DSR alerts ─────────────────────────────────────────────

router.get(
  '/bir-calendar',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const yearRaw = parseInt32(req.query.year);
      const year = yearRaw ?? new Date().getFullYear();
      const data = compliance.getBirCalendar(year);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/dsr-alerts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await compliance.getDsrAlerts();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
