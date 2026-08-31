// Phase 14 Dispatch 05 — Bug 261 promo validators.
//
// Two schemas:
//   - createPromoCodeSchema: admin-side input for creating a promo.
//     Asserts shape only; the marketing-admin.service.ts internal
//     validators (validateCode, validateDiscount, validateValidityRange)
//     already enforce business rules (uppercase, regex, validity window).
//   - applyPromoSchema: customer-side input for applying a code at
//     checkout. The customer sends ONLY a `code` string; the server
//     resolves the discount via services/booking/promo.service.ts.

import { z } from 'zod';

// MED-M08 fix — discountValue is now bounded by discountType:
//   - percentage: 1..100 (a 100% discount is "free booking" — allowed
//     for special-circumstance promos; 0% is meaningless so min=1)
//   - fixed_centavos: 1..50,000,000 centavos (₱500K hard cap on a
//     fixed-amount discount; service-layer applies max_discount_centavos
//     and clamps to subtotal regardless)
const FIXED_DISCOUNT_MAX_CENTAVOS = 50_000_000;

export const createPromoCodeSchema = z
  .object({
    code: z.string().min(1).max(40),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed_centavos']),
    discountValue: z.number().int().positive(), // gate-a-allowed: admin-defines-promo-value
    maxDiscountCentavos: z.number().int().positive().max(FIXED_DISCOUNT_MAX_CENTAVOS).nullable().optional(),
    minimumOrderCentavos: z.number().int().min(0).optional(),
    usageLimitTotal: z.number().int().positive().nullable().optional(),
    usageLimitPerCustomer: z.number().int().positive().optional(),
    // Phase 200 fix — the admin UI anchors promo windows to Manila and
    // sends ISO strings with a `+08:00` offset (e.g. 2026-01-01T23:59:59+08:00).
    // Zod 4's bare `.datetime()` defaults to offset:false and rejects any
    // non-`Z` offset, so creating a promo with a "Valid until" date 400'd.
    // `{ offset: true }` accepts the timezone offset the client actually sends.
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.discountType === 'percentage') {
        return data.discountValue >= 1 && data.discountValue <= 100;
      }
      // fixed_centavos
      return data.discountValue >= 1 && data.discountValue <= FIXED_DISCOUNT_MAX_CENTAVOS;
    },
    {
      message: 'discountValue out of range for discountType (percentage: 1..100; fixed_centavos: 1..50,000,000).',
      path: ['discountValue'],
    },
  );

export const applyPromoSchema = z
  .object({
    code: z.string().min(1).max(40),
  })
  .strict();

export const updatePromoCodeSchema = z.object({
  description: z.string().max(500).optional(),
  minimumOrderCentavos: z.number().int().min(0).optional(),
  usageLimitTotal: z.number().int().positive().nullable().optional(),
  usageLimitPerCustomer: z.number().int().positive().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().optional(),
}).strict();

const campaignDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');

export const createMarketingCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  channel: z.string().trim().min(1).max(100),
  startedAt: campaignDate,
  endedAt: campaignDate.nullable().optional(),
  spendCentavos: z.number().int().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

/**
 * Attribution counters are intentionally absent. Directly overwriting them
 * made the KPI dashboard unauditable. A future evidence-backed adjustment
 * endpoint can add deltas without rewriting the historical base counters.
 */
export const updateMarketingCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  endedAt: campaignDate.nullable().optional(),
  spendCentavos: z.number().int().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();
