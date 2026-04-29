// packages/api/src/services/pricing/cancellation.service.ts
//
// Bug 1170 / 1198 fix verified.
// Phase 14 Dispatch 02.
//
// Cancellation policy is server-canonical (table cancellation_policies,
// migration 071) and admin-editable (settings/CancellationPolicyPage in the
// admin UI). This service is the only entry point that other services use to
// compute cancellation outcomes — never read tier values from configs or
// magic numbers.
//
// Two code paths:
//
//   1. Customer cancels — `calculateCancellation(bookingId, cancelTime)`
//      Looks up the booking's scheduled time, computes hoursBefore, finds
//      the matching tier, returns refund/fee in centavos.
//
//   2. Provider no-shows — `calculateProviderNoShow(bookingId)`
//      Returns 100% refund + the configured platform-funded apology
//      credit (provider_no_show_credit_php on the active policy row).
//      This is NOT a tier; it's a separate rule because the trust
//      asymmetry doesn't fit the tier shape.
//
// Caching: the active policy is read once per 5 minutes from a Redis key.
// Saving a new version (admin POST) MUST call `bustActivePolicyCache()` so
// the next request reads the new policy. Redis-down failure mode: fall
// back to a direct DB read (logged as warning, not an error — the service
// stays correct, just slower).

import { db } from '../../models/db';
import { redis } from '../../config/redis.config';
import { logger } from '../../utils/logger';
import { createAppError } from '../../middleware/error.middleware';

const CACHE_KEY = 'cancellation_policy:active:v1';
const CACHE_TTL_SECONDS = 5 * 60;

export interface CancellationPolicyTier {
  min_hours_before: number;
  max_hours_before: number | null;
  refund_percent: number;
  fee_percent: number;
  label: string;
}

export interface ActiveCancellationPolicy {
  version: number;
  effective_from: string; // ISO
  tiers: CancellationPolicyTier[];
  intro_text: string;
  legal_disclaimer: string;
  provider_no_show_credit_php: number;
}

interface PolicyRow {
  version: number;
  effective_from: Date;
  tiers: CancellationPolicyTier[];
  intro_text: string;
  legal_disclaimer: string;
  provider_no_show_credit_php: number;
}

export interface CancellationCalculation {
  policy_version: number;
  tier_label: string;
  refund_percent: number;
  fee_percent: number;
  refund_amount_centavos: number;
  fee_amount_centavos: number;
  total_charged_centavos: number;
}

export interface ProviderNoShowOutcome {
  policy_version: number;
  refund_amount_centavos: number;
  apology_credit_centavos: number;
  total_charged_centavos: number;
}

/**
 * Fetch the active policy. Cached in Redis for 5 minutes; on Redis miss or
 * Redis error, falls through to a direct DB read.
 */
export async function getActivePolicy(): Promise<ActiveCancellationPolicy> {
  // Try cache first.
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ActiveCancellationPolicy;
    }
  } catch (err) {
    logger.warn('cancellation_policy_cache_read_failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  const result = await db.query<PolicyRow>(
    `SELECT version, effective_from, tiers, intro_text, legal_disclaimer, provider_no_show_credit_php
       FROM cancellation_policies
      WHERE effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
   ORDER BY effective_from DESC, version DESC
      LIMIT 1`,
  );

  if (result.rows.length === 0) {
    throw createAppError('No active cancellation policy. Run migration 071.', 500);
  }

  const row = result.rows[0]!;
  const policy: ActiveCancellationPolicy = {
    version: row.version,
    effective_from: row.effective_from.toISOString(),
    tiers: row.tiers,
    intro_text: row.intro_text,
    legal_disclaimer: row.legal_disclaimer,
    provider_no_show_credit_php: row.provider_no_show_credit_php,
  };

  try {
    await redis.set(CACHE_KEY, JSON.stringify(policy), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn('cancellation_policy_cache_write_failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  return policy;
}

/**
 * Bust the active-policy cache. Called by the admin POST/PUT handlers after
 * persisting a new version so the next request sees the new values.
 */
export async function bustActivePolicyCache(): Promise<void> {
  try {
    await redis.del(CACHE_KEY);
  } catch (err) {
    logger.warn('cancellation_policy_cache_bust_failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

/**
 * Find which tier a given hoursBefore value lands in.
 * Tier matching:
 *   - top tier (max_hours_before === null) matches hoursBefore >= min.
 *   - middle tiers match min <= hoursBefore < max.
 *   - bottom tier matches hoursBefore < its max (post-scheduled / no-show
 *     uses the negative min_hours_before sentinel as a lower bound that
 *     no real value will undercut).
 */
export function findTier(
  hoursBefore: number,
  tiers: CancellationPolicyTier[],
): CancellationPolicyTier | null {
  for (const tier of tiers) {
    const aboveFloor = hoursBefore >= tier.min_hours_before;
    const belowCeiling = tier.max_hours_before === null
      ? true
      : hoursBefore < tier.max_hours_before;
    if (aboveFloor && belowCeiling) {
      return tier;
    }
  }
  return null;
}

interface BookingRow {
  scheduled_at: Date;
  total_amount: string | number;
}

async function loadBooking(bookingId: string): Promise<BookingRow> {
  const result = await db.query<BookingRow>(
    `SELECT scheduled_at, total_amount FROM bookings WHERE id = $1`,
    [bookingId],
  );
  if (result.rows.length === 0) {
    throw createAppError('Booking not found.', 404);
  }
  return result.rows[0]!;
}

/**
 * Compute the refund + fee for a customer-initiated cancellation.
 * total_amount in the bookings table is centavos; the percentages in the
 * tiers are integer 0..100.
 */
export async function calculateCancellation(
  bookingId: string,
  cancelTime: Date = new Date(),
): Promise<CancellationCalculation> {
  const booking = await loadBooking(bookingId);
  const policy = await getActivePolicy();

  const hoursBefore =
    (booking.scheduled_at.getTime() - cancelTime.getTime()) / 3_600_000;

  const tier = findTier(hoursBefore, policy.tiers);
  if (!tier) {
    throw createAppError(
      `No cancellation tier matched hoursBefore=${hoursBefore.toFixed(2)} for policy version ${policy.version}.`,
      500,
    );
  }

  const total = Number(booking.total_amount);
  const refund = Math.floor((total * tier.refund_percent) / 100);
  const fee = total - refund;

  return {
    policy_version: policy.version,
    tier_label: tier.label,
    refund_percent: tier.refund_percent,
    fee_percent: tier.fee_percent,
    refund_amount_centavos: refund,
    fee_amount_centavos: fee,
    total_charged_centavos: total,
  };
}

/**
 * Provider-no-show outcome — separate code path from tier lookup.
 * Customer always receives 100% refund of total_amount AND a platform-funded
 * apology credit in centavos. Credit value lives on the active policy row
 * (provider_no_show_credit_php) so admin can tune it without code changes.
 */
export async function calculateProviderNoShow(
  bookingId: string,
): Promise<ProviderNoShowOutcome> {
  const booking = await loadBooking(bookingId);
  const policy = await getActivePolicy();

  const total = Number(booking.total_amount);
  const apologyCreditCentavos = policy.provider_no_show_credit_php * 100;

  return {
    policy_version: policy.version,
    refund_amount_centavos: total,
    apology_credit_centavos: apologyCreditCentavos,
    total_charged_centavos: total,
  };
}

/**
 * Preview helper — exposed to the admin editor's "what if" pane.
 * Pure function over (hoursBefore, sampleAmount, tiers): no DB, no cache.
 */
export function previewTierForHours(
  hoursBefore: number,
  sampleAmountCentavos: number,
  tiers: CancellationPolicyTier[],
): {
  tier: CancellationPolicyTier | null;
  refund_amount_centavos: number;
  fee_amount_centavos: number;
} {
  const tier = findTier(hoursBefore, tiers);
  if (!tier) {
    return { tier: null, refund_amount_centavos: 0, fee_amount_centavos: 0 };
  }
  const refund = Math.floor((sampleAmountCentavos * tier.refund_percent) / 100);
  const fee = sampleAmountCentavos - refund;
  return { tier, refund_amount_centavos: refund, fee_amount_centavos: fee };
}
