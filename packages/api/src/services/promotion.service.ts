import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

interface PromotionRow {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  badge: string | null;
  cta_text: string | null;
  cta_link: string | null;
  target_audience: string;
  start_date: Date;
  end_date: Date | null;
  is_active: boolean;
  display_order: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getActivePromotions(audience: string = 'all'): Promise<PromotionRow[]> {
  const result = await db.query<PromotionRow>(
    `SELECT * FROM promotions
     WHERE is_active = TRUE
       AND start_date <= NOW()
       AND (end_date IS NULL OR end_date >= NOW())
       AND (target_audience = 'all' OR target_audience = $1)
     ORDER BY display_order ASC, created_at DESC
     LIMIT 10`,
    [audience],
  );
  return result.rows;
}

export async function getAllPromotions(page: number, pageSize: number): Promise<{ rows: PromotionRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const countResult = await db.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM promotions`);
  const total = Number(countResult.rows[0]?.count ?? 0);
  const result = await db.query<PromotionRow>(
    `SELECT * FROM promotions ORDER BY display_order ASC, created_at DESC LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );
  return { rows: result.rows, total };
}

export async function getPromotionById(id: string): Promise<PromotionRow> {
  const result = await db.query<PromotionRow>(`SELECT * FROM promotions WHERE id = $1`, [id]);
  if (!result.rows[0]) throw createAppError('Promotion not found.', 404);
  return result.rows[0];
}

export interface CreatePromotionParams {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  badge?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  targetAudience?: string;
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
  displayOrder?: number;
  createdBy?: string;
}

function assertSchedule(startDate: Date, endDate: Date | null): void {
  if (!Number.isFinite(startDate.getTime()) || (endDate && !Number.isFinite(endDate.getTime()))) {
    throw createAppError('Promotion schedule contains an invalid date.', 400);
  }
  if (endDate && endDate.getTime() <= startDate.getTime()) {
    throw createAppError('Promotion end date must be after its start date.', 400);
  }
}

function supplied(data: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

// MED-N150 + MED-N151 fix — promotions are admin-managed customer-
// facing marketing copy. Pre-fix create / update / delete all ran as
// raw db.query with no admin_actions audit. Post-fix each one runs
// in a transaction that also writes an audit row of type
// 'config_changed' with op + before/after snapshots in details.
export async function createPromotion(params: CreatePromotionParams): Promise<PromotionRow> {
  const startDate = params.startDate ? new Date(params.startDate) : new Date();
  const endDate = params.endDate ? new Date(params.endDate) : null;
  assertSchedule(startDate, endDate);
  return db.transaction(async (client) => {
    const result = await client.query<PromotionRow>(
      `INSERT INTO promotions (title, subtitle, image_url, badge, cta_text, cta_link, target_audience, start_date, end_date, is_active, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        params.title,
        params.subtitle ?? null,
        params.imageUrl ?? null,
        params.badge ?? null,
        params.ctaText ?? null,
        params.ctaLink ?? null,
        params.targetAudience ?? 'all',
        startDate,
        endDate,
        params.isActive ?? false,
        params.displayOrder ?? 0,
        params.createdBy ?? null,
      ],
    );
    const row = result.rows[0]!;
    if (params.createdBy) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'promotion', $2, $3::jsonb)`,
        [
          params.createdBy,
          row.id,
          JSON.stringify({
            op: 'create',
            title: params.title,
            targetAudience: params.targetAudience ?? 'all',
            startDate: startDate.toISOString(),
            endDate: endDate?.toISOString() ?? null,
            isActive: params.isActive ?? false,
          }),
        ],
      );
    }
    logger.info('Promotion created', { id: row.id, title: params.title, createdBy: params.createdBy ?? null });
    return row;
  });
}

export async function updatePromotion(
  id: string,
  data: Partial<CreatePromotionParams> & { isActive?: boolean; updatedByAdminId?: string },
): Promise<PromotionRow> {
  return db.transaction(async (client) => {
    const before = await client.query<PromotionRow>(
      `SELECT * FROM promotions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (before.rows.length === 0) throw createAppError('Promotion not found.', 404);
    const existing = before.rows[0]!;
    const nextStartDate = supplied(data, 'startDate')
      ? new Date(data.startDate as string)
      : existing.start_date;
    const nextEndDate = supplied(data, 'endDate')
      ? (data.endDate ? new Date(data.endDate) : null)
      : existing.end_date;
    assertSchedule(nextStartDate, nextEndDate);

    const result = await client.query<PromotionRow>(
      `UPDATE promotions SET
        title = $2, subtitle = $3, image_url = $4, badge = $5,
        cta_text = $6, cta_link = $7, target_audience = $8,
        start_date = $9, end_date = $10, is_active = $11,
        display_order = $12, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        data.title ?? existing.title,
        supplied(data, 'subtitle') ? data.subtitle ?? null : existing.subtitle,
        supplied(data, 'imageUrl') ? data.imageUrl ?? null : existing.image_url,
        supplied(data, 'badge') ? data.badge ?? null : existing.badge,
        supplied(data, 'ctaText') ? data.ctaText ?? null : existing.cta_text,
        supplied(data, 'ctaLink') ? data.ctaLink ?? null : existing.cta_link,
        data.targetAudience ?? existing.target_audience,
        nextStartDate,
        nextEndDate,
        data.isActive ?? existing.is_active,
        data.displayOrder ?? existing.display_order,
      ],
    );
    if (data.updatedByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'promotion', $2, $3::jsonb)`,
        [
          data.updatedByAdminId,
          id,
          JSON.stringify({
            op: 'update',
            beforeTitle: existing.title,
            afterTitle: data.title ?? existing.title,
            beforeIsActive: existing.is_active,
            afterIsActive: data.isActive ?? existing.is_active,
            beforeStartDate: existing.start_date,
            afterStartDate: nextStartDate,
            beforeEndDate: existing.end_date,
            afterEndDate: nextEndDate,
          }),
        ],
      );
    }
    logger.info('Promotion updated', { id, updatedBy: data.updatedByAdminId ?? null });
    return result.rows[0]!;
  });
}

export async function deletePromotion(id: string, deletedByAdminId: string): Promise<void> {
  return db.transaction(async (client) => {
    const before = await client.query<PromotionRow>(
      `SELECT * FROM promotions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (before.rows.length === 0) throw createAppError('Promotion not found.', 404);
    const tpl = before.rows[0]!;

    await client.query(`DELETE FROM promotions WHERE id = $1`, [id]);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'config_changed', 'promotion', $2, $3::jsonb)`,
      [
        deletedByAdminId,
        id,
        JSON.stringify({
          op: 'delete',
          deletedTitle: tpl.title,
          deletedTargetAudience: tpl.target_audience,
          deletedIsActive: tpl.is_active,
        }),
      ],
    );
    logger.info('Promotion deleted', { id, deletedBy: deletedByAdminId });
  });
}

export function formatPromotion(p: PromotionRow): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    imageUrl: p.image_url,
    badge: p.badge,
    ctaText: p.cta_text,
    ctaLink: p.cta_link,
    targetAudience: p.target_audience,
    startDate: p.start_date,
    endDate: p.end_date,
    isActive: p.is_active,
    displayOrder: p.display_order,
    createdAt: p.created_at,
  };
}
