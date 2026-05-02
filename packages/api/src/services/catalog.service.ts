import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

// ─────────────────────────────────────────────────────────────────
// Phase 14 Dispatch 06 — Bug 237.
// Admin catalog mutations are extracted from routes/catalog.routes.ts
// into this service so each mutation wraps its row write + admin_actions
// audit insert in ONE db.transaction. Pre-D06 the routes did inline
// db.query writes with NO audit. Cache invalidation (cacheDeletePattern)
// stays post-commit per the documented pattern (idempotent + retryable).
// ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface CategoryMutationRow {
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

export interface SubcategoryMutationRow {
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

export interface AddonMutationRow {
  id: string;
  subcategory_id: string;
  name: string;
  description: string;
  price: number;
  is_active: boolean;
  display_order: number;
  created_at?: Date;
  updated_at?: Date;
}

export async function createCategory(
  input: {
    name: string;
    description?: string;
    iconUrl?: string;
    displayOrder?: number;
  },
  adminUserId: string,
): Promise<CategoryMutationRow> {
  if (!input.name.trim()) throw createAppError('Name is required.', 400);
  const slug = slugify(input.name);

  return db.transaction(async (client) => {
    let result;
    try {
      result = await client.query<CategoryMutationRow>(
        `INSERT INTO service_categories (name, slug, description, icon_url, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.name.trim(), slug, input.description ?? '', input.iconUrl ?? null, input.displayOrder ?? 0],
      );
    } catch (err) {
      // MED-N37 fix: catch the UNIQUE-violation (Postgres SQLSTATE
      // 23505) on the slug column and rethrow as a friendly 409 so
      // admin sees "category exists" instead of a raw DB error.
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505') {
        throw createAppError(`A category with this name already exists (slug: "${slug}").`, 409);
      }
      throw err;
    }
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to create category.', 500);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_category_created', 'service_category', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        row.id,
        JSON.stringify({ name: row.name, slug: row.slug, displayOrder: row.display_order }),
        `Service category created: ${row.name}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_category_created audit.', 500);
    }
    return row;
  });
}

export async function updateCategory(
  categoryId: string,
  patch: {
    name?: string;
    description?: string;
    iconUrl?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  },
  adminUserId: string,
): Promise<CategoryMutationRow> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const auditPatch: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    sets.push(`name = $${sets.length + 1}`);
    values.push(patch.name);
    sets.push(`slug = $${sets.length + 1}`);
    values.push(slugify(patch.name));
    auditPatch.name = patch.name;
  }
  if (patch.description !== undefined) {
    sets.push(`description = $${sets.length + 1}`);
    values.push(patch.description);
    auditPatch.description = patch.description;
  }
  if (patch.iconUrl !== undefined) {
    sets.push(`icon_url = $${sets.length + 1}`);
    values.push(patch.iconUrl);
    auditPatch.iconUrl = patch.iconUrl;
  }
  if (patch.displayOrder !== undefined) {
    sets.push(`display_order = $${sets.length + 1}`);
    values.push(patch.displayOrder);
    auditPatch.displayOrder = patch.displayOrder;
  }
  if (patch.isActive !== undefined) {
    sets.push(`is_active = $${sets.length + 1}`);
    values.push(patch.isActive);
    auditPatch.isActive = patch.isActive;
  }

  if (sets.length === 0) throw createAppError('No fields to update.', 400);
  sets.push(`updated_at = NOW()`);
  values.push(categoryId);

  return db.transaction(async (client) => {
    const result = await client.query<CategoryMutationRow>(
      `UPDATE service_categories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Category not found.', 404);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_category_updated', 'service_category', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        categoryId,
        JSON.stringify({ patch: auditPatch }),
        `Service category updated: fields ${Object.keys(auditPatch).join(', ')}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_category_updated audit.', 500);
    }
    return row;
  });
}

export async function createSubcategory(
  input: {
    categoryId: string;
    name: string;
    description?: string;
    pricingType?: string;
    basePrice?: number | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    estimatedDurationMinutes?: number | null;
    displayOrder?: number;
  },
  adminUserId: string,
): Promise<SubcategoryMutationRow> {
  if (!input.name.trim()) throw createAppError('Name is required.', 400);
  if (!input.categoryId) throw createAppError('Category ID is required.', 400);
  const slug = slugify(input.name);

  return db.transaction(async (client) => {
    const result = await client.query<SubcategoryMutationRow>(
      `INSERT INTO service_subcategories
         (category_id, name, slug, description, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.categoryId,
        input.name.trim(),
        slug,
        input.description ?? '',
        input.pricingType ?? 'fixed',
        input.basePrice ?? null,
        input.minPrice ?? null,
        input.maxPrice ?? null,
        input.estimatedDurationMinutes ?? null,
        input.displayOrder ?? 0,
      ],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to create subcategory.', 500);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_subcategory_created', 'service_subcategory', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        row.id,
        JSON.stringify({
          categoryId: input.categoryId,
          name: row.name,
          slug: row.slug,
          pricingType: row.pricing_type,
        }),
        `Service subcategory created: ${row.name}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_subcategory_created audit.', 500);
    }
    return row;
  });
}

export async function updateSubcategory(
  subcategoryId: string,
  patch: {
    name?: string;
    description?: string;
    pricingType?: string;
    basePrice?: number | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    estimatedDurationMinutes?: number | null;
    displayOrder?: number;
    isActive?: boolean;
  },
  adminUserId: string,
): Promise<SubcategoryMutationRow> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const auditPatch: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    sets.push(`name = $${sets.length + 1}`);
    values.push(patch.name);
    sets.push(`slug = $${sets.length + 1}`);
    values.push(slugify(patch.name));
    auditPatch.name = patch.name;
  }
  if (patch.description !== undefined) {
    sets.push(`description = $${sets.length + 1}`);
    values.push(patch.description);
    auditPatch.description = patch.description;
  }
  if (patch.pricingType !== undefined) {
    sets.push(`pricing_type = $${sets.length + 1}`);
    values.push(patch.pricingType);
    auditPatch.pricingType = patch.pricingType;
  }
  if (patch.basePrice !== undefined) {
    sets.push(`base_price = $${sets.length + 1}`);
    values.push(patch.basePrice);
    auditPatch.basePrice = patch.basePrice;
  }
  if (patch.minPrice !== undefined) {
    sets.push(`min_price = $${sets.length + 1}`);
    values.push(patch.minPrice);
    auditPatch.minPrice = patch.minPrice;
  }
  if (patch.maxPrice !== undefined) {
    sets.push(`max_price = $${sets.length + 1}`);
    values.push(patch.maxPrice);
    auditPatch.maxPrice = patch.maxPrice;
  }
  if (patch.estimatedDurationMinutes !== undefined) {
    sets.push(`estimated_duration_minutes = $${sets.length + 1}`);
    values.push(patch.estimatedDurationMinutes);
    auditPatch.estimatedDurationMinutes = patch.estimatedDurationMinutes;
  }
  if (patch.displayOrder !== undefined) {
    sets.push(`display_order = $${sets.length + 1}`);
    values.push(patch.displayOrder);
    auditPatch.displayOrder = patch.displayOrder;
  }
  if (patch.isActive !== undefined) {
    sets.push(`is_active = $${sets.length + 1}`);
    values.push(patch.isActive);
    auditPatch.isActive = patch.isActive;
  }

  if (sets.length === 0) throw createAppError('No fields to update.', 400);
  sets.push(`updated_at = NOW()`);
  values.push(subcategoryId);

  return db.transaction(async (client) => {
    const result = await client.query<SubcategoryMutationRow>(
      `UPDATE service_subcategories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Subcategory not found.', 404);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_subcategory_updated', 'service_subcategory', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        subcategoryId,
        JSON.stringify({ patch: auditPatch }),
        `Service subcategory updated: fields ${Object.keys(auditPatch).join(', ')}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_subcategory_updated audit.', 500);
    }
    return row;
  });
}

export async function createAddon(
  input: {
    subcategoryId: string;
    name: string;
    description?: string;
    price: number;
    displayOrder?: number;
  },
  adminUserId: string,
): Promise<AddonMutationRow> {
  return db.transaction(async (client) => {
    const result = await client.query<AddonMutationRow>(
      `INSERT INTO service_addons (subcategory_id, name, description, price, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        input.subcategoryId,
        input.name.trim(),
        input.description ?? '',
        input.price,
        input.displayOrder ?? 0,
      ],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to create addon.', 500);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_addon_created', 'service_addon', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        row.id,
        JSON.stringify({
          subcategoryId: input.subcategoryId,
          name: row.name,
          price: row.price,
        }),
        `Service addon created: ${row.name}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_addon_created audit.', 500);
    }
    return row;
  });
}

export async function updateAddon(
  addonId: string,
  patch: {
    name?: string;
    description?: string;
    price?: number;
    displayOrder?: number;
    isActive?: boolean;
  },
  adminUserId: string,
): Promise<AddonMutationRow> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const auditPatch: Record<string, unknown> = {};

  if (patch.name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(patch.name); auditPatch.name = patch.name; }
  if (patch.description !== undefined) { sets.push(`description = $${sets.length + 1}`); values.push(patch.description); auditPatch.description = patch.description; }
  if (patch.price !== undefined) { sets.push(`price = $${sets.length + 1}`); values.push(patch.price); auditPatch.price = patch.price; }
  if (patch.displayOrder !== undefined) { sets.push(`display_order = $${sets.length + 1}`); values.push(patch.displayOrder); auditPatch.displayOrder = patch.displayOrder; }
  if (patch.isActive !== undefined) { sets.push(`is_active = $${sets.length + 1}`); values.push(patch.isActive); auditPatch.isActive = patch.isActive; }

  if (sets.length === 0) throw createAppError('No fields to update.', 400);
  sets.push(`updated_at = NOW()`);
  values.push(addonId);

  return db.transaction(async (client) => {
    const result = await client.query<AddonMutationRow>(
      `UPDATE service_addons SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Add-on not found.', 404);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'service_addon_updated', 'service_addon', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        addonId,
        JSON.stringify({ patch: auditPatch }),
        `Service addon updated: fields ${Object.keys(auditPatch).join(', ')}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_addon_updated audit.', 500);
    }
    return row;
  });
}

export async function deleteAddon(
  addonId: string,
  adminUserId: string,
  reason?: string,
): Promise<void> {
  // Phase 14 Dispatch 06 — Bug 237. Pre-D06 the route did UPDATE
  // service_addons SET is_active = FALSE (soft deactivate, preserving
  // booking_addons FK integrity) with NO audit. The behavior here keeps
  // the soft-deactivate semantics and adds the audit row. Hard DELETE
  // would orphan historical booking_addons rows.
  await db.transaction(async (client) => {
    const before = await client.query<AddonMutationRow>(
      `SELECT * FROM service_addons WHERE id = $1`,
      [addonId],
    );
    if (before.rows.length === 0) throw createAppError('Add-on not found.', 404);
    if (before.rows[0]!.is_active === false) {
      throw createAppError('Add-on is already deactivated.', 409);
    }

    const result = await client.query(
      `UPDATE service_addons SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [addonId],
    );
    if (result.rowCount === 0) throw createAppError('Add-on not found.', 404);

    const trimmedReason = (reason ?? '').trim();
    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'service_addon_deleted', 'service_addon', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        addonId,
        JSON.stringify({
          subcategoryId: before.rows[0]!.subcategory_id,
          name: before.rows[0]!.name,
          price: before.rows[0]!.price,
        }),
        trimmedReason ? trimmedReason.slice(0, 500) : `Service addon deactivated: ${before.rows[0]!.name}`,
        trimmedReason || null,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service_addon_deleted audit.', 500);
    }
  });
}

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

interface ProviderSearchRow {
  id: string;
  user_id: string;
  business_name: string;
  tier: string;
  rating: string | null;
  total_reviews: number;
  city: string | null;
  avatar_url: string | null;
}

export async function searchProviders(query: string, limit = 10): Promise<Record<string, unknown>[]> {
  const escaped = query.toLowerCase().replace(/[%_\\]/g, '\\$&');
  const searchTerm = `%${escaped}%`;

  const result = await db.query<ProviderSearchRow>(
    `SELECT p.id, p.user_id, p.business_name, p.tier, p.rating, p.total_reviews,
            p.city, u.avatar_url
     FROM providers p
     JOIN users u ON u.id = p.user_id
     WHERE p.status = 'approved' AND u.is_active = TRUE
       AND (LOWER(p.business_name) LIKE $1
            OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE $1)
     ORDER BY p.rating DESC NULLS LAST, p.total_reviews DESC
     LIMIT $2`,
    [searchTerm, limit],
  );

  return result.rows.map((p) => ({
    id: p.id,
    userId: p.user_id,
    businessName: p.business_name,
    tier: p.tier,
    averageRating: p.rating ? Number(p.rating) : null,
    totalReviews: p.total_reviews,
    city: p.city,
    avatarUrl: p.avatar_url,
  }));
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

// ─── Service Add-ons ──────────────────────────────────────

interface AddonRow {
  id: string;
  subcategory_id: string;
  name: string;
  description: string;
  price: number;
  is_active: boolean;
  display_order: number;
}

export async function getAddonsForSubcategory(subcategoryId: string): Promise<Record<string, unknown>[]> {
  const result = await db.query<AddonRow>(
    `SELECT id, subcategory_id, name, description, price, is_active, display_order
     FROM service_addons
     WHERE subcategory_id = $1 AND is_active = TRUE
     ORDER BY display_order ASC, name ASC`,
    [subcategoryId],
  );

  return result.rows.map((a) => ({
    id: a.id,
    subcategoryId: a.subcategory_id,
    name: a.name,
    description: a.description,
    price: a.price,
    displayOrder: a.display_order,
  }));
}

export async function saveBookingAddons(
  bookingId: string,
  addons: { addonId: string; name: string; price: number }[],
): Promise<void> {
  if (addons.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const a of addons) {
    placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    values.push(bookingId, a.addonId, a.name, a.price);
  }

  await db.query(
    `INSERT INTO booking_addons (booking_id, addon_id, name, price)
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  logger.debug('Booking addons saved', { bookingId, count: addons.length });
}

export async function getBookingAddons(bookingId: string): Promise<Record<string, unknown>[]> {
  const result = await db.query<{ id: string; addon_id: string; name: string; price: number }>(
    `SELECT id, addon_id, name, price FROM booking_addons WHERE booking_id = $1 ORDER BY created_at ASC`,
    [bookingId],
  );
  return result.rows.map((a) => ({
    id: a.id,
    addonId: a.addon_id,
    name: a.name,
    price: a.price,
  }));
}
