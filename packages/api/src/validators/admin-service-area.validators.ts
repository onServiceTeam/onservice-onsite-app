// Phase 14 Dispatch 05 — Bug 320 + Bug 322 admin service-area validators.
//
// The original `/admin/service-areas` POST validated coordinates against
// the wider `[-90, 90]` × `[-180, 180]` global bounds, allowing service
// areas to be created anywhere on Earth — even though the platform
// operates only in the Philippines. radiusKm and minProvidersToLaunch
// were unbounded entirely.
//
// PH bounds rationale (matches migration 074 CHECK constraints —
// defense in depth at API + DB):
//   - Latitude 4.5..21.5 covers the entire Philippine archipelago.
//   - Longitude 116..127.5 covers it East–West.
//   - radius_km 1..100 — operationally sane (smaller than a barangay
//     vs bigger than Metro Manila).
//   - min_providers_to_launch 1..50 — reasonable v1 area sizes.

import { z } from 'zod';

const lifecycleReasonSchema = z.string().trim().min(10).max(2000);
const launchDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Launch date must use YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Launch date must be a real calendar date');
const zipCodeSchema = z.string().trim().regex(/^\d{4}$/, 'Philippine ZIP codes must contain exactly four digits');

export const serviceAreaIdParamsSchema = z.object({
  id: z.string().uuid('Service area ID must be a valid UUID'),
}).strict();

export const serviceAreaProviderParamsSchema = z.object({
  areaId: z.string().uuid('Service area ID must be a valid UUID'),
  providerId: z.string().uuid('Provider ID must be a valid UUID'),
}).strict();

export const serviceAreaLifecycleReasonSchema = z.object({
  reason: lifecycleReasonSchema,
}).strict();

const positiveIntegerQuery = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1));
export const serviceAreaListQuerySchema = z.object({
  page: positiveIntegerQuery.optional(),
  pageSize: positiveIntegerQuery.pipe(z.number().max(100)).optional(),
  status: z.enum(['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
}).strict();

export const serviceAreaWaitlistQuerySchema = z.object({
  page: positiveIntegerQuery.optional(),
  pageSize: positiveIntegerQuery.pipe(z.number().max(100)).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  notified: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();

export const createServiceAreaSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    province: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    zipCodes: z.array(zipCodeSchema).max(100).optional(),
    centerLat: z
      .number()
      .min(4.5, 'Latitude must be within Philippines (4.5..21.5)')
      .max(21.5, 'Latitude must be within Philippines (4.5..21.5)'),
    centerLng: z
      .number()
      .min(116, 'Longitude must be within Philippines (116..127.5)')
      .max(127.5, 'Longitude must be within Philippines (116..127.5)'),
    radiusKm: z
      .number()
      .int()
      .min(1, 'Radius must be >= 1 km')
      .max(100, 'Radius must be <= 100 km')
      .optional(),
    minProvidersToLaunch: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional(),
    launchDate: launchDateSchema.optional(),
    reason: lifecycleReasonSchema,
  })
  .strict();

export const updateServiceAreaSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    province: z.string().trim().min(1).max(100).optional(),
    region: z.string().trim().min(1).max(100).optional(),
    zipCodes: z.array(zipCodeSchema).max(100).optional(),
    centerLat: z.number().min(4.5).max(21.5).optional(),
    centerLng: z.number().min(116).max(127.5).optional(),
    radiusKm: z.number().int().min(1).max(100).optional(),
    minProvidersToLaunch: z.number().int().min(1).max(50).optional(),
    launchDate: launchDateSchema.nullable().optional(),
    reason: lifecycleReasonSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'reason'), 'At least one service-area field is required');
