import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  method: z.enum(['gcash', 'maya', 'bank_instapay', 'bank_pesonet']),
  destinationAccount: z.string().min(5, 'Account number is required').max(255),
  accountName: z.string().min(2).max(255).optional(),
  notes: z.string().max(500).optional(),
});

export const rejectPayoutSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});
