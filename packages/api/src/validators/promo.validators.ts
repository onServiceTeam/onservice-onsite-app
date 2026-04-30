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

export const createPromoCodeSchema = z
  .object({
    code: z.string().min(1).max(40),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed_centavos']),
    discountValue: z.number().int().positive(),
    maxDiscountCentavos: z.number().int().positive().nullable().optional(),
    minimumOrderCentavos: z.number().int().min(0).optional(),
    usageLimitTotal: z.number().int().positive().nullable().optional(),
    usageLimitPerCustomer: z.number().int().positive().optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().nullable().optional(),
  })
  .strict();

export const applyPromoSchema = z
  .object({
    code: z.string().min(1).max(40),
  })
  .strict();
