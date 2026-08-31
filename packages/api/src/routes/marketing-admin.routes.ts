/**
 * Phase 09 — Marketing admin routes.
 * Mounted at `/api/v1/admin/marketing`.
 *
 * Auth: every endpoint requires admin or super_admin. All write endpoints
 * (POST/PATCH) require super_admin.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import {
  createMarketingCampaignSchema,
  createPromoCodeSchema,
  updateMarketingCampaignSchema,
  updatePromoCodeSchema,
} from '../validators/promo.validators';
import * as marketingAdminService from '../services/marketing-admin.service';

const router = Router();

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

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ─── Promo codes ────────────────────────────────────────────────────────────

router.get(
  '/channels',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.listAllowedMarketingChannels();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/promos',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.listPromoCodes({
        active: parseOptionalBool(req.query.active),
        limit: parseOptionalInt(req.query.limit),
        offset: parseOptionalInt(req.query.offset),
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/promos/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.getPromoCode(req.params.id as string);
      if (!data) throw createAppError('Promo code not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// Phase 14 Dispatch 05 — Bug 261.
// Replaced the manual coercion with `validationMiddleware(createPromoCodeSchema)`.
// `.strict()` on the schema rejects unknown keys — no client-supplied
// fields silently slip through. Discount value/type still type-narrowed
// by Zod and re-validated by the service-layer business-rule helpers
// (validateCode, validateDiscount, validateValidityRange in
// marketing-admin.service.ts).
router.post(
  '/promos',
  authMiddleware,
  validationMiddleware(createPromoCodeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = req.body as {
        code: string;
        description?: string;
        discountType: 'percentage' | 'fixed_centavos';
        discountValue: number;
        maxDiscountCentavos?: number | null;
        minimumOrderCentavos?: number;
        usageLimitTotal?: number | null;
        usageLimitPerCustomer?: number;
        validFrom?: string;
        validUntil?: string | null;
      };
      const data = await marketingAdminService.createPromoCode(
        {
          code: body.code,
          description: body.description,
          discountType: body.discountType,
          discountValue: body.discountValue,
          maxDiscountCentavos: body.maxDiscountCentavos ?? null,
          minimumOrderCentavos: body.minimumOrderCentavos,
          usageLimitTotal: body.usageLimitTotal ?? null,
          usageLimitPerCustomer: body.usageLimitPerCustomer,
          validFrom: body.validFrom,
          validUntil: body.validUntil ?? null,
        },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.patch(
  '/promos/:id',
  authMiddleware,
  validationMiddleware(updatePromoCodeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Parameters<typeof marketingAdminService.updatePromoCode>[1] = {};
      if (body.description !== undefined) patch.description = String(body.description);
      if (body.minimumOrderCentavos !== undefined) {
        patch.minimumOrderCentavos = Number(body.minimumOrderCentavos);
      }
      if (body.usageLimitTotal !== undefined) {
        patch.usageLimitTotal =
          body.usageLimitTotal === null ? null : Number(body.usageLimitTotal);
      }
      if (body.usageLimitPerCustomer !== undefined) {
        patch.usageLimitPerCustomer = Number(body.usageLimitPerCustomer);
      }
      if (body.validUntil !== undefined) {
        patch.validUntil = body.validUntil === null ? null : String(body.validUntil);
      }
      if (body.active !== undefined) patch.active = Boolean(body.active);

      const data = await marketingAdminService.updatePromoCode(
        req.params.id as string,
        patch,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/promos/:id/deactivate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const data = await marketingAdminService.deactivatePromoCode(
        req.params.id as string,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Campaigns ──────────────────────────────────────────────────────────────

router.get(
  '/campaigns',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.listCampaigns({
        channel: parseOptionalString(req.query.channel),
        from: parseOptionalString(req.query.from),
        to: parseOptionalString(req.query.to),
        limit: parseOptionalInt(req.query.limit),
        offset: parseOptionalInt(req.query.offset),
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/campaigns/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.getCampaign(req.params.id as string);
      if (!data) throw createAppError('Marketing campaign not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/campaigns',
  authMiddleware,
  validationMiddleware(createMarketingCampaignSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data = await marketingAdminService.createCampaign(
        {
          name: String(body.name ?? ''),
          channel: String(body.channel ?? ''),
          startedAt: String(body.startedAt ?? ''),
          endedAt:
            body.endedAt === null || body.endedAt === undefined
              ? null
              : String(body.endedAt),
          spendCentavos:
            body.spendCentavos === undefined ? undefined : Number(body.spendCentavos),
          notes:
            body.notes === null || body.notes === undefined ? null : String(body.notes),
        },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.patch(
  '/campaigns/:id',
  authMiddleware,
  validationMiddleware(updateMarketingCampaignSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Parameters<typeof marketingAdminService.updateCampaign>[1] = {};
      if (body.name !== undefined) patch.name = String(body.name);
      if (body.endedAt !== undefined) {
        patch.endedAt = body.endedAt === null ? null : String(body.endedAt);
      }
      if (body.spendCentavos !== undefined) patch.spendCentavos = Number(body.spendCentavos);
      if (body.notes !== undefined) {
        patch.notes = body.notes === null ? null : String(body.notes);
      }

      const data = await marketingAdminService.updateCampaign(
        req.params.id as string,
        patch,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Overview ───────────────────────────────────────────────────────────────

router.get(
  '/overview',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await marketingAdminService.getMarketingOverview(
        parseOptionalString(req.query.from),
        parseOptionalString(req.query.to),
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
