import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as catalogService from '../services/catalog.service';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { cacheDeletePattern, CacheTTL } from '../services/cache.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function formatCategory(c: { id: string; name: string; slug: string; description: string; icon_url: string | null; display_order: number }) {
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
}) {
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
      const results = await catalogService.searchServices(query, limit);
      res.json({ success: true, data: results.map(formatSubcategory) });
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
      requireAdmin(req);
      const { name, description, iconUrl, displayOrder } = req.body;
      if (typeof name !== 'string' || !name.trim()) throw createAppError('Name is required.', 400);

      const slug = slugify(name);
      const result = await db.query<CategoryRow>(
        `INSERT INTO service_categories (name, slug, description, icon_url, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name.trim(), slug, description ?? '', iconUrl ?? null, displayOrder ?? 0],
      );

      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.status(201).json({ success: true, data: formatCategory(result.rows[0]!) });
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
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Category ID is required.', 400);

      const { name, description, iconUrl, displayOrder, isActive } = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (name !== undefined) {
        sets.push(`name = $${idx++}`, `slug = $${idx++}`);
        params.push(name, slugify(name));
      }
      if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
      if (iconUrl !== undefined) { sets.push(`icon_url = $${idx++}`); params.push(iconUrl); }
      if (displayOrder !== undefined) { sets.push(`display_order = $${idx++}`); params.push(displayOrder); }
      if (isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(isActive); }

      if (sets.length === 0) throw createAppError('No fields to update.', 400);
      sets.push(`updated_at = NOW()`);
      params.push(id);

      const result = await db.query<CategoryRow>(
        `UPDATE service_categories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) throw createAppError('Category not found.', 404);

      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: formatCategory(result.rows[0]!) });
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
      requireAdmin(req);
      const { categoryId, name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder } = req.body;
      if (typeof name !== 'string' || !name.trim()) throw createAppError('Name is required.', 400);
      if (typeof categoryId !== 'string') throw createAppError('Category ID is required.', 400);

      const slug = slugify(name);
      const result = await db.query<SubcategoryRow>(
        `INSERT INTO service_subcategories
           (category_id, name, slug, description, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [categoryId, name.trim(), slug, description ?? '', pricingType ?? 'fixed', basePrice ?? null, minPrice ?? null, maxPrice ?? null, estimatedDurationMinutes ?? null, displayOrder ?? 0],
      );

      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.status(201).json({ success: true, data: formatSubcategory(result.rows[0]!) });
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
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const { name, description, pricingType, basePrice, minPrice, maxPrice, estimatedDurationMinutes, displayOrder, isActive } = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (name !== undefined) {
        sets.push(`name = $${idx++}`, `slug = $${idx++}`);
        params.push(name, slugify(name));
      }
      if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
      if (pricingType !== undefined) { sets.push(`pricing_type = $${idx++}`); params.push(pricingType); }
      if (basePrice !== undefined) { sets.push(`base_price = $${idx++}`); params.push(basePrice); }
      if (minPrice !== undefined) { sets.push(`min_price = $${idx++}`); params.push(minPrice); }
      if (maxPrice !== undefined) { sets.push(`max_price = $${idx++}`); params.push(maxPrice); }
      if (estimatedDurationMinutes !== undefined) { sets.push(`estimated_duration_minutes = $${idx++}`); params.push(estimatedDurationMinutes); }
      if (displayOrder !== undefined) { sets.push(`display_order = $${idx++}`); params.push(displayOrder); }
      if (isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(isActive); }

      if (sets.length === 0) throw createAppError('No fields to update.', 400);
      sets.push(`updated_at = NOW()`);
      params.push(id);

      const result = await db.query<SubcategoryRow>(
        `UPDATE service_subcategories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) throw createAppError('Subcategory not found.', 404);

      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: formatSubcategory(result.rows[0]!) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/admin/subcategories/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string') throw createAppError('Subcategory ID is required.', 400);

      const result = await db.query(
        `UPDATE service_subcategories SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) throw createAppError('Subcategory not found.', 404);

      await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
      res.json({ success: true, data: { message: 'Subcategory deactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
