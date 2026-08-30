import { z } from 'zod';

export const suspendProviderSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

// Bug 1323 fix (Phase 14 Dispatch 02 Part 3): 'founding' is now a valid
// tier — DECISION-003 commits to a 10%-commission founding batch and the
// rate already lived in platform_settings; migration 073 added founding to
// the providers.tier CHECK constraint. The Zod enum mirrors the DB.
export const changeProviderTierSchema = z.object({
  tier: z.enum(['founding', 'new', 'verified', 'pro', 'elite']),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

export const assignBusinessAccountManagerSchema = z.object({
  accountManagerId: z.string().uuid('Invalid account manager ID'),
  reason: z.string().trim().min(10, 'Reason must be at least 10 characters').max(5000),
}).strict();

export const businessAccountIdParamsSchema = z.object({
  id: z.string().uuid('Invalid business account ID'),
}).strict();
