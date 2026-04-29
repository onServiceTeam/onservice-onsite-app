// packages/api/src/routes/cancellation-policy-admin.routes.ts
//
// Bug 1170 / 1198 + Bug 1170-admin-ui fix verified.
// Phase 14 Dispatch 02 — admin editor backend.
//
// Mounted at /api/v1/admin/cancellation-policies. All routes require:
//   - authMiddleware  (admin_session cookie or Bearer)
//   - rbacMiddleware('super_admin')
//   - The /api/v1/admin/* CSRF guard already applies via server.ts.
//
// Endpoints:
//   GET    /                — list all versions (metadata only)
//   GET    /:version        — fetch one version, full payload
//   POST   /                — create a new version (Zod-validated)
//   PUT    /:version        — in-place edit, only allowed within 1 hour of
//                             created_at AND only on the active version

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import {
  createCancellationPolicySchema,
  updateCancellationPolicySchema,
} from '../validators/cancellation-policy.validators';
import {
  bustActivePolicyCache,
  CancellationPolicyTier,
} from '../services/pricing/cancellation.service';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware('super_admin'));

interface PolicyListRow {
  id: string;
  version: number;
  effective_from: Date;
  effective_to: Date | null;
  created_by: string | null;
  created_at: Date;
  intro_text: string;
  tiers: CancellationPolicyTier[];
  provider_no_show_credit_php: number;
  creator_first_name: string | null;
  creator_last_name: string | null;
}

router.get('/', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.query<PolicyListRow>(
      `SELECT cp.id, cp.version, cp.effective_from, cp.effective_to,
              cp.created_by, cp.created_at, cp.intro_text, cp.tiers,
              cp.provider_no_show_credit_php,
              u.first_name AS creator_first_name,
              u.last_name  AS creator_last_name
         FROM cancellation_policies cp
    LEFT JOIN users u ON u.id = cp.created_by
     ORDER BY cp.version DESC`,
    );

    res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        version: r.version,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        is_active: r.effective_to === null,
        created_at: r.created_at,
        created_by: r.created_by,
        creator_name: [r.creator_first_name, r.creator_last_name].filter(Boolean).join(' ') || null,
        tier_count: r.tiers.length,
        provider_no_show_credit_php: r.provider_no_show_credit_php,
        intro_text_preview: r.intro_text.slice(0, 80),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:version', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version <= 0) {
      throw createAppError('Invalid version.', 400);
    }
    const result = await db.query<PolicyListRow>(
      `SELECT cp.id, cp.version, cp.effective_from, cp.effective_to,
              cp.created_by, cp.created_at, cp.tiers, cp.intro_text,
              cp.provider_no_show_credit_php,
              u.first_name AS creator_first_name,
              u.last_name  AS creator_last_name
         FROM cancellation_policies cp
    LEFT JOIN users u ON u.id = cp.created_by
        WHERE cp.version = $1`,
      [version],
    );
    if (result.rows.length === 0) {
      throw createAppError('Policy version not found.', 404);
    }
    const r = result.rows[0]!;
    res.json({
      success: true,
      data: {
        id: r.id,
        version: r.version,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        is_active: r.effective_to === null,
        tiers: r.tiers,
        intro_text: r.intro_text,
        provider_no_show_credit_php: r.provider_no_show_credit_php,
        created_at: r.created_at,
        created_by: r.created_by,
        creator_name: [r.creator_first_name, r.creator_last_name].filter(Boolean).join(' ') || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  validationMiddleware(createCancellationPolicySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        tiers: CancellationPolicyTier[];
        intro_text: string;
        legal_disclaimer: string;
        provider_no_show_credit_php: number;
      };
      const adminUserId = req.user!.userId;

      const inserted = await db.transaction(async (tx) => {
        // Close out the active version.
        await tx.query(
          `UPDATE cancellation_policies
              SET effective_to = NOW()
            WHERE effective_to IS NULL`,
        );

        const versionResult = await tx.query<{ next_version: number }>(
          `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM cancellation_policies`,
        );
        const nextVersion = versionResult.rows[0]!.next_version;

        const insertResult = await tx.query<{ id: string; version: number; created_at: Date }>(
          `INSERT INTO cancellation_policies
             (version, effective_from, tiers, intro_text, legal_disclaimer,
              provider_no_show_credit_php, created_by)
           VALUES ($1, NOW(), $2::jsonb, $3, $4, $5, $6)
           RETURNING id, version, created_at`,
          [
            nextVersion,
            JSON.stringify(body.tiers),
            body.intro_text,
            body.legal_disclaimer,
            body.provider_no_show_credit_php,
            adminUserId,
          ],
        );
        return insertResult.rows[0]!;
      });

      await bustActivePolicyCache();
      logger.info('cancellation_policy_version_created', {
        version: inserted.version,
        adminUserId,
      });

      res.status(201).json({
        success: true,
        data: {
          id: inserted.id,
          version: inserted.version,
          created_at: inserted.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:version',
  validationMiddleware(updateCancellationPolicySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const version = Number(req.params.version);
      if (!Number.isInteger(version) || version <= 0) {
        throw createAppError('Invalid version.', 400);
      }
      const body = req.body as {
        tiers: CancellationPolicyTier[];
        intro_text: string;
        legal_disclaimer: string;
        provider_no_show_credit_php: number;
      };

      const existing = await db.query<{
        id: string;
        version: number;
        created_at: Date;
        effective_to: Date | null;
      }>(
        `SELECT id, version, created_at, effective_to
           FROM cancellation_policies
          WHERE version = $1`,
        [version],
      );
      if (existing.rows.length === 0) {
        throw createAppError('Policy version not found.', 404);
      }
      const row = existing.rows[0]!;
      if (row.effective_to !== null) {
        throw createAppError(
          'Only the active version may be edited in place. Save as a new version instead.',
          409,
        );
      }
      const ageMs = Date.now() - row.created_at.getTime();
      if (ageMs > 60 * 60 * 1000) {
        throw createAppError(
          'In-place edits are only allowed within 1 hour of creation. Save as a new version instead.',
          409,
        );
      }

      await db.query(
        `UPDATE cancellation_policies
            SET tiers = $1::jsonb,
                intro_text = $2,
                legal_disclaimer = $3,
                provider_no_show_credit_php = $4
          WHERE version = $5`,
        [
          JSON.stringify(body.tiers),
          body.intro_text,
          body.legal_disclaimer,
          body.provider_no_show_credit_php,
          version,
        ],
      );

      await bustActivePolicyCache();
      logger.info('cancellation_policy_version_edited_in_place', {
        version,
        adminUserId: req.user!.userId,
      });

      res.json({ success: true, data: { version } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
