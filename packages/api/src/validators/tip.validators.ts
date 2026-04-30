// Phase 14 Dispatch 05 — Bug 417.
// The tip cap is now driven by the `tip_max_amount_cents` row in
// `platform_settings` (seeded by migration 074, default ₱5,000). The
// schema enforces a hard sanity ceiling of 10_000_000 centavos (₱100K)
// — a defense-in-depth backstop in case the setting is ever cleared
// or the service-layer enforcement is bypassed. The dynamic
// per-booking cap is enforced in `tip.service.ts:sendTip` via
// `getSettingNumber('tip_max_amount_cents')`.

import { z } from 'zod';

const TIP_HARD_CAP_CENTAVOS = 10_000_000; // ₱100,000 — sanity backstop

export const sendTipSchema = z
  .object({
    bookingId: z.string().uuid('Booking ID must be a valid UUID'),
    amount: z
      .number()
      .int()
      .positive('Tip amount must be positive')
      .max(TIP_HARD_CAP_CENTAVOS, 'Tip amount exceeds platform sanity cap'),
    paymentMethod: z.enum(['wallet', 'gcash', 'maya', 'card']).default('wallet'),
    message: z.string().max(500, 'Message cannot exceed 500 characters').optional(),
  })
  .strict();

export const TIP_HARD_CAP_CENTAVOS_EXPORT = TIP_HARD_CAP_CENTAVOS;
