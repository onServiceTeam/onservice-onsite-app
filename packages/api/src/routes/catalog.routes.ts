import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as catalogService from '../services/catalog.service';
import * as intakeService from '../services/intake.service';
import { intakeFieldSchema, updateIntakeFieldSchema } from '../validators/intake.validators';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { cacheDeletePattern, getRuntimeCacheTtl } from '../services/cache.service';
import {
  catalogFieldUuidParamsSchema,
  catalogLifecycleReasonSchema,
  catalogSubcategoryUuidParamsSchema,
  catalogUuidParamsSchema,
  createAddonSchema,
  createCategorySchema,
  createSubcategorySchema,
  updateAddonSchema,
  updateCategorySchema,
  updateSubcategorySchema,
} from '../validators/admin-catalog.validators';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

// MED-N161 fix — service catalog mutations (categories, subcategories,
// addons) affect platform-wide pricing structure and customer-facing
// listings. A junior admin shouldn't be able to add/rename/delete a
// service category without super_admin oversight. Same family as
// CRIT-N01 (admin.routes mutations) and CRIT-N16 (settings.routes
// mutations) — both already gated to super_admin in earlier dispatches.
function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

function formatCategory(c: { id: string; name: string; slug: string; description: string; icon_url: string | null; display_order: number }): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    iconUrl: c.icon_url,
    displayOrder: c.display_order,
  };
}

function formatSubcategory(s: {
  id: string; category_id: string; name: string; slug: string; description: string;
  pricing_type: string; base_price: number | null; min_price: number | null;
  max_price: number | null; estimated_duration_minutes: number | null; display_order: number;
  unit_label?: string | null; unit_price?: number | null; hourly_rate?: number | null;
  category_name?: string; category_slug?: string;
  is_active?: boolean;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: s.id,
    categoryId: s.category_id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    pricingType: s.pricing_type,
    basePrice: s.base_price,
    minPrice: s.min_price,
    maxPrice: s.max_price,
    estimatedDurationMinutes: s.estimated_duration_minutes,
    // D27 Phase 4 — per-unit rate (null unless pricingType is 'per_unit').
    unitLabel: s.unit_label ?? null,
    unitPrice: s.unit_price ?? null,
    // D27 Phase 4b — hourly rate (null unless pricingType is 'hourly').
    hourlyRate: s.hourly_rate ?? null,
    displayOrder: s.display_order,
    ...(typeof s.is_active === 'boolean' ? { isActive: s.is_active } : {}),
  };
  if (s.category_name) result.categoryName = s.category_name;
  if (s.category_slug) result.categorySlug = s.category_slug;
  return result;
}

router.get(
  '/',
  cacheMiddleware(() => getRuntimeCacheTtl('categories')),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await catalogService.getActiveCategories();
      res.json({
        success: true,
        data: categories.map(formatCategory),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/full',
  cacheMiddleware(() => getRuntimeCacheTtl('categories')),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const catalog = await catalogService.getFullCatalog();
      res.json({
        success: true,
        data: catalog.map((c) => ({
          ...formatCategory(c),
          subcategories: c.subcategories.map(formatSubcategory),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/full',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const catalog = await catalogService.getAdminCatalog();
      res.json({
        success: true,
        data: catalog.map((category) => ({
          ...formatCategory(category),
          subcategories: category.subcategories.map(formatSubcategory),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/search',
  cacheMiddleware(() => getRuntimeCacheTtl('searchResults')),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (query.length < 2) {
        res.status(400).json({
          success: false,
          error: { message: 'Search query must be at least 2 characters.', statusCode: 400 },
        });
        return;
      }
      // BUG-PHASE166-01 fix — pre-fix /search had no upper bound on
      // query length. The endpoint is PUBLIC (no auth) and runs an
      // ILIKE on three columns + a provider join. A 100,000-char
      // query wastes server cycles and bandwidth. Cap at 100 (real
      // human searches are short; long queries are likely abuse).
      // Same defense-in-depth pattern as Phase 152-165.
      if (query.length > 100) {
        res.status(400).json({
          success: false,
          error: { message: 'Search query must be ≤ 100 characters.', statusCode: 400 },
        });
        return;
      }

      if (req.query.limit !== undefined && typeof req.query.limit !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'Search limit is invalid.', statusCode: 400 },
        });
        return;
      }
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(50, Math.max(1, Math.trunc(requestedLimit)))
        : 20;

      if (req.query.categories !== undefined && typeof req.query.categories !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'Search categories are invalid.', statusCode: 400 },
        });
        return;
      }
      const categoryParam = typeof req.query.categories === 'string' ? req.query.categories : '';
      const categorySlugs = categoryParam
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean);
      if (
        categorySlugs.length > 10
        || categorySlugs.some((slug) => slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      ) {
        res.status(400).json({
          success: false,
          error: { message: 'Search categories are invalid.', statusCode: 400 },
        });
        return;
      }

      if (req.query.minRating !== undefined && typeof req.query.minRating !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'Minimum rating is invalid.', statusCode: 400 },
        });
        return;
      }
      const minRatingParam = typeof req.query.minRating === 'string' ? req.query.minRating : '';
      const minRating = minRatingParam === '' ? undefined : Number(minRatingParam);
      if (minRating !== undefined && (!Number.isFinite(minRating) || minRating < 1 || minRating > 5)) {
        res.status(400).json({
          success: false,
          error: { message: 'Minimum rating must be between 1 and 5.', statusCode: 400 },
        });
        return;
      }

      const filters = {
        ...(categorySlugs.length > 0 ? { categorySlugs: Array.from(new Set(categorySlugs)) } : {}),
        ...(minRating !== undefined ? { minRating } : {}),
      };
      const [serviceResults, providerResults] = await Promise.all([
        catalogService.searchServices(query, limit, filters),
        catalogService.searchProviders(query, Math.min(limit, 10), filters),
      ]);

      res.json({
        success: true,
        data: {
          services: serviceResults.map(formatSubcategory),
          providers: providerResults,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 14 Dispatch 05 — Bug 1230.
// Public endpoint returning the price bounds for a subcategory. The
// provider mobile UI fetches this when the provider edits their per-
// service price, so the form can show "min ₱X, max ₱Y" guidance and
// reject obviously-out-of-range values client-side. The API also
// enforces these bounds server-side in
// `provider.service.ts:addProviderService` (defense in depth).
router.get(
  '/subcategories/:id/bounds',
  validationMiddleware({ params: catalogUuidParamsSchema }),
  cacheMiddleware(() => getRuntimeCacheTtl('categories')),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subcategoryId = req.params.id as string;
      const result = await db.query<{
        min_price: number | null;
        max_price: number | null;
        base_price: number | null;
        pricing_type: string;
      }>(
        `SELECT min_price, max_price, base_price, pricing_type
           FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
        [subcategoryId],
      );
      if (result.rows.length === 0) {
        throw createAppError('Subcategory not found or inactive.', 404);
      }
      const row = result.rows[0]!;
      res.json({
        success: true,
        data: {
          minCents: row.min_price !== null ? Number(row.min_price) : null,
          maxCents: row.max_price !== null ? Number(row.max_price) : null,
          baseCents: row.base_price !== null ? Number(row.base_price) : null,
          pricingType: row.pricing_type,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/subcategory/:subcategoryId/addons',
  validationMiddleware({ params: catalogSubcategoryUuidParamsSchema }),
  cacheMiddleware(() => getRuntimeCacheTtl('categories')),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subcategoryId = req.params.subcategoryId as string;
      const addons = await catalogService.getAddonsForSubcategory(subcategoryId);
      res.json({ success: true, data: addons });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:slug',
  cacheMiddleware(() => getRuntimeCacheTtl('categories')),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = req.params.slug;
      if (typeof slug !== 'string') {
        res.status(400).json({ success: false, error: { message: 'Invalid category.', statusCode: 400 } });
        return;
      }

      const category = await catalogService.getCategoryBySlug(slug);
      if (!category) {
        res.status(404).json({ success: false, error: { message: 'Category not found.', statusCode: 404 } });
        return;
      }

      res.json({
        success: true,
        data: {
          ...formatCategory(category),
          subcategories: category.subcategories.map(formatSubcategory),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/categories',
  authMiddleware,
  validationMiddleware(createCategorySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const { name, description, iconUrl, displayOrder } = req.body;
      if (typeof name !== 'string' || !name.trim()) throw createAppError('Name is required.', 400);

      // Phase 14 Dispatch 06 — Bug 237: delegate to transactional service.
      const row = await catalogService.createCategory(
        { name, description, iconUrl, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.status(201).json({ success: true, data: formatCategory(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/admin/categories/:id',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: updateCategorySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Category ID is required.', 400);

      const { name, description, iconUrl, displayOrder } = req.body;
      const row = await catalogService.updateCategory(
        id,
        { name, description, iconUrl, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: formatCategory(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/subcategories',
  authMiddleware,
  validationMiddleware(createSubcategorySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const { categoryId, name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, unitLabel, unitPrice, hourlyRate, displayOrder } = req.body;
      if (typeof name !== 'string' || !name.trim()) throw createAppError('Name is required.', 400);
      if (typeof categoryId !== 'string') throw createAppError('Category ID is required.', 400);

      const row = await catalogService.createSubcategory(
        { categoryId, name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, unitLabel, unitPrice, hourlyRate, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.status(201).json({ success: true, data: formatSubcategory(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/admin/subcategories/:id',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: updateSubcategorySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const { name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, unitLabel, unitPrice, hourlyRate, displayOrder } = req.body;
      const row = await catalogService.updateSubcategory(
        id,
        { name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, unitLabel, unitPrice, hourlyRate, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: formatSubcategory(row) });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Admin Add-on Management ─────────────────────────────

router.get(
  '/admin/subcategories/:id/addons',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const subcategoryId = req.params['id'] as string;
      const result = await catalogService.getAdminAddonsForSubcategory(subcategoryId);
      res.json({
        success: true,
        data: result.addons,
        meta: { priceCapCentavos: result.priceCapCentavos },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 14 Dispatch 05 — Bug 266.
// Replaced manual `typeof price !== 'number' || price < 0` validation
// with `validationMiddleware(createAddonSchema)`. The new Zod schema
// caps price at the hard backstop while the service also enforces the
// live `addon_price_max_cents` setting.
router.post(
  '/admin/addons',
  authMiddleware,
  validationMiddleware(createAddonSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const { subcategoryId, name, description, price, displayOrder } = req.body as {
        subcategoryId: string;
        name: string;
        description?: string;
        price: number;
        displayOrder?: number;
      };

      const a = await catalogService.createAddon(
        { subcategoryId, name, description, price, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.status(201).json({
        success: true,
        data: { id: a.id, subcategoryId: a.subcategory_id, name: a.name, description: a.description, price: a.price, isActive: a.is_active, displayOrder: a.display_order },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/admin/addons/:id',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: updateAddonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Add-on ID is required.', 400);

      const { name, description, price, displayOrder } = req.body as {
        name?: string;
        description?: string;
        price?: number;
        displayOrder?: number;
      };

      const a = await catalogService.updateAddon(
        id,
        { name, description, price, displayOrder },
        req.user!.userId,
      );

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({
        success: true,
        data: { id: a.id, subcategoryId: a.subcategory_id, name: a.name, description: a.description, price: a.price, isActive: a.is_active, displayOrder: a.display_order },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/admin/addons/:id',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: catalogLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Add-on ID is required.', 400);

      const reason = req.body.reason as string;
      await catalogService.deleteAddon(id, req.user!.userId, reason);

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: { message: 'Add-on deactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

// MED-N161 + MED-N162 fix — DELETE subcategory (a) requires
// super_admin and (b) delegates to catalogService.deleteSubcategory
// so the soft-delete + admin_actions audit happen atomically. The
// pre-fix inline `UPDATE service_subcategories SET is_active = FALSE`
// pattern bypassed the audit row.
router.delete(
  '/admin/subcategories/:id',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: catalogLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const reason = req.body.reason as string;
      await catalogService.deleteSubcategory(id, req.user!.userId, reason);

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: { message: 'Subcategory deactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/subcategories/:id/reactivate',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: catalogLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const row = await catalogService.reactivateSubcategory(
        req.params.id as string,
        req.user!.userId,
        req.body.reason as string,
      );
      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: formatSubcategory(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/addons/:id/reactivate',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: catalogLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const row = await catalogService.reactivateAddon(
        req.params.id as string,
        req.user!.userId,
        req.body.reason as string,
      );
      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({
        success: true,
        data: {
          id: row.id,
          subcategoryId: row.subcategory_id,
          name: row.name,
          description: row.description,
          price: row.price,
          isActive: row.is_active,
          displayOrder: row.display_order,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── D27 Phase 2: per-subcategory structured intake fields ──────────────────

function getId(req: AuthenticatedRequest, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !v) throw createAppError(`${name} is required.`, 400);
  return v;
}

// Public — active intake fields for a subcategory (the customer job-request form).
router.get(
  '/subcategories/:id/intake-fields',
  validationMiddleware({ params: catalogUuidParamsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (typeof id !== 'string' || !id) throw createAppError('id is required.', 400);
      const fields = await intakeService.listIntakeFields(id, { activeOnly: true });
      res.json({ success: true, data: fields });
    } catch (error) {
      next(error);
    }
  },
);

// Admin — all intake fields (incl. inactive) for the catalog editor.
router.get(
  '/admin/subcategories/:id/intake-fields',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const fields = await intakeService.listIntakeFields(getId(req, 'id'));
      res.json({ success: true, data: fields });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/subcategories/:id/intake-fields',
  authMiddleware,
  validationMiddleware({ params: catalogUuidParamsSchema, body: intakeFieldSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const field = await intakeService.createIntakeField(getId(req, 'id'), req.body);
      res.status(201).json({ success: true, data: field });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/admin/intake-fields/:fieldId',
  authMiddleware,
  validationMiddleware({ params: catalogFieldUuidParamsSchema, body: updateIntakeFieldSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const field = await intakeService.updateIntakeField(getId(req, 'fieldId'), req.body);
      res.json({ success: true, data: field });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/admin/intake-fields/:fieldId',
  authMiddleware,
  validationMiddleware({ params: catalogFieldUuidParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      await intakeService.deleteIntakeField(getId(req, 'fieldId'));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
