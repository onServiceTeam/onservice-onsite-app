import { z } from 'zod';

export const createPaymentIntentSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  paymentMethod: z.enum(['gcash', 'maya', 'card', 'qrph', 'wallet', 'bank_transfer']),
});

export const processRefundSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  amount: z.number().int().positive('Refund amount must be positive'),
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
