// D38 Milestone 3: request validation for /api/v1/admin/marketplace-health.
// Every schema is strict, so an unknown query key is a 400, never ignored.
import { z } from 'zod';
import { LOST_REASONS, PROVIDER_SORTS, RESPONSE_TIME_GROUPS } from '../services/marketplace-health.service';

/** A Manila calendar day; resolveManilaRange checks it is real, ordered and at most 366 days. */
const manilaDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date written as YYYY-MM-DD.');

const dateRange = {
  from: manilaDate.optional(),
  to: manilaDate.optional(),
};

const page = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const openRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const responseTimesQuerySchema = z.object({
  ...dateRange,
  groupBy: z.enum(RESPONSE_TIME_GROUPS).default('category'),
}).strict();

export const lostOpportunitiesQuerySchema = z.object({
  ...dateRange,
  ...page,
  reason: z.enum(LOST_REASONS).optional(),
}).strict();

export const providersQuerySchema = z.object({
  ...dateRange,
  ...page,
  sort: z.enum(PROVIDER_SORTS).default('invites'),
}).strict();

export const alertsQuerySchema = z.object({
  status: z.enum(['open', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const idParamsSchema = z.object({ id: z.string().uuid() }).strict();

// A POST with no body at all (req.body undefined in Express 5) is the same as {}.
export const acknowledgeBodySchema = z.object({
  note: z.string().trim().max(500).optional(),
}).strict().default({});

export type OpenRequestsQuery = z.infer<typeof openRequestsQuerySchema>;
export type ResponseTimesQuery = z.infer<typeof responseTimesQuerySchema>;
export type LostOpportunitiesQuery = z.infer<typeof lostOpportunitiesQuerySchema>;
export type ProvidersQuery = z.infer<typeof providersQuerySchema>;
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;
export type AcknowledgeBody = z.infer<typeof acknowledgeBodySchema>;
