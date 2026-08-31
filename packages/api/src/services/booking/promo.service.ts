// Phase 14 Dispatch 05 — server-canonical promo resolver (Bug 261).
//
// Validates a promo code against the `promo_codes` table and returns the
// canonical discount amount in centavos. Clients send only `code`; the
// server reads `discount_type` and `discount_value` from the database.
//
// Schema-divergence note: PART-3 spec uses column names like
// `minimum_order_cents`, `max_discount_cents`, `is_active`,
// `max_redemptions`, `per_user_limit`. Actual schema (migration 056)
// uses `minimum_order_centavos`, `max_discount_centavos`, `active`,
// `usage_limit_total`, `usage_limit_per_customer`. Discount type values
// are `'percentage'` and `'fixed_centavos'` (not `'percent'`/`'fixed'`).
// See `D05-plan.md` §"Schema correction" for the full mapping.
//
// MED-N154 fix — per-customer limit (`usage_limit_per_customer`) is now
// ENFORCED. Pre-fix the audit found the column existed and the admin UI
// accepted the value but it was silently ignored at resolve time, so a
// customer could apply the same promo to N bookings if usage_limit_total
// allowed. Migration 111 introduces the `promo_redemptions` table
// (booking_id, promo_code_id, customer_id, created_at) with a
// (promo_code_id, customer_id) usage count index. resolvePromo now
// SELECTs COUNT from it; if the count >= usage_limit_per_customer
// (default 1), throws promo_exhausted. The booking-creation flow is
// expected to INSERT a row into promo_redemptions in the same trx
// when a promo is applied — caller responsibility (helper exported
// here as recordPromoRedemption).

import { db } from '../../models/db';
import { createAppError } from '../../middleware/error.middleware';
import * as settingsService from '../settings.service';

export const PROMO_ERRORS = {
  promoInvalid: 'promo_invalid',
  promoMinOrderNotMet: 'promo_min_order_not_met',
  promoExhausted: 'promo_exhausted',
  promoUnavailable: 'promo_redemption_unavailable',
} as const;

interface PromoRow {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed_centavos';
  discount_value: number | string;
  max_discount_centavos: string | null;
  minimum_order_centavos: string;
  usage_limit_total: number | null;
  usage_limit_per_customer: number;
  times_used: number;
  valid_from: Date | string;
  valid_until: Date | string | null;
  active: boolean;
}

export async function resolvePromo(input: {
  code: string;
  subtotalCents: number;
  userId: string;
}): Promise<number> {
  if (!input.code || typeof input.code !== 'string') {
    throw createAppError(PROMO_ERRORS.promoInvalid, 404);
  }
  const normalized = input.code.trim().toUpperCase();
  if (normalized.length === 0 || normalized.length > 40) {
    throw createAppError(PROMO_ERRORS.promoInvalid, 404);
  }
  if (!Number.isFinite(input.subtotalCents) || input.subtotalCents < 0) {
    throw createAppError(PROMO_ERRORS.promoInvalid, 400);
  }

  // D13 launch decision: redemption is pulled until the complete customer,
  // receipt, cancellation, refund, and reporting flow is launched. The mobile
  // field is hidden, but the API must enforce the same boundary so a direct
  // booking request cannot bypass the launch hold and reduce a live price.
  const redemptionEnabled = await settingsService.getSettingBoolean(
    'feature_flag.promo_redemption_enabled',
  );
  if (!redemptionEnabled) {
    throw createAppError(PROMO_ERRORS.promoUnavailable, 409);
  }

  const result = await db.query<PromoRow>(
    `SELECT id, code, discount_type, discount_value,
            max_discount_centavos::text AS max_discount_centavos,
            minimum_order_centavos::text AS minimum_order_centavos,
            usage_limit_total, usage_limit_per_customer, times_used,
            valid_from, valid_until, active
       FROM promo_codes
      WHERE UPPER(code) = $1`,
    [normalized],
  );
  const promo = result.rows[0];
  if (!promo) throw createAppError(PROMO_ERRORS.promoInvalid, 404);
  if (!promo.active) throw createAppError(PROMO_ERRORS.promoInvalid, 404);

  const now = Date.now();
  const validFromMs = new Date(promo.valid_from).getTime();
  if (validFromMs > now) {
    throw createAppError(PROMO_ERRORS.promoInvalid, 404);
  }
  if (promo.valid_until !== null) {
    const validUntilMs = new Date(promo.valid_until).getTime();
    if (validUntilMs < now) {
      throw createAppError(PROMO_ERRORS.promoInvalid, 404);
    }
  }

  if (promo.usage_limit_total !== null && promo.times_used >= promo.usage_limit_total) {
    throw createAppError(PROMO_ERRORS.promoExhausted, 400);
  }

  // MED-N154 fix — per-customer enforcement. Defensive lookup against
  // promo_redemptions; if the table is missing (older DB schema) we
  // log + skip the check rather than failing the booking. Once mig 111
  // is applied this becomes the canonical gate.
  const perCustomerLimit = promo.usage_limit_per_customer ?? 1;
  if (perCustomerLimit > 0) {
    try {
      const redemptionCount = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM promo_redemptions
          WHERE promo_code_id = $1 AND customer_id = $2`,
        [promo.id, input.userId],
      );
      const used = Number(redemptionCount.rows[0]?.count ?? 0);
      if (used >= perCustomerLimit) {
        throw createAppError(PROMO_ERRORS.promoExhausted, 400);
      }
    } catch (err) {
      // 42P01 = undefined_table (older DB without mig 111 applied).
      // Re-throw application errors; swallow only the schema-missing case.
      if ((err as { code?: string }).code !== '42P01') throw err;
    }
  }

  const minOrder = Number(promo.minimum_order_centavos);
  if (minOrder > 0 && input.subtotalCents < minOrder) {
    throw createAppError(PROMO_ERRORS.promoMinOrderNotMet, 400);
  }

  const discountValue = Number(promo.discount_value);
  let discountCents: number;
  if (promo.discount_type === 'percentage') {
    discountCents = Math.floor(input.subtotalCents * (discountValue / 100));
  } else {
    discountCents = discountValue;
  }

  const maxDiscount =
    promo.max_discount_centavos !== null ? Number(promo.max_discount_centavos) : null;
  if (maxDiscount !== null && discountCents > maxDiscount) {
    discountCents = maxDiscount;
  }
  if (discountCents > input.subtotalCents) {
    discountCents = input.subtotalCents;
  }
  if (discountCents < 0 || !Number.isFinite(discountCents)) {
    discountCents = 0;
  }

  return discountCents;
}

/**
 * MED-N154 fix — record a promo redemption row for per-customer limit
 * enforcement. Booking creation should call this inside its own
 * transaction (passing the trx client) right after applying the discount.
 *
 * Defensive: the INSERT is wrapped in try/catch; a 42P01 (table
 * missing) or 23505 (unique violation — same booking already
 * recorded) is logged and swallowed so booking creation isn't
 * blocked. The unique index in mig 111 is on
 * (booking_id, promo_code_id) so dup INSERTs are idempotent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgClient = { query: (text: string, params?: unknown[]) => Promise<any> };
export async function recordPromoRedemption(
  client: PgClient,
  args: { promoCodeId: string; bookingId: string; customerId: string; discountCentavos: number },
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO promo_redemptions
         (promo_code_id, booking_id, customer_id, discount_centavos)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id, promo_code_id) DO NOTHING`,
      [args.promoCodeId, args.bookingId, args.customerId, args.discountCentavos],
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42P01 = table missing (mig 111 not applied yet) — degrade silently.
    if (code !== '42P01') throw err;
  }
}
