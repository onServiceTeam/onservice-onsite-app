import { db } from '../models/db';
import { logger } from '../utils/logger';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  pricing_type: string;
  base_price: number | null;
  min_price: number | null;
  max_price: number | null;
  estimated_duration_minutes: number | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CategoryWithSubcategories extends CategoryRow {
  subcategories: SubcategoryRow[];
}

export async function getActiveCategories(): Promise<CategoryRow[]> {
  const result = await db.query<CategoryRow>(
    `SELECT * FROM service_categories
     WHERE is_active = TRUE
     ORDER BY display_order ASC, name ASC`,
  );
  return result.rows;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryWithSubcategories | null> {
  const catResult = await db.query<CategoryRow>(
    `SELECT * FROM service_categories WHERE slug = $1 AND is_active = TRUE`,
    [slug],
  );

  if (catResult.rows.length === 0) return null;

  const category = catResult.rows[0]!;
  const subResult = await db.query<SubcategoryRow>(
    `SELECT * FROM service_subcategories
     WHERE category_id = $1 AND is_active = TRUE
     ORDER BY display_order ASC, name ASC`,
    [category.id],
  );

  return { ...category, subcategories: subResult.rows };
}

export async function getCategoryById(categoryId: string): Promise<CategoryWithSubcategories | null> {
  const catResult = await db.query<CategoryRow>(
    `SELECT * FROM service_categories WHERE id = $1 AND is_active = TRUE`,
    [categoryId],
  );

  if (catResult.rows.length === 0) return null;

  const category = catResult.rows[0]!;
  const subResult = await db.query<SubcategoryRow>(
    `SELECT * FROM service_subcategories
     WHERE category_id = $1 AND is_active = TRUE
     ORDER BY display_order ASC, name ASC`,
    [category.id],
  );

  return { ...category, subcategories: subResult.rows };
}

export async function getSubcategoryById(subcategoryId: string): Promise<SubcategoryRow | null> {
  const result = await db.query<SubcategoryRow>(
    `SELECT * FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
    [subcategoryId],
  );
  return result.rows[0] ?? null;
}

export async function searchServices(query: string, limit = 20): Promise<(SubcategoryRow & { category_name: string; category_slug: string })[]> {
  const escaped = query.toLowerCase().replace(/[%_\\]/g, '\\$&');
  const searchTerm = `%${escaped}%`;
  const result = await db.query<SubcategoryRow & { category_name: string; category_slug: string }>(
    `SELECT sc.*, c.name AS category_name, c.slug AS category_slug
     FROM service_subcategories sc
     JOIN service_categories c ON sc.category_id = c.id
     WHERE sc.is_active = TRUE AND c.is_active = TRUE
       AND (LOWER(sc.name) LIKE $1 OR LOWER(c.name) LIKE $1 OR LOWER(sc.description) LIKE $1)
     ORDER BY sc.display_order ASC
     LIMIT $2`,
    [searchTerm, limit],
  );

  logger.debug('Service search', { query, resultCount: result.rows.length });
  return result.rows;
}

export async function getFullCatalog(): Promise<CategoryWithSubcategories[]> {
  const categories = await getActiveCategories();
  const allSubs = await db.query<SubcategoryRow>(
    `SELECT * FROM service_subcategories
     WHERE is_active = TRUE
     ORDER BY display_order ASC, name ASC`,
  );

  const subsByCategory = new Map<string, SubcategoryRow[]>();
  for (const sub of allSubs.rows) {
    const existing = subsByCategory.get(sub.category_id) ?? [];
    existing.push(sub);
    subsByCategory.set(sub.category_id, existing);
  }

  return categories.map((cat) => ({
    ...cat,
    subcategories: subsByCategory.get(cat.id) ?? [],
  }));
}
