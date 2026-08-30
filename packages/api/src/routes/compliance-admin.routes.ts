/**
 * Phase 11 — Compliance admin routes.
 * Mounted at `/api/v1/admin/compliance`. All endpoints require admin role.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireDpoRole } from '../middleware/require-dpo.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as compliance from '../services/compliance.service';
import * as complianceAdmin from '../services/compliance-admin.service';
import { parseAuditTimelineExportQuery } from '../validators/admin-audit-log.validators';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super-admin access required.', 403);
  }
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// BUG-PHASE180-01 fix — pre-fix the DSR action routes (request-info,
// reject, escalate, npcReference) read req.body.* strings without any
// length cap; the service then did `.slice(0, 500)` for excerpts and
// stored the full string in admin_notes / JSON details. A 100k-char
// abuse string would be silently truncated to 500 in the user-facing
// notification while bloating admin_notes / payload JSON.
// Now: explicit DSR_TEXT_MAX cap at the route boundary. Same shape as
// Phase 152-168 server-cap sweep + Phase 179 (decline reason).
const DSR_TEXT_MAX = 5000;
function validateDsrText(value: string, fieldLabel: string): void {
  if (value.length > DSR_TEXT_MAX) {
    throw createAppError(
      `${fieldLabel} cannot exceed ${DSR_TEXT_MAX} characters.`,
      400,
    );
  }
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

// Phase 14 Dispatch 08 — Bug 402: searchConsent must be DPO-only.
// Pre-D08 every admin role could query consent records (NPC violation).
// Post-D08: requireDpoRole enforces super_admin or dpo. The query itself
// is audit-logged so DPO searches are themselves traceable.
router.get(
  '/consent',
  authMiddleware,
  requireDpoRole,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await compliance.searchConsent({
        userId: parseString(req.query.userId),
        consentType: parseString(req.query.consentType),
        version: parseString(req.query.version),
        limit: parseInt32(req.query.limit),
        offset: parseInt32(req.query.offset),
      });

      // Self-audit the consent search (Bug 402 doctrine — sensitive
      // searches are themselves audit-logged).
      const { db } = await import('../models/db');
      // BUG-PHASE24-12 fix: admin_actions.target_id is NOT NULL.
      // When the DPO searches without a specific userId filter (broad
      // discovery search), there is no concrete subject — fall back to
      // the admin's own user id as a self-targeted audit row. The actual
      // search filter is preserved in details.filters.userId.
      await db.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'consent_search', 'user', $2, $3::jsonb, $4, $5)`,
        [
          req.user!.userId,
          parseString(req.query.userId) ?? req.user!.userId,
          JSON.stringify({
            filters: {
              userId: parseString(req.query.userId) ?? null,
              consentType: parseString(req.query.consentType) ?? null,
              version: parseString(req.query.version) ?? null,
            },
            resultCount: Array.isArray((data as { rows?: unknown[] }).rows)
              ? (data as { rows: unknown[] }).rows.length
              : null,
          }),
          `DPO consent search: userId=${parseString(req.query.userId) ?? 'all'}`,
          `DPO consent search: filter=${JSON.stringify(req.query)}`,
        ],
      );

      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/consent/users/:userId',
  authMiddleware,
  // NPC RA 10173 §21 segregation — consent records are DPO-scoped. This must
  // match the /consent search (also requireDpoRole); leaving it at requireAdmin
  // let a non-DPO admin read the same consent data the search gates.
  requireDpoRole,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
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
      // Segregation of duties (NPC RA 10173): terminal DSR decisions
      // (completed / rejected) are super_admin-only, matching the dedicated
      // /dsr/:id/{complete,reject,escalate} endpoints. Pre-fix a base admin
      // blocked from those endpoints could reach the same terminal state
      // through this generic PATCH — closing that bypass.
      if (newStatus === 'completed' || newStatus === 'rejected') {
        requireSuperAdmin(req);
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
      const filters = parseAuditTimelineExportQuery(req.query as Record<string, unknown>);
      const csv = await compliance.exportAuditLogCsv({
        ...filters,
        viewerRole: req.user!.role,
      });

      // Phase 14 Dispatch 08 — Bug 401. Audit-log CSV exports are
      // themselves audit-logged. Without this, an admin can extract
      // the full audit trail with no record of the extraction.
      const { db } = await import('../models/db');
      // The header has no trailing newline. Each newline therefore equals one
      // exported data row; subtracting one under-counted every non-empty CSV.
      const rowCount = (csv.match(/\r?\n/g) ?? []).length;
      // BUG-PHASE24-13 fix: admin_actions.target_id is NOT NULL. The
      // export is system-wide (no concrete entity), so use the admin's
      // own id as a self-targeted audit row. target_type was 'system'
      // before; widen to 'user' to match target_id semantics.
      await db.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'audit_log_exported', 'user', $1, $2::jsonb, $3, $4)`,
        [
          req.user!.userId,
          JSON.stringify({
            filter: filters,
            row_count: Math.max(0, rowCount),
            ip_address: req.ip,
            user_agent: req.headers['user-agent'] ?? null,
          }),
          `CSV export: ${Math.max(0, rowCount)} rows`,
          `Filter: ${JSON.stringify(filters)}. Exported ${Math.max(0, rowCount)} rows.`,
        ],
      );

      // BUG-PHASE114-01 fix — pre-fix the CSV filename used the UTC
      // date. Compliance officers running the export at 00:30 Manila
      // Thursday got a file named with the Wednesday UTC date, so a
      // Downloads-folder search by Thursday's date came up empty.
      // Same Manila-tz pattern as Phase 112 (admin CompliancePage
      // browser-side download) — the server-driven Content-Disposition
      // header needs the same fix so the Manila admin and the
      // browser-fallback path stay consistent.
      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
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

// ─── Phase 13 Dispatch C: dedicated DPO action endpoints ────────────────────

router.post(
  '/dsr/:id/complete',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // DSR decisions are super_admin-gated, matching the sibling /reject +
      // /escalate (a junior admin shouldn't close a data-subject request when
      // they can't reject one). NPC RA 10173 segregation of duties.
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data = await complianceAdmin.markDsrComplete({
        dsrId: req.params.id as string,
        adminUserId: req.user!.userId,
        responsePayloadUrl: typeof body.responsePayloadUrl === 'string'
          ? body.responsePayloadUrl : undefined,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/dsr/:id/request-info',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Super_admin-gated to match the other DSR decision endpoints.
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const infoNeeded = typeof body.infoNeeded === 'string' ? body.infoNeeded : '';
      validateDsrText(infoNeeded, 'infoNeeded');
      const data = await complianceAdmin.requestDsrMoreInfo({
        dsrId: req.params.id as string,
        adminUserId: req.user!.userId,
        infoNeeded,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/dsr/:id/reject',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      validateDsrText(reason, 'reason');
      const data = await complianceAdmin.rejectDsr({
        dsrId: req.params.id as string,
        adminUserId: req.user!.userId,
        reason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/dsr/:id/escalate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const npcReference = typeof body.npcReference === 'string' ? body.npcReference : '';
      // npcReference is just an external case ID — keep it short.
      if (npcReference.length > 200) {
        throw createAppError(
          'npcReference cannot exceed 200 characters.',
          400,
        );
      }
      const data = await complianceAdmin.escalateDsrToNpc({
        dsrId: req.params.id as string,
        adminUserId: req.user!.userId,
        npcReference,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/consent-versions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const [summaries, published] = await Promise.all([
        complianceAdmin.listConsentVersions(),
        complianceAdmin.listPublishedConsentVersions({
          consentType: parseString(req.query.consentType),
        }),
      ]);
      res.json({ success: true, data: { summaries, published } });
    } catch (error) { next(error); }
  },
);

router.post(
  '/consent-versions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data = await complianceAdmin.publishConsentVersion({
        adminUserId: req.user!.userId,
        consentType: typeof body.consentType === 'string' ? body.consentType : '',
        version: typeof body.version === 'string' ? body.version : '',
        effectiveAt: typeof body.effectiveAt === 'string' ? body.effectiveAt : undefined,
        changeSummary: typeof body.changeSummary === 'string' ? body.changeSummary : '',
        // LAUNCH-LIMITATIONS #5 — admin-supplied flag. Defaults to false.
        material: body.material === true,
      });
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
