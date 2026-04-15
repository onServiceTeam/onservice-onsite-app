import { z } from 'zod';

export const sendTipSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  amount: z.number().int().positive('Tip amount must be positive').max(1000000, 'Maximum tip is ₱10,000'),
  paymentMethod: z.enum(['wallet', 'gcash', 'maya', 'card']).default('wallet'),
  message: z.string().max(500, 'Message cannot exceed 500 characters').optional(),
});
