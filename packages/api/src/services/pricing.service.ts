import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

// --- Interfaces ---

interface PricingRuleRow {
  id: string;
  name: string;
  type: 'rush' | 'holiday' | 'peak_hours';
  multiplier: string;
  rush_hours_threshold: number | null;
  holiday_date: string | null;
  peak_start_time: string | null;
  peak_end_time: string | null;
  peak_days_of_week: number[] | null;
  category_id: string | null;
  service_area_id: string | null;
  is_active: boolean;
  priority: number;
  platform_surge_share: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}

export interface PricingResult {
  basePrice: number;
  surgeMultiplier: number;
  surgeAmount: number;
  finalPrice: number;
  appliedRule: { id: string; name: string; type: string; multiplier: number } | null;
  platformSurgeShare: number;
  providerSurgeShare: number;
}

interface CreatePricingRuleParams {
  name: string;
  type: 'rush' | 'holiday' | 'peak_hours';
  multiplier: number;
  rushHoursThreshold?: number;
  holidayDate?: string;
  peakStartTime?: string;
  peakEndTime?: string;
  peakDaysOfWeek?: number[];
  categoryId?: string;
  serviceAreaId?: string;
  priority?: number;
  platformSurgeShare?: number;
  description?: string;
}

// --- Admin CRUD ---

export async function createPricingRule(params: CreatePricingRuleParams): Promise<PricingRuleRow> {
  if (params.multiplier < 1.0 || params.multiplier > 5.0) {
    throw createAppError('Multiplier must be between 1.0 and 5.0.', 400);
  }

  if (params.type === 'rush' && !params.rushHoursThreshold) {
    throw createAppError('Rush pricing requires rushHoursThreshold.', 400);
  }
  if (params.type === 'holiday' && !params.holidayDate) {
    throw createAppError('Holiday pricing requires holidayDate.', 400);
  }
  if (params.type === 'peak_hours' && (!params.peakStartTime || !params.peakEndTime)) {
    throw createAppError('Peak hours pricing requires peakStartTime and peakEndTime.', 400);
  }

  const result = await db.query<PricingRuleRow>(
    `INSERT INTO pricing_rules
       (name, type, multiplier, rush_hours_threshold, holiday_date,
        peak_start_time, peak_end_time, peak_days_of_week,
        category_id, service_area_id, priority, platform_surge_share, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      params.name,
      params.type,
      params.multiplier,
      params.rushHoursThreshold ?? null,
      params.holidayDate ?? null,
      params.peakStartTime ?? null,
      params.peakEndTime ?? null,
      params.peakDaysOfWeek ?? null,
      params.categoryId ?? null,
      params.serviceAreaId ?? null,
      params.priority ?? 0,
      params.platformSurgeShare ?? 0.50,
      params.description ?? '',
    ],
  );

  logger.info('Pricing rule created', { ruleId: result.rows[0]!.id, type: params.type });
  return result.rows[0]!;
}

export async function updatePricingRule(
  ruleId: string,
  updates: Partial<Omit<CreatePricingRuleParams, 'type'>>,
): Promise<PricingRuleRow> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.multiplier !== undefined) {
    if (updates.multiplier < 1.0 || updates.multiplier > 5.0) {
      throw createAppError('Multiplier must be between 1.0 and 5.0.', 400);
    }
    setClauses.push(`multiplier = $${paramIndex++}`);
    values.push(updates.multiplier);
  }
  if (updates.rushHoursThreshold !== undefined) {
    setClauses.push(`rush_hours_threshold = $${paramIndex++}`);
    values.push(updates.rushHoursThreshold);
  }
  if (updates.holidayDate !== undefined) {
    setClauses.push(`holiday_date = $${paramIndex++}`);
    values.push(updates.holidayDate);
  }
  if (updates.peakStartTime !== undefined) {
    setClauses.push(`peak_start_time = $${paramIndex++}`);
    values.push(updates.peakStartTime);
  }
  if (updates.peakEndTime !== undefined) {
    setClauses.push(`peak_end_time = $${paramIndex++}`);
    values.push(updates.peakEndTime);
  }
  if (updates.peakDaysOfWeek !== undefined) {
    setClauses.push(`peak_days_of_week = $${paramIndex++}`);
    values.push(updates.peakDaysOfWeek);
  }
  if (updates.categoryId !== undefined) {
    setClauses.push(`category_id = $${paramIndex++}`);
    values.push(updates.categoryId);
  }
  if (updates.serviceAreaId !== undefined) {
    setClauses.push(`service_area_id = $${paramIndex++}`);
    values.push(updates.serviceAreaId);
  }
  if (updates.priority !== undefined) {
    setClauses.push(`priority = $${paramIndex++}`);
    values.push(updates.priority);
  }
  if (updates.platformSurgeShare !== undefined) {
    setClauses.push(`platform_surge_share = $${paramIndex++}`);
    values.push(updates.platformSurgeShare);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }

  values.push(ruleId);
  const result = await db.query<PricingRuleRow>(
    `UPDATE pricing_rules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    throw createAppError('Pricing rule not found.', 404);
  }

  return result.rows[0]!;
}

export async function togglePricingRule(ruleId: string, isActive: boolean): Promise<PricingRuleRow> {
  const result = await db.query<PricingRuleRow>(
    `UPDATE pricing_rules SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [isActive, ruleId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Pricing rule not found.', 404);
  }

  return result.rows[0]!;
}

export async function deletePricingRule(ruleId: string): Promise<void> {
  const result = await db.query(
    `DELETE FROM pricing_rules WHERE id = $1`,
    [ruleId],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createAppError('Pricing rule not found.', 404);
  }
}

export async function listPricingRules(filters?: {
  type?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: PricingRuleRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.type) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(filters.type);
  }
  if (filters?.isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    params.push(filters.isActive);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = filters?.page ?? 1;
  const pageSize = Math.min(filters?.pageSize ?? platformConfig.defaultPageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules ${whereClause}
       ORDER BY priority DESC, created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pricing_rules ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getPricingRuleById(ruleId: string): Promise<PricingRuleRow> {
  const result = await db.query<PricingRuleRow>(
    `SELECT * FROM pricing_rules WHERE id = $1`,
    [ruleId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Pricing rule not found.', 404);
  }

  return result.rows[0]!;
}

// --- Pricing Calculation Engine ---

export async function calculatePricing(
  basePrice: number,
  scheduledAt: Date,
  categoryId: string,
  city?: string,
): Promise<PricingResult> {
  const rules = await db.query<PricingRuleRow>(
    `SELECT pr.* FROM pricing_rules pr
     LEFT JOIN service_areas sa ON pr.service_area_id = sa.id
     WHERE pr.is_active = TRUE
       AND (pr.category_id IS NULL OR pr.category_id = $1)
       AND (pr.service_area_id IS NULL OR sa.city ILIKE $2)
     ORDER BY pr.priority DESC, pr.multiplier DESC`,
    [categoryId, city ? `%${city}%` : '%'],
  );

  if (rules.rows.length === 0) {
    return {
      basePrice,
      surgeMultiplier: 1.0,
      surgeAmount: 0,
      finalPrice: basePrice,
      appliedRule: null,
      platformSurgeShare: 0,
      providerSurgeShare: 0,
    };
  }

  const scheduledDate = scheduledAt;
  const hoursUntilScheduled = (scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60);
  const scheduledInManila = new Date(scheduledDate.toLocaleString('en-US', { timeZone: platformConfig.timezone }));
  const scheduledHour = scheduledInManila.getHours();
  const scheduledMinutes = scheduledHour * 60 + scheduledInManila.getMinutes();
  const scheduledDayOfWeek = scheduledInManila.getDay();
  const scheduledDateStr = scheduledDate.toISOString().split('T')[0]!;

  let bestRule: PricingRuleRow | null = null;

  for (const rule of rules.rows) {
    let matches = false;

    switch (rule.type) {
      case 'rush': {
        if (rule.rush_hours_threshold !== null && hoursUntilScheduled <= rule.rush_hours_threshold) {
          matches = true;
        }
        break;
      }
      case 'holiday': {
        if (rule.holiday_date !== null && scheduledDateStr === String(rule.holiday_date).split('T')[0]) {
          matches = true;
        }
        break;
      }
      case 'peak_hours': {
        if (rule.peak_start_time && rule.peak_end_time) {
          const [startH, startM] = rule.peak_start_time.split(':').map(Number);
          const [endH, endM] = rule.peak_end_time.split(':').map(Number);
          const ruleStart = (startH ?? 0) * 60 + (startM ?? 0);
          const ruleEnd = (endH ?? 0) * 60 + (endM ?? 0);
          const timeInRange = ruleStart <= ruleEnd
            ? scheduledMinutes >= ruleStart && scheduledMinutes < ruleEnd
            : scheduledMinutes >= ruleStart || scheduledMinutes < ruleEnd;

          const dayMatches = !rule.peak_days_of_week ||
            rule.peak_days_of_week.length === 0 ||
            rule.peak_days_of_week.includes(scheduledDayOfWeek);

          if (timeInRange && dayMatches) {
            matches = true;
          }
        }
        break;
      }
    }

    if (matches) {
      bestRule = rule;
      break;
    }
  }

  if (!bestRule) {
    return {
      basePrice,
      surgeMultiplier: 1.0,
      surgeAmount: 0,
      finalPrice: basePrice,
      appliedRule: null,
      platformSurgeShare: 0,
      providerSurgeShare: 0,
    };
  }

  const multiplier = Number(bestRule.multiplier);
  const surgeAmount = Math.round(basePrice * (multiplier - 1));
  const finalPrice = basePrice + surgeAmount;
  const shareRate = Number(bestRule.platform_surge_share);

  return {
    basePrice,
    surgeMultiplier: multiplier,
    surgeAmount,
    finalPrice,
    appliedRule: {
      id: bestRule.id,
      name: bestRule.name,
      type: bestRule.type,
      multiplier,
    },
    platformSurgeShare: Math.round(surgeAmount * shareRate),
    providerSurgeShare: Math.round(surgeAmount * (1 - shareRate)),
  };
}

export async function getUpcomingHolidays(
  days = 90,
): Promise<Array<{ id: string; name: string; date: string; multiplier: number }>> {
  const result = await db.query<PricingRuleRow>(
    `SELECT * FROM pricing_rules
     WHERE type = 'holiday' AND is_active = TRUE
       AND holiday_date >= CURRENT_DATE
       AND holiday_date <= CURRENT_DATE + INTERVAL '1 day' * $1
     ORDER BY holiday_date ASC`,
    [days],
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    date: String(r.holiday_date).split('T')[0]!,
    multiplier: Number(r.multiplier),
  }));
}

// --- Formatters ---

export function formatPricingRule(r: PricingRuleRow): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    multiplier: Number(r.multiplier),
    rushHoursThreshold: r.rush_hours_threshold,
    holidayDate: r.holiday_date ? String(r.holiday_date).split('T')[0] : null,
    peakStartTime: r.peak_start_time,
    peakEndTime: r.peak_end_time,
    peakDaysOfWeek: r.peak_days_of_week,
    categoryId: r.category_id,
    serviceAreaId: r.service_area_id,
    isActive: r.is_active,
    priority: r.priority,
    platformSurgeShare: Number(r.platform_surge_share),
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
