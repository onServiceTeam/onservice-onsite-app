import { z } from 'zod';

export const createTemplateSchema = z.object({
  slug: z.string().min(3, 'Slug must be at least 3 characters').max(100)
    .regex(/^[a-z0-9_]+$/, 'Slug must contain only lowercase letters, numbers, and underscores'),
  titleTemplate: z.string().min(3, 'Title is required').max(500),
  bodyTemplate: z.string().min(10, 'Body must be at least 10 characters').max(2000),
  type: z.enum([
    'booking_update', 'payment', 'dispute_update', 'tier_upgrade',
    'payout', 'referral', 'suki', 'promo', 'system',
  ]),
  channel: z.enum(['in_app', 'push', 'sms', 'email', 'all']).default('in_app'),
  variables: z.array(z.string().max(50)).max(20).optional(),
});

export const updateTemplateSchema = z.object({
  titleTemplate: z.string().min(3).max(500).optional(),
  bodyTemplate: z.string().min(10).max(2000).optional(),
  type: z.enum([
    'booking_update', 'payment', 'dispute_update', 'tier_upgrade',
    'payout', 'referral', 'suki', 'promo', 'system',
  ]).optional(),
  channel: z.enum(['in_app', 'push', 'sms', 'email', 'all']).optional(),
  isActive: z.boolean().optional(),
  variables: z.array(z.string().max(50)).max(20).optional(),
});
