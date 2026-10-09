import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import {
  resolvePricingRules,
  type PricingRuleRow,
} from './pricing.service';
import type {
  CreatePricingRuleInput,
  PreviewPricingRuleInput,
  UpdatePricingRuleInput,
} from '../validators/admin-pricing-rules.validators';

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

interface PreviewRow {
  id: string;
  pricing_rule_id: string;
  created_by: string;
  rule_updated_at: Date;
  resolver_fingerprint: string;
  sample_inputs: unknown[];
  sample_results: PricingPreviewResult[];
  expires_at: Date;
  created_at: Date;
}

interface CanonicalSubcategoryRow {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  pricing_type: string;
  base_price: string | number | null;
  is_active: boolean;
  category_is_active: boolean;
}

interface ServiceAreaRow {
  id: string;
  name: string;
  city: string;
  province: string;
  status: string;
}

export interface PricingPreviewResult {
  subcategory: { id: string; name: string; categoryId: string; categoryName: string };
  serviceArea: { id: string; name: string; city: string; province: string };
  scheduledAt: string;
  basePrice: number;
  surgeMultiplier: number;
  surgeAmount: number;
  finalPrice: number;
  platformSurgeShare: number;
  providerSurgeShare: number;
  winningRule: ({ id: string; name: string; type: string; multiplier: number } & { isDraft: boolean }) | null;
  matchingRules: Array<{
    id: string;
    name: string;
    type: string;
    multiplier: number;
    priority: number;
    isDraft: boolean;
  }>;
}

export interface PricingPreviewReceipt {
  id: string;
  ruleId: string;
  results: PricingPreviewResult[];
  expiresAt: Date;
  createdAt: Date;
}

function categoryIdFrom(input: CreatePricingRuleInput['categoryScope']): string | null {
  return input.mode === 'category' ? input.categoryId : null;
}

function serviceAreaIdFrom(input: CreatePricingRuleInput['serviceAreaScope']): string | null {
  return input.mode === 'service_area' ? input.serviceAreaId : null;
}

function assertDraft(rule: PricingRuleRow): void {
  if (rule.publication_status !== 'draft') {
    throw createAppError('Only a draft pricing rule can be changed or previewed.', 409);
  }
}

function assertSchedule(rule: PricingRuleRow): void {
  if (rule.type === 'rush' && rule.rush_hours_threshold === null) {
    throw createAppError('Rush pricing requires a threshold.', 400);
  }
  if (rule.type === 'holiday' && rule.holiday_date === null) {
    throw createAppError('Holiday pricing requires a date.', 400);
  }
  if (rule.type === 'peak_hours' && (!rule.peak_start_time || !rule.peak_end_time)) {
    throw createAppError('Peak pricing requires start and end times.', 400);
  }
}

async function lockPublication(client: Queryable): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('onservice:pricing-rule-publication'))`,
  );
}

async function activeRuleFingerprint(client: Queryable): Promise<string> {
  const result = await client.query<{
    id: string;
    updated_at: Date;
    publication_status: string;
    is_active: boolean;
  }>(
    `SELECT id, updated_at, publication_status, is_active
       FROM pricing_rules
      WHERE is_active = TRUE
        AND publication_status IN ('published', 'legacy_active')
      ORDER BY id`,
  );
  return createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
}

async function writeAudit(
  client: Queryable,
  actorId: string,
  ruleId: string,
  reason: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_actions
       (admin_id, action_type, target_type, target_id, details, reason, full_notes)
     VALUES ($1, 'config_changed', 'pricing_rule', $2, $3::jsonb, $4, $4)`,
    [actorId, ruleId, JSON.stringify(details), reason],
  );
}

export async function createPricingRuleDraft(
  input: CreatePricingRuleInput,
  actorId: string,
): Promise<PricingRuleRow> {
  return db.transaction(async (client) => {
    await lockPublication(client);
    const result = await client.query<PricingRuleRow>(
      `INSERT INTO pricing_rules (
         name, type, multiplier, rush_hours_threshold, holiday_date,
         peak_start_time, peak_end_time, peak_days_of_week, category_id,
         service_area_id, priority, platform_surge_share, description,
         is_active, publication_status, created_by, draft_reason
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         FALSE, 'draft', $14, $15
       ) RETURNING *`,
      [
        input.name,
        input.type,
        input.multiplier,
        input.rushHoursThreshold ?? null,
        input.holidayDate ?? null,
        input.peakStartTime ?? null,
        input.peakEndTime ?? null,
        input.peakDaysOfWeek ?? null,
        categoryIdFrom(input.categoryScope),
        serviceAreaIdFrom(input.serviceAreaScope),
        input.priority ?? 0,
        input.platformSurgeShare ?? 0.5,
        input.description ?? '',
        actorId,
        input.reason,
      ],
    );
    const rule = result.rows[0];
    if (!rule) throw createAppError('Pricing-rule draft could not be created.', 500);
    await writeAudit(client, actorId, rule.id, input.reason, {
      op: 'draft_created',
      after: rule,
    });
    return rule;
  });
}

export async function updatePricingRuleDraft(
  ruleId: string,
  input: UpdatePricingRuleInput,
  actorId: string,
): Promise<PricingRuleRow> {
  return db.transaction(async (client) => {
    await lockPublication(client);
    const beforeResult = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    const before = beforeResult.rows[0];
    if (!before) throw createAppError('Pricing rule not found.', 404);
    assertDraft(before);
    if (new Date(before.updated_at).getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      throw createAppError('The pricing-rule draft changed after you opened it. Reload and retry.', 409);
    }

    const assignments: string[] = ['updated_at = NOW()', 'draft_reason = $1'];
    const values: unknown[] = [input.reason];
    const add = (column: string, value: unknown): void => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) add('name', input.name);
    if (input.multiplier !== undefined) add('multiplier', input.multiplier);
    if (input.rushHoursThreshold !== undefined) add('rush_hours_threshold', input.rushHoursThreshold);
    if (input.holidayDate !== undefined) add('holiday_date', input.holidayDate);
    if (input.peakStartTime !== undefined) add('peak_start_time', input.peakStartTime);
    if (input.peakEndTime !== undefined) add('peak_end_time', input.peakEndTime);
    if (input.peakDaysOfWeek !== undefined) add('peak_days_of_week', input.peakDaysOfWeek);
    if (input.categoryScope !== undefined) add('category_id', categoryIdFrom(input.categoryScope));
    if (input.serviceAreaScope !== undefined) add('service_area_id', serviceAreaIdFrom(input.serviceAreaScope));
    if (input.priority !== undefined) add('priority', input.priority);
    if (input.platformSurgeShare !== undefined) add('platform_surge_share', input.platformSurgeShare);
    if (input.description !== undefined) add('description', input.description);
    values.push(ruleId);

    const result = await client.query<PricingRuleRow>(
      `UPDATE pricing_rules
          SET ${assignments.join(', ')}
        WHERE id = $${values.length} AND publication_status = 'draft'
      RETURNING *`,
      values,
    );
    const rule = result.rows[0];
    if (!rule) throw createAppError('Pricing-rule draft changed concurrently. Reload and retry.', 409);
    assertSchedule(rule);
    await writeAudit(client, actorId, rule.id, input.reason, {
      op: 'draft_updated',
      before,
      after: rule,
    });
    return rule;
  });
}

async function loadPreviewSample(
  client: Queryable,
  draft: PricingRuleRow,
  sample: PreviewPricingRuleInput['samples'][number],
  evaluatedAt: Date,
): Promise<PricingPreviewResult> {
  const subcategoryResult = await client.query<CanonicalSubcategoryRow>(
    `SELECT ss.id, ss.name, ss.category_id, sc.name AS category_name,
            ss.pricing_type, ss.base_price, ss.is_active,
            sc.is_active AS category_is_active
       FROM service_subcategories ss
       JOIN service_categories sc ON sc.id = ss.category_id
      WHERE ss.id = $1`,
    [sample.subcategoryId],
  );
  const subcategory = subcategoryResult.rows[0];
  if (!subcategory) throw createAppError('Preview subcategory not found.', 404);
  if (!subcategory.is_active || !subcategory.category_is_active) {
    throw createAppError('Preview requires an active category and subcategory.', 409);
  }
  if (subcategory.pricing_type !== 'fixed' || subcategory.base_price === null) {
    throw createAppError('Surge preview requires a fixed-price subcategory with a canonical base price.', 409);
  }
  const basePrice = Number(subcategory.base_price);
  if (!Number.isSafeInteger(basePrice) || basePrice < 0) {
    throw createAppError('Canonical preview price is outside the supported range.', 409);
  }
  if (draft.category_id && draft.category_id !== subcategory.category_id) {
    throw createAppError('Preview subcategory is outside this draft category scope.', 400);
  }

  const areaResult = await client.query<ServiceAreaRow>(
    `SELECT id, name, city, province, status FROM service_areas WHERE id = $1`,
    [sample.serviceAreaId],
  );
  const area = areaResult.rows[0];
  if (!area) throw createAppError('Preview service area not found.', 404);
  if (area.status === 'retired') throw createAppError('A retired service area cannot be previewed.', 409);
  if (draft.service_area_id && draft.service_area_id !== area.id) {
    throw createAppError('Preview service area is outside this draft area scope.', 400);
  }

  const scheduledAt = new Date(sample.scheduledAt);
  const activeRules = await client.query<PricingRuleRow>(
    `SELECT pr.* FROM pricing_rules pr
       LEFT JOIN service_areas sa ON pr.service_area_id = sa.id
      WHERE pr.is_active = TRUE
        AND pr.publication_status IN ('published', 'legacy_active')
        AND (pr.category_id IS NULL OR pr.category_id = $1)
        AND (pr.service_area_id IS NULL OR sa.city ILIKE $2)`,
    [subcategory.category_id, `%${area.city}%`],
  );
  const resolution = resolvePricingRules(
    basePrice,
    scheduledAt,
    [...activeRules.rows.filter((rule) => rule.id !== draft.id), draft],
    evaluatedAt,
  );
  return {
    subcategory: {
      id: subcategory.id,
      name: subcategory.name,
      categoryId: subcategory.category_id,
      categoryName: subcategory.category_name,
    },
    serviceArea: { id: area.id, name: area.name, city: area.city, province: area.province },
    scheduledAt: sample.scheduledAt,
    basePrice: resolution.basePrice,
    surgeMultiplier: resolution.surgeMultiplier,
    surgeAmount: resolution.surgeAmount,
    finalPrice: resolution.finalPrice,
    platformSurgeShare: resolution.platformSurgeShare,
    providerSurgeShare: resolution.providerSurgeShare,
    winningRule: resolution.appliedRule
      ? { ...resolution.appliedRule, isDraft: resolution.appliedRule.id === draft.id }
      : null,
    matchingRules: resolution.matchingRules.map((rule) => ({
      ...rule,
      isDraft: rule.id === draft.id,
    })),
  };
}

export async function previewPricingRuleDraft(
  ruleId: string,
  input: PreviewPricingRuleInput,
  actorId: string,
): Promise<PricingPreviewReceipt> {
  return db.transaction(async (client) => {
    await lockPublication(client);
    const draftResult = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    const draft = draftResult.rows[0];
    if (!draft) throw createAppError('Pricing rule not found.', 404);
    assertDraft(draft);
    assertSchedule(draft);

    const fingerprint = await activeRuleFingerprint(client);
    const evaluatedAt = new Date();
    const results: PricingPreviewResult[] = [];
    for (const sample of input.samples) {
      results.push(await loadPreviewSample(client, draft, sample, evaluatedAt));
    }
    if (!results.some((result) => result.winningRule?.isDraft === true)) {
      throw createAppError(
        'The draft did not win any preview sample. Adjust the sample, scope, schedule, or priority before publication.',
        409,
      );
    }

    const inserted = await client.query<PreviewRow>(
      `INSERT INTO pricing_rule_previews
         (pricing_rule_id, created_by, rule_updated_at, resolver_fingerprint,
          sample_inputs, sample_results)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING *`,
      [
        ruleId,
        actorId,
        draft.updated_at,
        fingerprint,
        JSON.stringify(input.samples),
        JSON.stringify(results),
      ],
    );
    const preview = inserted.rows[0];
    if (!preview) throw createAppError('Pricing preview could not be recorded.', 500);
    return {
      id: preview.id,
      ruleId: preview.pricing_rule_id,
      results,
      expiresAt: preview.expires_at,
      createdAt: preview.created_at,
    };
  });
}

export async function publishPricingRuleDraft(
  ruleId: string,
  input: { previewId: string; reason: string },
  actorId: string,
): Promise<PricingRuleRow> {
  return db.transaction(async (client) => {
    await lockPublication(client);
    const draftResult = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    const draft = draftResult.rows[0];
    if (!draft) throw createAppError('Pricing rule not found.', 404);
    assertDraft(draft);

    const previewResult = await client.query<PreviewRow>(
      `SELECT * FROM pricing_rule_previews
        WHERE id = $1 AND pricing_rule_id = $2 AND created_by = $3
        FOR UPDATE`,
      [input.previewId, ruleId, actorId],
    );
    const preview = previewResult.rows[0];
    if (!preview) throw createAppError('A current preview by this operator is required.', 409);
    if (new Date(preview.expires_at).getTime() <= Date.now()) {
      throw createAppError('The pricing preview expired. Run it again before publishing.', 409);
    }
    if (new Date(preview.rule_updated_at).getTime() !== new Date(draft.updated_at).getTime()) {
      throw createAppError('The draft changed after preview. Run the preview again.', 409);
    }
    const fingerprint = await activeRuleFingerprint(client);
    if (fingerprint !== preview.resolver_fingerprint) {
      throw createAppError('Published pricing rules changed after preview. Run the preview again.', 409);
    }

    const updated = await client.query<PricingRuleRow>(
      `UPDATE pricing_rules
          SET publication_status = 'published', is_active = TRUE,
              published_by = $1, published_at = NOW(), publish_reason = $2,
              updated_at = NOW()
        WHERE id = $3 AND publication_status = 'draft'
      RETURNING *`,
      [actorId, input.reason, ruleId],
    );
    const published = updated.rows[0];
    if (!published) throw createAppError('Pricing-rule draft changed concurrently. Reload and retry.', 409);
    await writeAudit(client, actorId, ruleId, input.reason, {
      op: 'published',
      previewId: preview.id,
      previewCreatedAt: preview.created_at,
      previewResults: preview.sample_results,
      before: draft,
      after: published,
    });
    logger.info('Pricing rule published', { ruleId, actorId, previewId: preview.id });
    return published;
  });
}

export async function retirePricingRule(
  ruleId: string,
  input: { reason: string },
  actorId: string,
): Promise<PricingRuleRow> {
  return db.transaction(async (client) => {
    await lockPublication(client);
    const beforeResult = await client.query<PricingRuleRow>(
      `SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE`,
      [ruleId],
    );
    const before = beforeResult.rows[0];
    if (!before) throw createAppError('Pricing rule not found.', 404);
    if (before.publication_status === 'retired') {
      throw createAppError('Pricing rule is already retired.', 409);
    }

    const updated = await client.query<PricingRuleRow>(
      `UPDATE pricing_rules
          SET publication_status = 'retired', is_active = FALSE,
              retired_by = $1, retired_at = NOW(), retire_reason = $2,
              updated_at = NOW()
        WHERE id = $3 AND publication_status <> 'retired'
      RETURNING *`,
      [actorId, input.reason, ruleId],
    );
    const retired = updated.rows[0];
    if (!retired) throw createAppError('Pricing rule changed concurrently. Reload and retry.', 409);
    await writeAudit(client, actorId, ruleId, input.reason, {
      op: 'retired',
      before,
      after: retired,
    });
    logger.info('Pricing rule retired', { ruleId, actorId });
    return retired;
  });
}
