// Phase 14 Dispatch 05 — Bug 208 + Bug 1132.
//
// `servicePrice` is no longer accepted from the client. The server
// resolves the canonical price from `service_subcategories.base_price`
// at recurring-creation time (recurring.service.ts). The customer's
// mobile screen also drops `servicePrice` from its outgoing payload.
//
// `.strict()` rejects unknown keys so a client retrying with
// `servicePrice` fails validation outright (no silent drop).

import { z } from 'zod';

export const createRecurringSchema = z
  .object({
    categoryId: z.string().uuid('Invalid category ID'),
    subcategoryId: z.string().uuid('Invalid subcategory ID'),
    providerId: z.string().uuid('Invalid provider ID').optional(),
    originalBookingId: z.string().uuid('Invalid booking ID'),
    frequency: z.enum(['weekly', 'bi_weekly', 'monthly']),
    preferredDay: z.number().int().min(0).max(6),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/, 'preferredTime must be HH:mm'),
    address: z.string().min(1).max(500),
    barangay: z.string().min(1).max(100),
    city: z.string().min(1).max(100),
    province: z.string().min(1).max(100),
    latitude: z
      .number()
      .min(4.5, 'Must be within Philippines')
      .max(21.5, 'Must be within Philippines')
      .optional(),
    longitude: z
      .number()
      .min(116, 'Must be within Philippines')
      .max(127.5, 'Must be within Philippines')
      .optional(),
  })
  .strict();

export const recurringIdParamsSchema = z.object({
  id: z.string().uuid('Recurring booking ID must be a valid UUID.').transform((value) => value.toLowerCase()),
}).strict();

export const recurringPreviewParamsSchema = z.object({
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID.'),
}).strict();

export const recurringPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type RecurringPaginationQuery = z.infer<typeof recurringPaginationQuerySchema>;

export const customerRecurringCancelBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict();

export const customerRecurringSkipBodySchema = z.object({
  skipDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Skip date must use YYYY-MM-DD.')
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year!, month! - 1, day!));
      return date.getUTCFullYear() === year
        && date.getUTCMonth() === month! - 1
        && date.getUTCDate() === day;
    }, 'Skip date must be a real calendar date.'),
}).strict();

export const recurringAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const adminRecurringListQuerySchema = z.object({
  search: z.string().trim().min(2).max(100).optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type AdminRecurringListQuery = z.infer<typeof adminRecurringListQuerySchema>;

export const adminRecurringCancelBodySchema = z.object({
  reason: z.string().trim().min(10).max(500),
}).strict();
