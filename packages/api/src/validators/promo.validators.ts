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
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().nullable().optional(),
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
