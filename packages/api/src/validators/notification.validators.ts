import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24h)');

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const notificationPreferencesSchema = z.object({
  bookingUpdates: z.boolean().optional(),
  providerActivity: z.boolean().optional(),
  paymentAlerts: z.boolean().optional(),
  messages: z.boolean().optional(),
  promotions: z.boolean().optional(),
  sukiRewards: z.boolean().optional(),
  reminders: z.boolean().optional(),
  system: z.boolean().optional(),
  marketingPushEnabled: z.boolean().optional(),
  marketingSmsEnabled: z.boolean().optional(),
  marketingEmailEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: time.optional(),
  quietHoursEnd: time.optional(),
  quietHoursTimezone: z.string().trim().min(1).max(64).optional(),
}).strict();
