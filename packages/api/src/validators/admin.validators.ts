import { z } from 'zod';

export const suspendProviderSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

export const changeProviderTierSchema = z.object({
  tier: z.enum(['new', 'verified', 'pro', 'elite']),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});
