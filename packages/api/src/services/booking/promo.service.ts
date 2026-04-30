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
// Per-customer limit (`usage_limit_per_customer`) is NOT enforced by this
// resolver — there is no `promo_redemptions` table in v1.0 to count
// per-user usage. Per-customer enforcement requires the booking-creation
// transaction (D06 — transactional audit completeness) to also write
// a redemption row inside the same transaction. See `D05-closeout.md`
// §"Spec corrections applied" and the D06 plan once written.

import { db } from '../../models/db';
import { createAppError } from '../../middleware/error.middleware';

export const PROMO_ERRORS = {
  promoInvalid: 'promo_invalid',
  promoMinOrderNotMet: 'promo_min_order_not_met',
  promoExhausted: 'promo_exhausted',
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
