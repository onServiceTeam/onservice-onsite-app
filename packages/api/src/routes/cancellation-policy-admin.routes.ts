import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import type { CancellationPolicyTier } from '../services/pricing/cancellation.service';

const router = Router();

const E09_MUTATION_HOLD_MESSAGE =
  'Cancellation policy changes are disabled under E09 because the customer-facing policy does not control live refund calculations. Review the actual cancellation settings and approve one canonical source before changing either system.';

router.use(authMiddleware);
router.use(rbacMiddleware('admin', 'super_admin'));

interface PolicyListRow {
  id: string;
  version: number;
  effective_from: Date;
  effective_to: Date | null;
  created_by: string | null;
  created_at: Date;
  intro_text: string;
  legal_disclaimer: string;
  tiers: CancellationPolicyTier[];
  provider_no_show_credit_php: number;
  creator_first_name: string | null;
  creator_last_name: string | null;
}

function parseVersion(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw createAppError('Invalid policy version.', 400);
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw createAppError('Invalid policy version.', 400);
  }
  return version;
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
      data: result.rows.map((row) => ({
        id: row.id,
        version: row.version,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        is_active: row.effective_to === null,
        created_at: row.created_at,
        created_by: row.created_by,
        creator_name: [row.creator_first_name, row.creator_last_name].filter(Boolean).join(' ') || null,
        tier_count: row.tiers.length,
        provider_no_show_credit_php: row.provider_no_show_credit_php,
        intro_text_preview: row.intro_text.slice(0, 80),
      })),
      governance: {
        status: 'held',
        escalation: 'E09',
        displayOnly: true,
        mutationsAllowed: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:version', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const version = parseVersion(req.params.version);
    const result = await db.query<PolicyListRow>(
      `SELECT cp.id, cp.version, cp.effective_from, cp.effective_to,
              cp.created_by, cp.created_at, cp.tiers, cp.intro_text,
              cp.legal_disclaimer,
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
    const row = result.rows[0]!;
    res.json({
      success: true,
      data: {
        id: row.id,
        version: row.version,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        is_active: row.effective_to === null,
        tiers: row.tiers,
        intro_text: row.intro_text,
        legal_disclaimer: row.legal_disclaimer,
        provider_no_show_credit_php: row.provider_no_show_credit_php,
        created_at: row.created_at,
        created_by: row.created_by,
        creator_name: [row.creator_first_name, row.creator_last_name].filter(Boolean).join(' ') || null,
      },
      governance: {
        status: 'held',
        escalation: 'E09',
        displayOnly: true,
        mutationsAllowed: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  rbacMiddleware('super_admin'),
  (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    next(createAppError(E09_MUTATION_HOLD_MESSAGE, 409));
  },
);

router.put(
  '/:version',
  rbacMiddleware('super_admin'),
  (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      parseVersion(req.params.version);
      next(createAppError(E09_MUTATION_HOLD_MESSAGE, 409));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
