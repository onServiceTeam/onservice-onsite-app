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
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  ctaText?: string;
  ctaLink?: string;
  targetAudience?: string;
  startDate?: string;
  endDate?: string;
  displayOrder?: number;
  createdBy?: string;
}

export async function createPromotion(params: CreatePromotionParams): Promise<PromotionRow> {
  const result = await db.query<PromotionRow>(
    `INSERT INTO promotions (title, subtitle, image_url, badge, cta_text, cta_link, target_audience, start_date, end_date, display_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::timestamptz, COALESCE($10, 0), $11)
     RETURNING *`,
    [
      params.title,
      params.subtitle ?? null,
      params.imageUrl ?? null,
      params.badge ?? null,
      params.ctaText ?? null,
      params.ctaLink ?? null,
      params.targetAudience ?? 'all',
      params.startDate ?? null,
      params.endDate ?? null,
      params.displayOrder ?? 0,
      params.createdBy ?? null,
    ],
  );
  logger.info('Promotion created', { id: result.rows[0]!.id, title: params.title });
  return result.rows[0]!;
}

export async function updatePromotion(
  id: string,
  data: Partial<CreatePromotionParams> & { isActive?: boolean },
): Promise<PromotionRow> {
  const existing = await getPromotionById(id);
  const result = await db.query<PromotionRow>(
    `UPDATE promotions SET
      title = $2, subtitle = $3, image_url = $4, badge = $5,
      cta_text = $6, cta_link = $7, target_audience = $8,
      start_date = $9, end_date = $10, is_active = $11,
      display_order = $12, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      id,
      data.title ?? existing.title,
      data.subtitle ?? existing.subtitle,
      data.imageUrl ?? existing.image_url,
      data.badge ?? existing.badge,
      data.ctaText ?? existing.cta_text,
      data.ctaLink ?? existing.cta_link,
      data.targetAudience ?? existing.target_audience,
      data.startDate ?? existing.start_date,
      data.endDate ?? existing.end_date,
      data.isActive ?? existing.is_active,
      data.displayOrder ?? existing.display_order,
    ],
  );
  logger.info('Promotion updated', { id });
  return result.rows[0]!;
}

export async function deletePromotion(id: string): Promise<void> {
  const result = await db.query(`DELETE FROM promotions WHERE id = $1`, [id]);
  if (result.rowCount === 0) throw createAppError('Promotion not found.', 404);
  logger.info('Promotion deleted', { id });
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
