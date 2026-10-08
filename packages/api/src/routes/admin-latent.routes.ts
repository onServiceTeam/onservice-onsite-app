/**
 * Phase 28a — wire previously-latent admin services to real HTTP routes.
 *
 * Three services were declared in earlier phases (24a forensic) but had
 * no HTTP exposure. The verbs they emit were also missing from the
 * admin_actions CHECK constraint until migration 120 added them. With
 * the verbs allowed AND these routes wired, admins can finally:
 *
 *   - Review real provider applications using the Provider 360 authority
 *   - Decide pending service-area-change requests (approve / reject)
 *   - Contain admin TOTP backup-code regeneration pending governed recovery
 *
 * Mounted at `/api/v1/admin` via server.ts. Admin CSRF middleware applies
 * at the mount level for cookie-auth (Bearer auth bypasses per
 * CRIT-PHASE17-02). Mutating decisions and 2FA rotation require
 * super_admin. The service-area request queue is readable by admin,
 * super_admin staff so support can investigate before escalation. The DPO is
 * privacy-only and cannot inspect marketplace service-area operations.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as providerApplicationReview from '../services/provider-application-review.service';
import * as areaChange from '../services/service-area-change.service';
import { maskEmail, maskPhilippinePhone } from '../utils/pii-mask';

const router = Router();

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

// BUG-PHASE181-01 fix — pre-fix the decide-application + decide-area-
// change routes accepted unbounded reason strings. The verbs flow into
// admin_actions audit rows + provider/customer notifications. A 100k-
// char abuse string would bloat audit storage. Same server-cap shape
// as Phase 152-168 + Phase 179 + Phase 180.
const DECIDE_REASON_MAX = 5000;
const PII_REVEAL_REASON_MAX = 500;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateDecideReason(value: string): void {
  if (value.length > DECIDE_REASON_MAX) {
    throw createAppError(
      `reason cannot exceed ${DECIDE_REASON_MAX} characters.`,
      400,
    );
  }
}

function parseQueueLimit(value: unknown): number {
  const requested = typeof value === 'string' ? Number(value) : 50;
  return Number.isFinite(requested)
    ? Math.max(1, Math.min(Math.floor(requested), 200))
    : 50;
}

// ─── Provider applications ─────────────────────────────────────────────────

router.get(
  '/provider-applications',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const limit = parseQueueLimit(req.query.limit);
      const data = await providerApplicationReview.listPendingReview(limit);
      res.json({ success: true, data, schemaVersion: 2, source: 'provider_applications' });
    } catch (error) { next(error); }
  },
);

router.post(
  '/provider-applications/:userId/decide',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const userId = req.params.userId;
      if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
        throw createAppError('userId must be a valid UUID.', 400);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      validateDecideReason(reason);
      if (decision !== 'approved' && decision !== 'rejected' && decision !== 'sent_back') {
        throw createAppError('decision must be approved | rejected | sent_back.', 400);
      }
      const data = await providerApplicationReview.decideApplication({
        expectedRevisionId: body.expectedRevisionId,
        userId,
        adminUserId: req.user!.userId,
        decision,
        reason,
        checklistConfirmed: body.checklistConfirmed,
        checklistSummary: body.checklistSummary,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Service-area change requests ──────────────────────────────────────────

router.get(
  '/service-area-changes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const limit = parseQueueLimit(req.query.limit);
      const providerId = typeof req.query.providerId === 'string' && req.query.providerId.trim()
        ? req.query.providerId.trim()
        : undefined;
      if (providerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) {
        throw createAppError('providerId must be a valid UUID.', 400);
      }
      const data = await areaChange.listPending(limit, providerId);
      const revealContact = req.user!.role === 'super_admin';
      res.json({
        success: true,
        data: data.map((request) => ({
          ...request,
          providerEmail: revealContact || !request.providerEmail ? request.providerEmail : maskEmail(request.providerEmail),
          providerPhone: revealContact || !request.providerPhone ? request.providerPhone : maskPhilippinePhone(request.providerPhone),
          contactMasked: !revealContact,
        })),
      });
    } catch (error) { next(error); }
  },
);

router.get(
  '/service-area-changes/:changeId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const changeId = req.params.changeId;
      if (
        typeof changeId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(changeId)
      ) {
        throw createAppError('changeId must be a valid UUID.', 400);
      }
      const request = await areaChange.getById(changeId);
      const revealContact = req.user!.role === 'super_admin';
      res.json({
        success: true,
        data: {
          ...request,
          providerEmail: revealContact || !request.providerEmail ? request.providerEmail : maskEmail(request.providerEmail),
          providerPhone: revealContact || !request.providerPhone ? request.providerPhone : maskPhilippinePhone(request.providerPhone),
          contactMasked: !revealContact,
        },
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/service-area-changes/:changeId/decide',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const changeId = req.params.changeId;
      if (typeof changeId !== 'string' || !changeId) {
        throw createAppError('changeId required.', 400);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      validateDecideReason(reason);
      if (decision !== 'approved' && decision !== 'rejected') {
        throw createAppError('decision must be approved | rejected.', 400);
      }
      const data = await areaChange.decide({
        changeId,
        adminUserId: req.user!.userId,
        decision,
        reason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Legacy raw audit reveal (held pending governed evidence access) ──────
// E72: a role and free-text reason cannot authorize releasing an arbitrary
// historical payload. Keep the URL and validation for older clients, but
// never fetch raw values until case scope, allowed fields and step-up are
// enforced by the replacement investigation workflow.

router.post(
  '/audit-log/:auditLogId/reveal-pii',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const auditLogId = req.params.auditLogId;
      if (typeof auditLogId !== 'string' || !UUID_REGEX.test(auditLogId)) {
        throw createAppError('auditLogId must be a valid UUID.', 400);
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
      const normalizedReason = reason.trim();
      if (normalizedReason.length < 20) {
        throw createAppError('Reveal reason must be at least 20 characters.', 400);
      }
      if (normalizedReason.length > PII_REVEAL_REASON_MAX) {
        throw createAppError(
          `Reveal reason cannot exceed ${PII_REVEAL_REASON_MAX} characters.`,
          400,
        );
      }

      const held = createAppError(
        'Raw audit evidence is unavailable until case-scoped investigation access is enabled. The masked audit log remains available.',
        409,
      );
      held.code = 'governed_audit_evidence_required';
      throw held;
    } catch (error) { next(error); }
  },
);

// ─── Admin TOTP backup-code regeneration (launch-held) ─────────────────────

router.post(
  '/2fa/backup-codes/regenerate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // The `/api/v1/admin` mount only carries CSRF protection, not role
      // enforcement, so each route must gate itself. Without this an
      // authenticated customer/provider could write rows into the
      // privileged admin_backup_codes / admin_actions tables via the
      // self-regen path. Require the admin tier before the self/cross branch.
      if (
        req.user!.role !== 'admin' &&
        req.user!.role !== 'super_admin' &&
        req.user!.role !== 'dpo'
      ) {
        throw createAppError('Admin access required.', 403);
      }

      // SEC-044 — neither a bearer session nor a super-admin target parameter
      // is a governed recovery case. Preserve the route as an explicit hold so
      // older callers fail safely without rotating or disclosing any code set.
      const held = createAppError(
        'Administrator recovery changes are unavailable until the governed recovery workflow is enabled.',
        409,
      );
      held.code = 'privileged_recovery_policy_required';
      throw held;
    } catch (error) { next(error); }
  },
);

export default router;
