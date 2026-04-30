// Phase 14 Dispatch 05 — Bug 208 + Bug 1132.
//
// `servicePrice` is no longer accepted from the client. The server
// resolves the canonical price from `service_subcategories.base_price`
// at recurring-creation time (recurring.service.ts). The customer's
// mobile screen also drops `servicePrice` from its outgoing payload.
//
// `.strict()` rejects unknown keys so a client retrying with
// `servicePrice` fails validation outright (no silent drop).

import { z } from 'zod';

export const createRecurringSchema = z
  .object({
    categoryId: z.string().uuid('Invalid category ID'),
    subcategoryId: z.string().uuid('Invalid subcategory ID'),
    providerId: z.string().uuid('Invalid provider ID').optional(),
    originalBookingId: z.string().uuid('Invalid booking ID').optional(),
    frequency: z.enum(['weekly', 'bi_weekly', 'monthly']),
    preferredDay: z.number().int().min(0).max(6),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/, 'preferredTime must be HH:mm'),
    address: z.string().min(1).max(500),
    barangay: z.string().min(1).max(100),
    city: z.string().min(1).max(100),
    province: z.string().min(1).max(100),
    latitude: z
      .number()
      .min(4.5, 'Must be within Philippines')
      .max(21.5, 'Must be within Philippines')
      .optional(),
    longitude: z
      .number()
      .min(116, 'Must be within Philippines')
      .max(127.5, 'Must be within Philippines')
      .optional(),
  })
  .strict();
