/**
 * Phase 08 — BIR admin routes (VAT, 2307, reconciliation, overview).
 * Mounted at `/api/v1/admin/bir/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Generate / finalize / regenerate / run / acknowledge writes are super_admin only.
 *
 * Audit: coverage is action-specific. The global middleware is not mounted;
 *        E37 tracks the gap. Service-written `admin_actions` remain canonical.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as vatReportService from '../services/vat-report.service';
import * as bir2307Service from '../services/bir-2307.service';
import * as reconciliationService from '../services/reconciliation.service';
import * as financialAdminService from '../services/financial-admin.service';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

function parseIntParam(raw: string | string[] | undefined, name: string): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isInteger(n)) throw createAppError(`Invalid ${name}.`, 400);
  return n;
}

function parseQuarter(raw: string | string[] | undefined): 1 | 2 | 3 | 4 {
  const n = parseIntParam(raw, 'quarter');
  if (n < 1 || n > 4) throw createAppError('Invalid quarter.', 400);
  return n as 1 | 2 | 3 | 4;
}

function parseMonth(raw: string | string[] | undefined): number {
  const n = parseIntParam(raw, 'month');
  if (n < 1 || n > 12) throw createAppError('Invalid month.', 400);
  return n;
}

function parseOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw createAppError(`Invalid ${name}.`, 400);
  return n;
}

function requireUuid(value: string | string[] | undefined, name: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !UUID_REGEX.test(candidate)) {
    throw createAppError(`${name} must be a valid UUID.`, 400);
  }
  return candidate;
}

// ─── VAT monthly reports ────────────────────────────────────────────────────

router.get(
  '/vat/reports',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseOptionalNumber(req.query.year, 'year');
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const offset = parseOptionalNumber(req.query.offset, 'offset');
      const data = await vatReportService.listVatReports(year, limit, offset);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/vat/reports/:year/:month',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const month = parseMonth(req.params.month);
      const data = await vatReportService.getVatReport(year, month);
      if (!data) throw createAppError('VAT report not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/vat/reports/:year/:month/generate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const month = parseMonth(req.params.month);
      const data = await vatReportService.generateMonthlyVatReport(
        year,
        month,
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/vat/reports/:year/:month/finalize',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const month = parseMonth(req.params.month);
      const data = await vatReportService.finalizeVatReport(
        year,
        month,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/vat/annual/:year',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const data = await vatReportService.getAnnualVatSummary(year);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── BIR 2307 quarterly batches ─────────────────────────────────────────────

router.get(
  '/2307/quarter/:year/:quarter',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const quarter = parseQuarter(req.params.quarter);
      const limit = parseOptionalNumber(req.query.limit, 'limit') ?? 50;
      const offset = parseOptionalNumber(req.query.offset, 'offset') ?? 0;
      const data = await bir2307Service.listBatchesForQuarter(
        year,
        quarter,
        limit,
        offset,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/2307/provider/:providerId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseOptionalNumber(req.query.year, 'year');
      const data = await bir2307Service.listBatchesForProvider(
        req.params.providerId as string,
        year,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/2307/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await bir2307Service.getBatchById(requireUuid(req.params.id, '2307 batch ID'));
      if (!data) throw createAppError('BIR 2307 batch not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/2307/quarter/:year/:quarter/generate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const year = parseIntParam(req.params.year, 'year');
      const quarter = parseQuarter(req.params.quarter);
      const data = await bir2307Service.generateQuarterly2307Batches(year, quarter);
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/2307/provider/:providerId/regenerate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as { year?: number; quarter?: number };
      if (body.year === undefined || body.year === null) {
        throw createAppError('year required', 400);
      }
      if (body.quarter === undefined || body.quarter === null) {
        throw createAppError('quarter required', 400);
      }
      const year = Number(body.year);
      if (!Number.isInteger(year)) throw createAppError('Invalid year.', 400);
      const quarterNum = Number(body.quarter);
      if (!Number.isInteger(quarterNum) || quarterNum < 1 || quarterNum > 4) {
        throw createAppError('Invalid quarter.', 400);
      }
      const quarter = quarterNum as 1 | 2 | 3 | 4;
      const data = await bir2307Service.regenerate2307ForProvider(
        req.params.providerId as string,
        year,
        quarter,
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Reconciliation snapshots ───────────────────────────────────────────────

router.get(
  '/reconciliation/recent',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const data = await reconciliationService.listRecentSnapshots(limit);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/reconciliation/alerts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await reconciliationService.listAlertedSnapshots();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/reconciliation/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await reconciliationService.getSnapshotById(requireUuid(req.params.id, 'Reconciliation ID'));
      if (!data) throw createAppError('Reconciliation snapshot not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/reconciliation/run',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as {
        snapshotDate?: string;
        paymongoBalance?: number;
        notes?: string;
      };
      if (!Number.isSafeInteger(body.paymongoBalance) || (body.paymongoBalance as number) < 0) {
        throw createAppError('paymongoBalance is required and must be a non-negative integer in centavos.', 400);
      }
      if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.trim().length > 1000)) {
        throw createAppError('notes must be at most 1000 characters.', 400);
      }
      const data = await reconciliationService.runDailyReconciliation({
        snapshotDate: body.snapshotDate,
        paymongoBalance: body.paymongoBalance,
        notes: body.notes?.trim() || undefined,
        adminUserId: req.user!.userId,
      });
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/reconciliation/:id/acknowledge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const { note } = (req.body ?? {}) as { note?: string };
      if (!note || typeof note !== 'string' || note.trim().length < 5 || note.trim().length > 1000) {
        throw createAppError('note must be 5 to 1000 characters.', 400);
      }
      const data = await reconciliationService.acknowledgeDiscrepancy(
        requireUuid(req.params.id, 'Reconciliation ID'),
        note.trim(),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── BIR overview ───────────────────────────────────────────────────────────

router.get(
  '/overview',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const year = parseOptionalNumber(req.query.year, 'year');
      const data = await financialAdminService.getBirReportsOverview(year);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
