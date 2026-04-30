// Phase 14 Dispatch 05 — Bug 269 admin pricing-rules validators.
//
// `platformSurgeShare` must be in 0..1 (it represents the share of the
// surge revenue retained by the platform; the rest goes to the
// provider). The original admin route validated `multiplier 1..5` but
// not the share, so a typo could result in 50× the intended platform
// retention or a negative split.
//
// Schema-divergence note: PART-3 spec assumed pricing_rules with JSONB
// `scope` (`serviceCategoryIds`, `serviceAreaIds`) and JSONB `schedule`.
// Reality is a flat type-discriminated schema (rush/holiday/peak_hours
// with separate columns per type, plus single category_id/service_area_id
// FKs). The validator below mirrors the actual schema.

import { z } from 'zod';

export const SURGE_MULTIPLIER_MIN = 1.0;
export const SURGE_MULTIPLIER_MAX = 5.0;

export const createPricingRuleSchema = z
  .object({
    name: z.string().min(1).max(150),
    type: z.enum(['rush', 'holiday', 'peak_hours']),
    multiplier: z
      .number()
      .min(SURGE_MULTIPLIER_MIN, 'Multiplier must be >= 1.0')
      .max(SURGE_MULTIPLIER_MAX, 'Multiplier must be <= 5.0'),
    rushHoursThreshold: z.number().int().min(1).max(24).optional(),
    holidayDate: z.string().optional(),
    peakStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'peakStartTime must be HH:mm').optional(),
    peakEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'peakEndTime must be HH:mm').optional(),
    peakDaysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    categoryId: z.string().uuid().optional(),
    serviceAreaId: z.string().uuid().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    // Bug 269 fix: 0..1 share rate.
    platformSurgeShare: z
      .number()
      .min(0, 'platformSurgeShare must be >= 0')
      .max(1, 'platformSurgeShare must be <= 1')
      .optional(),
    description: z.string().max(1000).optional(),
  })
  .strict();

export const updatePricingRuleSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    multiplier: z
      .number()
      .min(SURGE_MULTIPLIER_MIN)
      .max(SURGE_MULTIPLIER_MAX)
      .optional(),
    rushHoursThreshold: z.number().int().min(1).max(24).optional(),
    holidayDate: z.string().optional(),
    peakStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    peakEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    peakDaysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    categoryId: z.string().uuid().optional(),
    serviceAreaId: z.string().uuid().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    platformSurgeShare: z
      .number()
      .min(0)
      .max(1)
      .optional(),
    description: z.string().max(1000).optional(),
  })
  .strict();
