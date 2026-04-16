import { z } from 'zod';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';

export const sendTipSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  amount: z.number().int().positive('Tip amount must be positive').max(platformConfig.maximumTipAmount, `Maximum tip is ${formatPHP(platformConfig.maximumTipAmount)}`),
  paymentMethod: z.enum(['wallet', 'gcash', 'maya', 'card']).default('wallet'),
  message: z.string().max(500, 'Message cannot exceed 500 characters').optional(),
});
