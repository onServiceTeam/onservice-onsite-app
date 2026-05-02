import { z } from 'zod';

export const createPaymentIntentSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  paymentMethod: z.enum(['gcash', 'maya', 'card', 'qrph', 'wallet', 'bank_transfer']),
});

// MED-M08 fix — sane upper bound on refund amount.
// Service-layer enforces amount <= booking.totalAmount; this validator
// is a defense-in-depth backstop that rejects nonsense values
// (₱9 quintillion centavos) before reaching the service. ₱5,000,000
// (500M centavos) is well above any realistic single-booking refund
// while being orders of magnitude below BIGINT.MAX.
const REFUND_MAX_CENTAVOS = 500_000_000;

export const processRefundSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  amount: z
    .number()
    .int()
    .positive('Refund amount must be positive')
    .max(REFUND_MAX_CENTAVOS, `Refund amount cannot exceed ${REFUND_MAX_CENTAVOS} centavos.`),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export const webhookEventSchema = z.object({
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.object({
      type: z.string(),
      data: z.object({
        id: z.string(),
        attributes: z.record(z.string(), z.unknown()),
      }),
    }),
  }),
});
