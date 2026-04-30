// Phase 14 Dispatch 05 — surge rule resolver.
//
// Returns the matching pricing rule (highest priority) for a given
// (serviceCategoryId, scheduledAt, city) tuple, or null if no rule matches.
// Internally delegates to the existing services/pricing.service.ts for
// rule matching (rush / holiday / peak_hours logic that already works in
// production via booking.service.ts:102), then queries pricing_rules for
// the platform_surge_share rate (which the legacy function only exposes
// as a centavo amount, not a rate).
//
// Schema-divergence note: PART-3 spec assumes pricing_rules with JSONB
// `scope` (`serviceCategoryIds`, `serviceAreaIds`) and JSONB `schedule`
// (`startsAt`, `endsAt`, `daysOfWeek`). Actual schema (migration 024)
// is FLAT, type-discriminated by `type IN ('rush','holiday','peak_hours')`
// with separate columns per type. The matching logic in legacy
// calculatePricing already handles the actual schema correctly. The
// spec's `addressId` parameter is replaced with `city` (string) because
// that's what the rest of the codebase passes around — the actual
// pricing_rules.service_area_ids matches by city via ILIKE join, not by
// addressId-to-area resolution.
//
// Bug 269 (`platformSurgeShare 0..1` not validated) is the validator-side
// fix landing in subtask 11; this resolver returns whatever the DB has.

import { db } from '../../models/db';
import { calculatePricing as legacyCalculate } from '../pricing.service';

export interface SurgeRule {
  id: string;
  multiplier: number;
  platformSurgeShare: number; // 0..1 share rate, NOT a centavo amount
  ruleName: string;
}

export async function resolveSurgeRule(input: {
  serviceCategoryId: string;
  scheduledAt: string;
  city?: string;
}): Promise<SurgeRule | null> {
  const matched = await legacyCalculate(
    0,
    new Date(input.scheduledAt),
    input.serviceCategoryId,
    input.city,
  );

  if (!matched.appliedRule) {
    return null;
  }

  const shareRes = await db.query<{ platform_surge_share: string }>(
    `SELECT platform_surge_share FROM pricing_rules WHERE id = $1`,
    [matched.appliedRule.id],
  );
  const shareRate = shareRes.rows[0]
    ? Number(shareRes.rows[0].platform_surge_share)
    : 0;

  return {
    id: matched.appliedRule.id,
    multiplier: matched.appliedRule.multiplier,
    platformSurgeShare: Number.isFinite(shareRate) ? shareRate : 0,
    ruleName: matched.appliedRule.name,
  };
}
