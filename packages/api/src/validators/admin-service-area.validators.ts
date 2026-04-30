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

export const createServiceAreaSchema = z
  .object({
    name: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    province: z.string().min(1).max(100),
    region: z.string().min(1).max(100),
    zipCodes: z.array(z.string().max(10)).max(100).optional(),
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
    launchDate: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const updateServiceAreaSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    city: z.string().min(1).max(100).optional(),
    province: z.string().min(1).max(100).optional(),
    region: z.string().min(1).max(100).optional(),
    zipCodes: z.array(z.string().max(10)).max(100).optional(),
    centerLat: z.number().min(4.5).max(21.5).optional(),
    centerLng: z.number().min(116).max(127.5).optional(),
    radiusKm: z.number().int().min(1).max(100).optional(),
    minProvidersToLaunch: z.number().int().min(1).max(50).optional(),
    launchDate: z.string().nullable().optional(),
    status: z.enum(['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired']).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
