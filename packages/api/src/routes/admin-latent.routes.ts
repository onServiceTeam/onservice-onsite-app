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
 *   - Regenerate admin TOTP backup codes
 *
 * Mounted at `/api/v1/admin` via server.ts. Admin CSRF middleware applies
 * at the mount level for cookie-auth (Bearer auth bypasses per
 * CRIT-PHASE17-02). All routes require super_admin via requireSuperAdmin.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as providerOnboarding from '../services/provider-onboarding.service';
import * as areaChange from '../services/service-area-change.service';
import * as admin2fa from '../services/admin-2fa.service';

const router = Router();

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
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

// ─── Provider applications ─────────────────────────────────────────────────

router.get(
  '/provider-applications',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
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
      requireSuperAdmin(req);
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const data = await areaChange.listPending(limit);
      res.json({ success: true, data });
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

// ─── Admin TOTP backup codes regeneration ──────────────────────────────────

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

      // Super-admins regenerate their own backup codes — and may regen
      // codes for other admins via :adminUserId. Self-regen is the
      // common case (lost the old codes); cross-regen is the recovery
      // case (e.g., admin lost both authenticator + backup codes).
      const target = req.body?.adminUserId
        ? String(req.body.adminUserId)
        : req.user!.userId;

      // Anyone other than the user themselves requires super_admin.
      if (target !== req.user!.userId) {
        requireSuperAdmin(req);
      }

      const result = await admin2fa.generateBackupCodes(target, {
        regeneratedBy: req.user!.userId,
      });

      res.status(201).json({
        success: true,
        data: {
          codes: result.codes,
          generatedAt: result.generatedAt,
          warning: 'These codes are shown ONCE. Store them securely; the previous set is invalidated.',
        },
      });
    } catch (error) { next(error); }
  },
);

export default router;
