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

export async function createPricingRule(
  params: CreatePricingRuleParams,
  // MED-N110 fix — acting admin id required so we can write the
  // admin_actions audit row alongside the INSERT in a single trx.
  // Pre-fix: pricing rules were created without any audit trail; an
  // admin spinning up a 5x surge had no record of who did it.
  // Optional for back-compat with legacy callers (tests, scripts);
  // when omitted, the audit row is skipped and a warning is logged.
  createdByAdminId?: string,
): Promise<PricingRuleRow> {
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

  const created = await db.transaction(async (client) => {
    const result = await client.query<PricingRuleRow>(
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
    if (createdByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'pricing_rule', $2, $3::jsonb)`,
        [
          createdByAdminId,
          result.rows[0]!.id,
          JSON.stringify({
            op: 'create',
            after: result.rows[0],
          }),
        ],
      );
    } else {
      logger.warn('createPricingRule: no createdByAdminId; audit row skipped', {
        ruleId: result.rows[0]!.id,
      });
    }
    return result.rows[0]!;
  });

  logger.info('Pricing rule created', { ruleId: created.id, type: params.type });
  return created;
}

export async function updatePricingRule(
  ruleId: string,
  updates: Partial<Omit<CreatePricingRuleParams, 'type'>>,
  // MED-N111 fix — acting admin id required for audit trail.
  updatedByAdminId?: string,
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
  const updated = await db.transaction(async (client) => {
    const before = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    if (before.rows.length === 0) {
      throw createAppError('Pricing rule not found.', 404);
    }
    const result = await client.query<PricingRuleRow>(
      `UPDATE pricing_rules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) {
      throw createAppError('Pricing rule not found.', 404);
    }
    if (updatedByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'pricing_rule', $2, $3::jsonb)`,
        [
          updatedByAdminId,
          ruleId,
          JSON.stringify({
            op: 'update',
            before: before.rows[0],
            after: result.rows[0],
            changes: updates,
          }),
        ],
      );
    } else {
      logger.warn('updatePricingRule: no updatedByAdminId; audit row skipped', { ruleId });
    }
    return result.rows[0]!;
  });
  return updated;
}

export async function togglePricingRule(
  ruleId: string,
  isActive: boolean,
  // MED-N111 fix — acting admin id for audit trail.
  toggledByAdminId?: string,
): Promise<PricingRuleRow> {
  return db.transaction(async (client) => {
    const before = await client.query<{ is_active: boolean }>(
      `SELECT is_active FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    if (before.rows.length === 0) {
      throw createAppError('Pricing rule not found.', 404);
    }
    const result = await client.query<PricingRuleRow>(
      `UPDATE pricing_rules SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isActive, ruleId],
    );
    if (toggledByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'pricing_rule', $2, $3::jsonb)`,
        [
          toggledByAdminId,
          ruleId,
          JSON.stringify({
            op: 'toggle',
            before: { is_active: before.rows[0]!.is_active },
            after: { is_active: isActive },
          }),
        ],
      );
    } else {
      logger.warn('togglePricingRule: no toggledByAdminId; audit row skipped', { ruleId });
    }
    return result.rows[0]!;
  });
}

export async function deletePricingRule(
  ruleId: string,
  // MED-N111 fix — acting admin id for audit trail.
  deletedByAdminId?: string,
): Promise<void> {
  await db.transaction(async (client) => {
    const before = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    if (before.rows.length === 0) {
      throw createAppError('Pricing rule not found.', 404);
    }
    const result = await client.query(
      `DELETE FROM pricing_rules WHERE id = $1`,
      [ruleId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw createAppError('Pricing rule not found.', 404);
    }
    if (deletedByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'pricing_rule', $2, $3::jsonb)`,
        [
          deletedByAdminId,
          ruleId,
          JSON.stringify({
            op: 'delete',
            before: before.rows[0],
          }),
        ],
      );
    } else {
      logger.warn('deletePricingRule: no deletedByAdminId; audit row skipped', { ruleId });
    }
  });
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
  // MED-N112 fix — replace the toLocaleString round-trip with
  // Intl.DateTimeFormat parts. The pre-fix code did
  //   new Date(date.toLocaleString('en-US', { timeZone: ... }))
  // which formats to a localized string then re-parses — fragile
  // around DST edges and locale-specific date formats. Direct parts
  // extraction avoids both round-trips. Pattern matches
  // vat-report.service.ts:117-128 (the canonical timezone-aware path
  // in the codebase).
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: platformConfig.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const partsByType = new Map<string, string>();
  for (const p of partsFmt.formatToParts(scheduledDate)) {
    partsByType.set(p.type, p.value);
  }
  const scheduledHour = Number(partsByType.get('hour') ?? '0');
  // Intl emits '24' for midnight in some locales — normalize to 0.
  const normalizedHour = scheduledHour === 24 ? 0 : scheduledHour;
  const scheduledMinutes = normalizedHour * 60 + Number(partsByType.get('minute') ?? '0');
  const WEEKDAY_TO_INDEX: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const scheduledDayOfWeek = WEEKDAY_TO_INDEX[partsByType.get('weekday') ?? 'Sun'] ?? 0;
  // Date string in target timezone (YYYY-MM-DD).
  const scheduledDateStr = `${partsByType.get('year')}-${partsByType.get('month')}-${partsByType.get('day')}`;

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
