// Phase 14 Dispatch 05 — server-canonical booking-pricing resolver.
// Bug 175 (servicePrice from client) + Bug 176 (addon prices from client).
//
// Architecture: clients send IDs and quantities only; this service computes
// the canonical price from the database. No code path that records money
// may bypass this resolver.
//
// Schema-divergence note: PART-3 spec assumes table `subcategories` with
// columns `base_price_cents` etc. and a Kysely query API. Per
// `.ai-coder/decisions/D05-spec-vs-schema.md` (Ken's Option A, 2026-04-30)
// the actual schema is `service_subcategories` with `base_price` (no
// `_cents` suffix; centavos by convention) and the codebase uses raw
// `db.query` (pg style). See `D05-plan.md` §"Schema correction" for the
// full mapping.

import { db } from '../../models/db';
import { createAppError } from '../../middleware/error.middleware';
import { getSettingNumber } from '../settings.service';
import { calculatePricing as resolveSurgeLegacy } from '../pricing.service';
import { resolvePromo, PROMO_ERRORS } from './promo.service';

export interface BookingPricingInput {
  userId: string;
  serviceCategoryId: string;
  subcategoryId: string;
  addons: Array<{ addonId: string; quantity: number }>;
  scheduledAt: string;
  city?: string;
  promoCode?: string;
  // D27 Phase 4b — required for hourly subcategories; the customer's estimate.
  estimatedHours?: number;
}

// D27 Phase 4b — hourly config snapshot for a subcategory.
export interface HourlyConfig {
  hourlyRate: number; // centavos per hour
  minBillableMinutes: number;
  billingIncrementMinutes: number;
  maxEstimatedHours: number;
}

export interface HourlyCap {
  cappedHours: number; // rounded, authorized hours (also stored as estimated_hours)
  amountCents: number; // cappedHours x hourlyRate (the pre-authorized base)
}

/**
 * Round an hours value UP to the billing increment, floor it at the minimum
 * billable, and (for the customer's estimate) clamp to the subcategory max.
 * Pure + shared by the booking-create path, the preview path, and settlement so
 * they can never diverge (the Bug 175/176 server-canonical lesson).
 */
export function roundBillableHours(hours: number, cfg: HourlyConfig): number {
  const incr = cfg.billingIncrementMinutes > 0 ? cfg.billingIncrementMinutes : 30;
  const minMin = cfg.minBillableMinutes > 0 ? cfg.minBillableMinutes : 60;
  const minutes = Math.max(Math.ceil((hours * 60) / incr) * incr, minMin);
  return minutes / 60;
}

// D27 Phase 4b — pure settlement math (extracted so the money rules are unit-
// testable without the wallet machinery). Bills min(actual, estimated) hours
// where actual comes ONLY from the server-clocked timestamps, then scales the
// booking amount proportionally and returns the unused remainder to refund.
export interface HourlySettlementInput {
  workStartedAt: Date | null;
  workCompletedAt: Date | null;
  estimatedHours: number;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  minBillableMinutes: number;
  billingIncrementMinutes: number;
}

export interface HourlySettlement {
  actualHours: number;
  billedHours: number;
  newServicePrice: number;
  newServiceFee: number;
  newTotal: number;
  refundRemainder: number;
}

export function computeHourlySettlement(i: HourlySettlementInput): HourlySettlement {
  const incr = i.billingIncrementMinutes > 0 ? i.billingIncrementMinutes : 30;
  const minMin = i.minBillableMinutes > 0 ? i.minBillableMinutes : 60;
  let actualHours: number;
  if (i.workStartedAt && i.workCompletedAt) {
    const elapsedMin = Math.max(0, (i.workCompletedAt.getTime() - i.workStartedAt.getTime()) / 60000);
    actualHours = (Math.max(Math.ceil(elapsedMin / incr) * incr, minMin)) / 60;
  } else {
    // Provider never started the clock — bill only the minimum.
    actualHours = minMin / 60;
  }
  // THE CAP — never bill beyond the customer's authorization.
  const billedHours = Math.min(actualHours, i.estimatedHours);
  const proportion = i.estimatedHours > 0 ? billedHours / i.estimatedHours : 0;
  const newServicePrice = Math.round(i.servicePrice * proportion);
  const newServiceFee = Math.round(i.serviceFee * proportion);
  const newTotal = newServicePrice + newServiceFee;
  const refundRemainder = Math.max(0, i.totalAmount - newTotal);
  return { actualHours, billedHours, newServicePrice, newServiceFee, newTotal, refundRemainder };
}

export function resolveHourlyCap(estimatedHours: number, cfg: HourlyConfig): HourlyCap {
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
    throw createAppError('hourly_estimate_required', 400);
  }
  if (estimatedHours > cfg.maxEstimatedHours) {
    throw createAppError('hourly_estimate_exceeds_max', 400);
  }
  if (!Number.isFinite(cfg.hourlyRate) || cfg.hourlyRate <= 0) {
    throw createAppError('hourly_rate_not_configured', 400);
  }
  const cappedHours = roundBillableHours(estimatedHours, cfg);
  return { cappedHours, amountCents: Math.round(cappedHours * cfg.hourlyRate) };
}

export interface ResolvedPricing {
  servicePriceCents: number;
  addonsCents: number;
  surgeAmountCents: number;
  surgeRuleId: string | null;
  promoDiscountCents: number;
  serviceFeeCents: number;
  totalAmountCents: number;
  breakdown: Array<{ label: string; amountCents: number }>;
}

interface SubcategoryRow {
  id: string;
  pricing_type: 'fixed' | 'quote' | 'hourly' | 'per_unit';
  base_price: number | string | null;
  is_active: boolean;
  hourly_rate: number | string | null;
  min_billable_minutes: number | string | null;
  billing_increment_minutes: number | string | null;
  max_estimated_hours: number | string | null;
}

interface AddonRow {
  id: string;
  subcategory_id: string;
  price: number | string;
  is_active: boolean;
  name: string;
}

export const PRICING_ERRORS = {
  subcategoryNotFound: 'subcategory_not_found',
  subcategoryInactive: 'subcategory_inactive',
  subcategoryQuoteRequired: 'subcategory_quote_required',
  subcategoryPricingTypeUnsupported: 'subcategory_pricing_type_unsupported',
  subcategoryNoBasePrice: 'subcategory_no_base_price',
  addonNotFound: 'addon_not_found',
  addonSubcategoryMismatch: 'addon_subcategory_mismatch',
  addonInactive: 'addon_inactive',
  addonQuantityInvalid: 'addon_quantity_invalid',
  pricingResolutionInvalid: 'pricing_resolution_invalid',
} as const;

export async function resolvePricing(input: BookingPricingInput): Promise<ResolvedPricing> {
  const subcatRes = await db.query<SubcategoryRow>(
    `SELECT id, pricing_type, base_price, is_active,
            hourly_rate, min_billable_minutes, billing_increment_minutes, max_estimated_hours
       FROM service_subcategories WHERE id = $1`,
    [input.subcategoryId],
  );

  if (subcatRes.rows.length === 0) {
    throw createAppError(PRICING_ERRORS.subcategoryNotFound, 404);
  }
  const subcat = subcatRes.rows[0]!;
  if (!subcat.is_active) {
    throw createAppError(PRICING_ERRORS.subcategoryInactive, 400);
  }
  if (subcat.pricing_type === 'quote') {
    throw createAppError(PRICING_ERRORS.subcategoryQuoteRequired, 400);
  }
  // D27 Phase 4 — per-unit services are quoted by the provider, never priced
  // up front from a self-reported quantity. Route them to the quote flow.
  if (subcat.pricing_type === 'per_unit') {
    throw createAppError(PRICING_ERRORS.subcategoryQuoteRequired, 400);
  }
  // D27 Phase 4b — hourly: the base is the capped pre-authorization
  // (rounded estimatedHours x hourly_rate). Shared resolveHourlyCap keeps the
  // preview and the booking-create path identical.
  let servicePriceCents: number;
  if (subcat.pricing_type === 'hourly') {
    const cap = resolveHourlyCap(Number(input.estimatedHours), {
      hourlyRate: Number(subcat.hourly_rate),
      minBillableMinutes: Number(subcat.min_billable_minutes ?? 60),
      billingIncrementMinutes: Number(subcat.billing_increment_minutes ?? 30),
      maxEstimatedHours: Number(subcat.max_estimated_hours ?? 8),
    });
    servicePriceCents = cap.amountCents;
  } else {
    if (subcat.base_price === null || subcat.base_price === undefined) {
      throw createAppError(PRICING_ERRORS.subcategoryNoBasePrice, 400);
    }
    servicePriceCents = Number(subcat.base_price);
    if (!Number.isFinite(servicePriceCents) || servicePriceCents < 0) {
      throw createAppError(PRICING_ERRORS.subcategoryNoBasePrice, 400);
    }
  }

  let addonsCents = 0;
  const addonBreakdown: Array<{ label: string; amountCents: number }> = [];
  if (input.addons && input.addons.length > 0) {
    for (const a of input.addons) {
      if (
        !Number.isInteger(a.quantity) ||
        !Number.isFinite(a.quantity) ||
        a.quantity < 1 ||
        a.quantity > 100
      ) {
        throw createAppError(PRICING_ERRORS.addonQuantityInvalid, 400);
      }
    }
    const addonIds = input.addons.map((a) => a.addonId);
    const addonRes = await db.query<AddonRow>(
      `SELECT id, subcategory_id, price, is_active, name FROM service_addons WHERE id = ANY($1::uuid[])`,
      [addonIds],
    );
    const addonMap = new Map(addonRes.rows.map((r) => [r.id, r]));
    for (const requested of input.addons) {
      const found = addonMap.get(requested.addonId);
      if (!found) {
        throw createAppError(PRICING_ERRORS.addonNotFound, 404);
      }
      if (!found.is_active) {
        throw createAppError(PRICING_ERRORS.addonInactive, 400);
      }
      if (found.subcategory_id !== input.subcategoryId) {
        throw createAppError(PRICING_ERRORS.addonSubcategoryMismatch, 400);
      }
      const lineCents = Number(found.price) * requested.quantity;
      addonsCents += lineCents;
      addonBreakdown.push({
        label: requested.quantity > 1 ? `${found.name} x${requested.quantity}` : found.name,
        amountCents: lineCents,
      });
    }
  }

  // Surge: delegated to existing services/pricing.service.ts for now.
  // TODO(d05-subtask-4): replace with `resolveSurgeRule()` from
  // services/booking/surge.service.ts.
  const surgeBase = servicePriceCents + addonsCents;
  const surge = await resolveSurgeLegacy(
    surgeBase,
    new Date(input.scheduledAt),
    input.serviceCategoryId,
    input.city,
  );
  const surgeAmountCents = surge.surgeAmount;
  const surgeRuleId = surge.appliedRule?.id ?? null;

  // CRIT-N15 fix: actually resolve the promo discount via promo.service
  // when the customer supplied a code. Pre-fix this returned 0 always, so
  // pricing-preview disagreed with createBooking (which DID call
  // resolvePromo). Customer saw the wrong price in the preview screen,
  // and bookings could fail with promo_min_order_not_met after the user
  // saw "you can book this".
  //
  // Subtotal that promo eligibility tests against is base + addons + surge
  // (not including service fee — that's the same convention booking.service
  // uses at line ~196 of the createBooking flow).
  let promoDiscountCents = 0;
  if (input.promoCode) {
    try {
      const subtotalForPromo = servicePriceCents + addonsCents + surgeAmountCents;
      promoDiscountCents = await resolvePromo({
        code: input.promoCode,
        subtotalCents: subtotalForPromo,
        userId: input.userId,
      });
    } catch (err) {
      // Re-throw promo errors as-is so the route layer can surface
      // promo-specific error codes (PROMO_ERRORS.promoMinOrderNotMet,
      // promoExhausted, promoInvalid). Other errors propagate normally.
      // We don't silently zero the discount because that would put us
      // back in the pre-fix state of preview ≠ create.
      void PROMO_ERRORS;
      throw err;
    }
  }

  const subtotalForFee = servicePriceCents + addonsCents + surgeAmountCents - promoDiscountCents;
  const feeRatePercent = await getSettingNumber('service_fee_rate');
  const feeMin = await getSettingNumber('service_fee_min');
  const feeMax = await getSettingNumber('service_fee_max');
  const computedFee = Math.round(subtotalForFee * (feeRatePercent / 100));
  // A zero rate means no customer fee at all — the min floor must NOT re-add one
  // (Ken, 2026-06-28). Only apply the min/max band when a fee is actually charged.
  const serviceFeeCents = feeRatePercent === 0 ? 0 : Math.max(feeMin, Math.min(computedFee, feeMax));

  const totalAmountCents = subtotalForFee + serviceFeeCents;
  if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
    throw createAppError(PRICING_ERRORS.pricingResolutionInvalid, 400);
  }

  const breakdown: Array<{ label: string; amountCents: number }> = [
    { label: 'Service price', amountCents: servicePriceCents },
    ...addonBreakdown,
    ...(surgeAmountCents > 0 ? [{ label: 'Surge', amountCents: surgeAmountCents }] : []),
    ...(promoDiscountCents > 0
      ? [{ label: 'Promo discount', amountCents: -promoDiscountCents }]
      : []),
    // No customer platform fee (Ken, 2026-06-28): the customer pays no app-usage
    // fee — the platform earns from provider commission instead. The service-fee
    // setting drives this (service_fee_rate=0), and we only show a fee line when
    // a fee is actually charged, so the customer never sees a "Service fee ₱0.00".
    ...(serviceFeeCents > 0 ? [{ label: 'Service fee', amountCents: serviceFeeCents }] : []),
  ];

  return {
    servicePriceCents,
    addonsCents,
    surgeAmountCents,
    surgeRuleId,
    promoDiscountCents,
    serviceFeeCents,
    totalAmountCents,
    breakdown,
  };
}
