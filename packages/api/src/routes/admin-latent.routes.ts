/**
 * Phase 28a — wire previously-latent admin services to real HTTP routes.
 *
 * Three services were declared in earlier phases (24a forensic) but had
 * no HTTP exposure. The verbs they emit were also missing from the
 * admin_actions CHECK constraint until migration 120 added them. With
 * the verbs allowed AND these routes wired, admins can finally:
 *
 *   - Decide pending provider applications (approve / reject / sent_back)
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
import * as providerOnboarding from '../services/provider-onboarding.service';
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
      const data = await providerOnboarding.listPendingReview(limit);
      res.json({ success: true, data });
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
      if (typeof userId !== 'string' || !userId) {
        throw createAppError('userId required.', 400);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      validateDecideReason(reason);
      if (decision !== 'approved' && decision !== 'rejected' && decision !== 'sent_back') {
        throw createAppError('decision must be approved | rejected | sent_back.', 400);
      }
      const data = await providerOnboarding.adminDecide({
        userId,
        adminUserId: req.user!.userId,
        decision,
        reason,
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

// ─── PII reveal (super-admin only, audit-logged) ───────────────────────────
//
// Phase 14 D08 / Bug 81 design intent (per pii-mask.ts:11-13): super_admin
// can request a one-row reveal of raw PII (IP, user-agent, embedded phone/
// email in old/new_values) for a specific audit_log row. The reveal is
// itself audit-logged with action_type='pii_reveal' so an attacker who
// elevated to super_admin can't quietly extract PII without leaving
// forensic evidence.
//
// Wired here in Phase 30b — pii_reveal verb in admin_actions CHECK since
// migration 121 (Phase 25d) but no route ever invoked it. NPC RA 10173
// §22 compliance: every reveal is traceable to an admin_id + timestamp.

router.post(
  '/audit-log/:auditLogId/reveal-pii',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const auditLogId = req.params.auditLogId;
      if (typeof auditLogId !== 'string' || !auditLogId) {
        throw createAppError('auditLogId required.', 400);
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
      if (reason.trim().length < 20) {
        throw createAppError('Reveal reason must be at least 20 characters.', 400);
      }

      const { db } = await import('../models/db');

      // Look up the audit_log row — return raw, unmasked.
      const row = await db.query(
        `SELECT id, user_id, action, entity_type, entity_id,
                old_values, new_values,
                ip_address::text AS ip_address,
                user_agent, created_at
           FROM audit_log
          WHERE id = $1`,
        [auditLogId],
      );
      if (row.rows.length === 0) {
        throw createAppError('Audit log entry not found.', 404);
      }
      const raw = row.rows[0]!;

      // Audit the reveal itself.
      await db.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'pii_reveal', 'system', $2, $3::jsonb, $4, $5)`,
        [
          req.user!.userId,
          auditLogId,
          JSON.stringify({
            audit_log_id: auditLogId,
            audit_log_action: raw.action,
            audit_log_entity_type: raw.entity_type,
            ip: req.ip,
            user_agent: req.headers['user-agent'] ?? null,
          }),
          reason.trim().slice(0, 500),
          reason.trim(),
        ],
      );

      res.json({ success: true, data: raw });
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
