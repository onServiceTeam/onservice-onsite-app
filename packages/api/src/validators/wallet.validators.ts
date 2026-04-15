import { z } from 'zod';

export const withdrawalSchema = z.object({
  amount: z.number().int().positive('Withdrawal amount must be positive'),
  method: z.enum(['gcash', 'maya', 'bank_instapay', 'bank_pesonet']),
  destinationAccount: z.string().min(1, 'Destination account is required').max(255),
});
