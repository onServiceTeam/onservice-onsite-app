/**
 * Phase 09 — Marketing admin service.
 * Promo codes (CRUD + deactivate) and marketing campaigns (CRUD + overview).
 *
 * Audit: every mutating function writes a paired admin_actions row using the
 * generic literals action_type='config_changed' and target_type='config' so we
 * do NOT widen the existing CHECK constraint this phase. Audit inserts are
 * wrapped in try/catch + logger.warn so a failed audit never loses the main
 * write. The kind of action is recorded in the JSONB details column.
 *
 * Money math: all amounts are integer centavos (BIGINT in SQL, number here).
 *   cpaCentavos = round(spend / signups), 0 when signups == 0
 *   roiPercent  = round((revenue - spend) / spend * 100), 0 when spend == 0
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as settingsService from './settings.service';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed_centavos';

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCentavos: number | null;
  minimumOrderCentavos: number;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number;
  timesUsed: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: string;
  startedAt: string;
  endedAt: string | null;
  spendCentavos: number;
  attributedSignups: number;
  attributedFirstBookings: number;
  attributedRevenueCentavos: number;
  notes: string | null;
  createdAt: string;
  cpaCentavos: number;
  roiPercent: number;
}

export interface ChannelBreakdownRow {
  channel: string;
  spendCentavos: number;
  signups: number;
  cpaCentavos: number;
  revenueCentavos: number;
  roiPercent: number;
}

export interface MarketingOverview {
  totalSpendCentavos: number;
  totalSignups: number;
  totalRevenueCentavos: number;
  aggregateCpaCentavos: number;
  aggregateRoiPercent: number;
  channelBreakdown: ChannelBreakdownRow[];
}

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_centavos: string | null;
  minimum_order_centavos: string;
  usage_limit_total: number | null;
  usage_limit_per_customer: number;
  times_used: number;
  valid_from: Date;
  valid_until: Date | null;
  active: boolean;
  created_at: Date;
}

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  started_at: Date;
  ended_at: Date | null;
  spend_centavos: string;
  attributed_signups: number;
  attributed_first_bookings: number;
  attributed_revenue_centavos: string;
  notes: string | null;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────

const CODE_REGEX = /^[A-Z0-9_-]{3,40}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// MED-N29 fix: marketing channels are no longer a hardcoded const.
// They live in platform_settings.marketing_channels (JSON array).
// Adding a new channel ('tiktok_ads', 'community_partnership') is now
// a Settings UI edit, not a code deploy.
//
// Hardcoded fallback used when the setting is missing or returns
// invalid JSON (Redis + DB both down). Matches the seed default in
// settings.service.SETTING_DEFAULTS so behavior in dev/test with no
// settings layer is preserved.
const FALLBACK_CHANNELS = [
  'facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer',
  'sms', 'email', 'referral', 'other',
] as const;

async function getAllowedChannels(): Promise<Set<string>> {
  try {
    const raw = await settingsService.getSetting('marketing_channels');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return new Set(parsed as string[]);
    }
  } catch (err) {
    logger.warn('marketing_channels setting unreadable; using fallback list', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return new Set<string>(FALLBACK_CHANNELS);
}

function validateCode(code: string): string {
  if (typeof code !== 'string' || !CODE_REGEX.test(code)) {
    throw createAppError(
      'code must match /^[A-Z0-9_-]{3,40}$/ (uppercase, digits, _ or -).',
      400,
    );
  }
  return code;
}

function validateDiscount(type: DiscountType, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw createAppError('discountValue must be a positive integer.', 400);
  }
  if (type === 'percentage') {
    if (value < 1 || value > 50) {
      throw createAppError('percentage discountValue must be between 1 and 50.', 400);
    }
  } else if (type === 'fixed_centavos') {
    if (value < 100) {
      throw createAppError(
        'fixed_centavos discountValue must be >= 100 (P1.00).',
        400,
      );
    }
  } else {
    throw createAppError(
      "discountType must be 'percentage' or 'fixed_centavos'.",
      400,
    );
  }
}

function validateDateString(value: string, field: string): string {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    throw createAppError(`${field} must be in YYYY-MM-DD format.`, 400);
  }
  return value;
}

function validateNonNegativeInt(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw createAppError(`${field} must be a non-negative integer.`, 400);
  }
}

function validateValidityRange(from: string | undefined, until: string | null | undefined): void {
  if (from && until) {
    // Compare as ISO timestamps; both are accepted by Postgres.
    const fromMs = Date.parse(from);
    const untilMs = Date.parse(until);
    if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs)) {
      throw createAppError('validFrom / validUntil must be valid timestamps.', 400);
    }
    if (untilMs < fromMs) {
      throw createAppError('validUntil must be on or after validFrom.', 400);
    }
  }
}

async function validateChannel(channel: string): Promise<string> {
  const allowed = await getAllowedChannels();
  if (!allowed.has(channel)) {
    throw createAppError(
      `channel must be one of: ${Array.from(allowed).join(', ')}.`,
      400,
    );
  }
  return channel;
}

// ─────────────────────────────────────────────────────────────────
// Audit helper
// ─────────────────────────────────────────────────────────────────

async function writeAudit(
  adminUserId: string,
  targetId: string,
  details: Record<string, unknown>,
  reason: string,
): Promise<void> {
  // gate-c-allowed: best-effort-audit-only — generic marketing audit helper; try/catch with logger.warn so audit failures don't block promo creation
  try {
    await db.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, reason, details)
       VALUES ($1, 'config_changed', 'config', $2, $3, $4::jsonb)`,
      [adminUserId, targetId, reason, JSON.stringify(details)],
    );
  } catch (err) {
    logger.warn('Failed to write marketing admin_actions audit row', {
      adminUserId,
      targetId,
      details,
      err: String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────

function mapPromo(r: PromoRow): PromoCode {
  return {
    id: r.id,
    code: r.code,
    description: r.description,
    discountType: r.discount_type,
    discountValue: Number(r.discount_value),
    maxDiscountCentavos: r.max_discount_centavos !== null ? Number(r.max_discount_centavos) : null,
    minimumOrderCentavos: Number(r.minimum_order_centavos),
    usageLimitTotal: r.usage_limit_total,
    usageLimitPerCustomer: Number(r.usage_limit_per_customer),
    timesUsed: Number(r.times_used),
    validFrom: r.valid_from.toISOString(),
    validUntil: r.valid_until ? r.valid_until.toISOString() : null,
    active: r.active,
    createdAt: r.created_at.toISOString(),
  };
}

function computeCpa(spend: number, signups: number): number {
  if (signups <= 0) return 0;
  return Math.round(spend / signups);
}

function computeRoiPercent(spend: number, revenue: number): number {
  if (spend <= 0) return 0;
  return Math.round(((revenue - spend) / spend) * 100);
}

function mapCampaign(r: CampaignRow): MarketingCampaign {
  const spendCentavos = Number(r.spend_centavos);
  const attributedSignups = Number(r.attributed_signups);
  const attributedRevenueCentavos = Number(r.attributed_revenue_centavos);
  return {
    id: r.id,
    name: r.name,
    channel: r.channel,
    startedAt: r.started_at.toISOString(),
    endedAt: r.ended_at ? r.ended_at.toISOString() : null,
    spendCentavos,
    attributedSignups,
    attributedFirstBookings: Number(r.attributed_first_bookings),
    attributedRevenueCentavos,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    cpaCentavos: computeCpa(spendCentavos, attributedSignups),
    roiPercent: computeRoiPercent(spendCentavos, attributedRevenueCentavos),
  };
}

const PROMO_COLS = `id, code, description, discount_type, discount_value,
       max_discount_centavos::text AS max_discount_centavos,
       minimum_order_centavos::text AS minimum_order_centavos,
       usage_limit_total, usage_limit_per_customer, times_used,
       valid_from, valid_until, active, created_at`;

const CAMPAIGN_COLS = `id, name, channel, started_at, ended_at,
       spend_centavos::text AS spend_centavos,
       attributed_signups,
       attributed_first_bookings,
       attributed_revenue_centavos::text AS attributed_revenue_centavos,
       notes, created_at`;

// ─────────────────────────────────────────────────────────────────
// Promo codes
// ─────────────────────────────────────────────────────────────────

export async function listPromoCodes(
  filter?: { active?: boolean; limit?: number; offset?: number },
): Promise<{ rows: PromoCode[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.active !== undefined) {
    params.push(filter.active);
    where.push(`active = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.max(1, Math.min(200, filter?.limit ?? 50));
  const offset = Math.max(0, filter?.offset ?? 0);

  const totalResult = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM promo_codes ${whereSql}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.cnt ?? 0);

  const rowsResult = await db.query<PromoRow>(
    `SELECT ${PROMO_COLS}
       FROM promo_codes
       ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows: rowsResult.rows.map(mapPromo), total };
}

export async function getPromoCode(id: string): Promise<PromoCode | null> {
  const result = await db.query<PromoRow>(
    `SELECT ${PROMO_COLS} FROM promo_codes WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapPromo(row) : null;
}

export async function createPromoCode(
  input: {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    maxDiscountCentavos?: number | null;
    minimumOrderCentavos?: number;
    usageLimitTotal?: number | null;
    usageLimitPerCustomer?: number;
    validFrom?: string;
    validUntil?: string | null;
  },
  adminUserId: string,
): Promise<PromoCode> {
  const code = validateCode(input.code);
  validateDiscount(input.discountType, input.discountValue);

  const minOrder = input.minimumOrderCentavos ?? 0;
  validateNonNegativeInt(minOrder, 'minimumOrderCentavos');

  if (input.maxDiscountCentavos !== undefined && input.maxDiscountCentavos !== null) {
    validateNonNegativeInt(input.maxDiscountCentavos, 'maxDiscountCentavos');
  }
  if (input.usageLimitTotal !== undefined && input.usageLimitTotal !== null) {
    validateNonNegativeInt(input.usageLimitTotal, 'usageLimitTotal');
  }
  const perCustomer = input.usageLimitPerCustomer ?? 1;
  validateNonNegativeInt(perCustomer, 'usageLimitPerCustomer');

  validateValidityRange(input.validFrom, input.validUntil);

  const result = await db.query<PromoRow>(
    `INSERT INTO promo_codes
       (code, description, discount_type, discount_value,
        max_discount_centavos, minimum_order_centavos,
        usage_limit_total, usage_limit_per_customer,
        valid_from, valid_until, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, NOW()),$10,$11)
     RETURNING ${PROMO_COLS}`,
    [
      code,
      input.description ?? null,
      input.discountType,
      input.discountValue,
      input.maxDiscountCentavos ?? null,
      minOrder,
      input.usageLimitTotal ?? null,
      perCustomer,
      input.validFrom ?? null,
      input.validUntil ?? null,
      adminUserId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Failed to insert promo code.', 500);

  await writeAudit(
    adminUserId,
    row.id,
    { kind: 'promo_create', code: row.code },
    `Promo code created: ${row.code}`,
  );
  logger.info('Promo code created', { id: row.id, code: row.code, adminUserId });

  return mapPromo(row);
}

export async function updatePromoCode(
  id: string,
  patch: Partial<{
    description: string;
    minimumOrderCentavos: number;
    usageLimitTotal: number | null;
    validUntil: string | null;
    active: boolean;
  }>,
  adminUserId: string,
): Promise<PromoCode> {
  if (
    patch.minimumOrderCentavos !== undefined &&
    patch.minimumOrderCentavos !== null
  ) {
    validateNonNegativeInt(patch.minimumOrderCentavos, 'minimumOrderCentavos');
  }
  if (
    patch.usageLimitTotal !== undefined &&
    patch.usageLimitTotal !== null
  ) {
    validateNonNegativeInt(patch.usageLimitTotal, 'usageLimitTotal');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.description !== undefined) {
    params.push(patch.description);
    sets.push(`description = $${params.length}`);
  }
  if (patch.minimumOrderCentavos !== undefined) {
    params.push(patch.minimumOrderCentavos);
    sets.push(`minimum_order_centavos = $${params.length}`);
  }
  if (patch.usageLimitTotal !== undefined) {
    params.push(patch.usageLimitTotal);
    sets.push(`usage_limit_total = $${params.length}`);
  }
  if (patch.validUntil !== undefined) {
    params.push(patch.validUntil);
    sets.push(`valid_until = $${params.length}`);
  }
  if (patch.active !== undefined) {
    params.push(patch.active);
    sets.push(`active = $${params.length}`);
  }

  if (sets.length === 0) {
    const existing = await getPromoCode(id);
    if (!existing) throw createAppError('Promo code not found.', 404);
    return existing;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const result = await db.query<PromoRow>(
    `UPDATE promo_codes
        SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${PROMO_COLS}`,
    params,
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Promo code not found.', 404);

  await writeAudit(
    adminUserId,
    row.id,
    { kind: 'promo_update', code: row.code, patch },
    `Promo code updated: ${row.code}`,
  );
  logger.info('Promo code updated', { id: row.id, adminUserId });

  return mapPromo(row);
}

export async function deactivatePromoCode(
  id: string,
  adminUserId: string,
): Promise<PromoCode> {
  const result = await db.query<PromoRow>(
    `UPDATE promo_codes
        SET active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING ${PROMO_COLS}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Promo code not found.', 404);

  await writeAudit(
    adminUserId,
    row.id,
    { kind: 'promo_deactivate', code: row.code },
    `Promo code deactivated: ${row.code}`,
  );
  logger.info('Promo code deactivated', { id: row.id, adminUserId });

  return mapPromo(row);
}

// ─────────────────────────────────────────────────────────────────
// Campaigns
// ─────────────────────────────────────────────────────────────────

export async function listCampaigns(
  filter?: {
    channel?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: MarketingCampaign[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter?.channel !== undefined) {
    await validateChannel(filter.channel);
    params.push(filter.channel);
    where.push(`channel = $${params.length}`);
  }
  if (filter?.from !== undefined) {
    validateDateString(filter.from, 'from');
    params.push(filter.from);
    where.push(`started_at >= $${params.length}`);
  }
  if (filter?.to !== undefined) {
    validateDateString(filter.to, 'to');
    params.push(filter.to);
    where.push(`started_at <= $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.max(1, Math.min(200, filter?.limit ?? 50));
  const offset = Math.max(0, filter?.offset ?? 0);

  const totalResult = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM marketing_campaigns ${whereSql}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.cnt ?? 0);

  const rowsResult = await db.query<CampaignRow>(
    `SELECT ${CAMPAIGN_COLS}
       FROM marketing_campaigns
       ${whereSql}
      ORDER BY started_at DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows: rowsResult.rows.map(mapCampaign), total };
}

export async function getCampaign(id: string): Promise<MarketingCampaign | null> {
  const result = await db.query<CampaignRow>(
    `SELECT ${CAMPAIGN_COLS} FROM marketing_campaigns WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapCampaign(row) : null;
}

export async function createCampaign(
  input: {
    name: string;
    channel: string;
    startedAt: string;
    endedAt?: string | null;
    spendCentavos?: number;
    notes?: string | null;
  },
  adminUserId: string,
): Promise<MarketingCampaign> {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw createAppError('name is required.', 400);
  }
  await validateChannel(input.channel);
  validateDateString(input.startedAt, 'startedAt');
  if (input.endedAt !== undefined && input.endedAt !== null) {
    validateDateString(input.endedAt, 'endedAt');
    if (Date.parse(input.endedAt) < Date.parse(input.startedAt)) {
      throw createAppError('endedAt must be on or after startedAt.', 400);
    }
  }
  const spend = input.spendCentavos ?? 0;
  validateNonNegativeInt(spend, 'spendCentavos');

  const result = await db.query<CampaignRow>(
    `INSERT INTO marketing_campaigns
       (name, channel, started_at, ended_at, spend_centavos, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${CAMPAIGN_COLS}`,
    [
      input.name.trim(),
      input.channel,
      input.startedAt,
      input.endedAt ?? null,
      spend,
      input.notes ?? null,
      adminUserId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Failed to insert marketing campaign.', 500);

  await writeAudit(
    adminUserId,
    row.id,
    { kind: 'campaign_create', name: row.name, channel: row.channel },
    `Marketing campaign created: ${row.name}`,
  );
  logger.info('Marketing campaign created', { id: row.id, adminUserId });

  return mapCampaign(row);
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    name: string;
    endedAt: string | null;
    spendCentavos: number;
    attributedSignups: number;
    attributedFirstBookings: number;
    attributedRevenueCentavos: number;
    notes: string | null;
  }>,
  adminUserId: string,
): Promise<MarketingCampaign> {
  if (patch.endedAt !== undefined && patch.endedAt !== null) {
    validateDateString(patch.endedAt, 'endedAt');
  }
  if (patch.spendCentavos !== undefined) {
    validateNonNegativeInt(patch.spendCentavos, 'spendCentavos');
  }
  if (patch.attributedSignups !== undefined) {
    validateNonNegativeInt(patch.attributedSignups, 'attributedSignups');
  }
  if (patch.attributedFirstBookings !== undefined) {
    validateNonNegativeInt(patch.attributedFirstBookings, 'attributedFirstBookings');
  }
  if (patch.attributedRevenueCentavos !== undefined) {
    validateNonNegativeInt(
      patch.attributedRevenueCentavos,
      'attributedRevenueCentavos',
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      throw createAppError('name must be a non-empty string.', 400);
    }
    params.push(patch.name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (patch.endedAt !== undefined) {
    params.push(patch.endedAt);
    sets.push(`ended_at = $${params.length}`);
  }
  if (patch.spendCentavos !== undefined) {
    params.push(patch.spendCentavos);
    sets.push(`spend_centavos = $${params.length}`);
  }
  if (patch.attributedSignups !== undefined) {
    params.push(patch.attributedSignups);
    sets.push(`attributed_signups = $${params.length}`);
  }
  if (patch.attributedFirstBookings !== undefined) {
    params.push(patch.attributedFirstBookings);
    sets.push(`attributed_first_bookings = $${params.length}`);
  }
  if (patch.attributedRevenueCentavos !== undefined) {
    params.push(patch.attributedRevenueCentavos);
    sets.push(`attributed_revenue_centavos = $${params.length}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    sets.push(`notes = $${params.length}`);
  }

  if (sets.length === 0) {
    const existing = await getCampaign(id);
    if (!existing) throw createAppError('Marketing campaign not found.', 404);
    return existing;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const result = await db.query<CampaignRow>(
    `UPDATE marketing_campaigns
        SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${CAMPAIGN_COLS}`,
    params,
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Marketing campaign not found.', 404);

  await writeAudit(
    adminUserId,
    row.id,
    { kind: 'campaign_update', name: row.name, patch },
    `Marketing campaign updated: ${row.name}`,
  );
  logger.info('Marketing campaign updated', { id: row.id, adminUserId });

  return mapCampaign(row);
}

// ─────────────────────────────────────────────────────────────────
// Overview / aggregation
// ─────────────────────────────────────────────────────────────────

export async function getMarketingOverview(
  from?: string,
  to?: string,
): Promise<MarketingOverview> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (from !== undefined) {
    validateDateString(from, 'from');
    params.push(from);
    where.push(`started_at >= $${params.length}`);
  }
  if (to !== undefined) {
    validateDateString(to, 'to');
    params.push(to);
    where.push(`started_at <= $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db.query<{
    channel: string;
    spend: string;
    signups: string;
    revenue: string;
  }>(
    `SELECT channel,
            COALESCE(SUM(spend_centavos), 0)::text              AS spend,
            COALESCE(SUM(attributed_signups), 0)::text           AS signups,
            COALESCE(SUM(attributed_revenue_centavos), 0)::text  AS revenue
       FROM marketing_campaigns
       ${whereSql}
      GROUP BY channel
      ORDER BY channel ASC`,
    params,
  );

  let totalSpendCentavos = 0;
  let totalSignups = 0;
  let totalRevenueCentavos = 0;

  const channelBreakdown: ChannelBreakdownRow[] = result.rows.map((r) => {
    const spendCentavos = Number(r.spend);
    const signups = Number(r.signups);
    const revenueCentavos = Number(r.revenue);
    totalSpendCentavos += spendCentavos;
    totalSignups += signups;
    totalRevenueCentavos += revenueCentavos;
    return {
      channel: r.channel,
      spendCentavos,
      signups,
      cpaCentavos: computeCpa(spendCentavos, signups),
      revenueCentavos,
      roiPercent: computeRoiPercent(spendCentavos, revenueCentavos),
    };
  });

  return {
    totalSpendCentavos,
    totalSignups,
    totalRevenueCentavos,
    aggregateCpaCentavos: computeCpa(totalSpendCentavos, totalSignups),
    aggregateRoiPercent: computeRoiPercent(totalSpendCentavos, totalRevenueCentavos),
    channelBreakdown,
  };
}
