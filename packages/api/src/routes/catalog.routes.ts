import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as catalogService from '../services/catalog.service';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { cacheDeletePattern, CacheTTL } from '../services/cache.service';
import { createAddonSchema, updateAddonSchema } from '../validators/admin-catalog.validators';

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
  category_name?: string; category_slug?: string;
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
    displayOrder: s.display_order,
  };
  if (s.category_name) result.categoryName = s.category_name;
  if (s.category_slug) result.categorySlug = s.category_slug;
  return result;
}

router.get(
  '/',
  cacheMiddleware(CacheTTL.CATEGORIES),
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
  cacheMiddleware(CacheTTL.CATEGORIES),
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
  '/search',
  cacheMiddleware(CacheTTL.SEARCH_RESULTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      if (query.length < 2) {
        res.status(400).json({
          success: false,
          error: { message: 'Search query must be at least 2 characters.', statusCode: 400 },
        });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const [serviceResults, providerResults] = await Promise.all([
        catalogService.searchServices(query, limit),
        catalogService.searchProviders(query, Math.min(limit, 10)),
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
  cacheMiddleware(CacheTTL.SUBCATEGORIES),
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
  cacheMiddleware(CacheTTL.SUBCATEGORIES),
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
  cacheMiddleware(CacheTTL.SUBCATEGORIES),
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

interface CategoryRow {
  id: string; name: string; slug: string; description: string;
  icon_url: string | null; display_order: number; is_active: boolean;
}

interface SubcategoryRow {
  id: string; category_id: string; name: string; slug: string; description: string;
  pricing_type: string; base_price: number | null; min_price: number | null;
  max_price: number | null; estimated_duration_minutes: number | null;
  display_order: number; is_active: boolean;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.post(
  '/admin/categories',
  authMiddleware,
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Category ID is required.', 400);

      const { name, description, iconUrl, displayOrder, isActive } = req.body;
      const row = await catalogService.updateCategory(
        id,
        { name, description, iconUrl, displayOrder, isActive },
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const { categoryId, name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder } = req.body;
      if (typeof name !== 'string' || !name.trim()) throw createAppError('Name is required.', 400);
      if (typeof categoryId !== 'string') throw createAppError('Category ID is required.', 400);

      const row = await catalogService.createSubcategory(
        { categoryId, name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder },
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const { name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder, isActive } = req.body;
      const row = await catalogService.updateSubcategory(
        id,
        { name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder, isActive },
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const subcategoryId = req.params['id'] as string;
      interface AddonRow { id: string; subcategory_id: string; name: string; description: string; price: number; is_active: boolean; display_order: number }
      const result = await db.query<AddonRow>(
        `SELECT * FROM service_addons WHERE subcategory_id = $1 ORDER BY display_order ASC, name ASC`,
        [subcategoryId],
      );
      res.json({
        success: true,
        data: result.rows.map((a) => ({
          id: a.id, subcategoryId: a.subcategory_id, name: a.name, description: a.description,
          price: a.price, isActive: a.is_active, displayOrder: a.display_order,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 14 Dispatch 05 — Bug 266.
// Replaced manual `typeof price !== 'number' || price < 0` validation
// with `validationMiddleware(createAddonSchema)`. The new Zod schema
// caps price at 5_000_000 centavos (₱50,000) per migration 074's
// `addon_price_max_cents` setting.
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
  validationMiddleware(updateAddonSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Add-on ID is required.', 400);

      const { name, description, price, displayOrder, isActive } = req.body as {
        name?: string;
        description?: string;
        price?: number;
        displayOrder?: number;
        isActive?: boolean;
      };

      const a = await catalogService.updateAddon(
        id,
        { name, description, price, displayOrder, isActive },
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // MED-N161
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Add-on ID is required.', 400);

      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      await catalogService.deleteSubcategory(id, req.user!.userId, reason);

      // gate-c-allowed: post-commit-cache-invalidation
      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: { message: 'Subcategory deactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
