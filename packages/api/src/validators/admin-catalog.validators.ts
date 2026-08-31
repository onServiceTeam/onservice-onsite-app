// Phase 14 Dispatch 05 — Bug 266 admin catalog validators.
//
// Admin addon create/update inputs. The original route at
// `/admin/addons` validated `typeof price !== 'number' || price < 0`
// only — no upper bound, so an admin typo or compromised admin token
// could create an addon at, e.g., ₱100,000,000.
//
// MED-M09 fix — the ADDON_PRICE_MAX_CENTS hard-coded constant
// previously did NOT track the admin-tunable `addon_price_max_cents`
// setting from migration 074. Admin tuning the setting in
// /admin/settings had no effect on the validator. Post-fix:
//   1. The validator still has a HARD backstop (10M centavos =
//      ₱100,000) which matches the absolute ceiling above which a
//      catalog "addon" can't reasonably be a real addon.
//   2. Routes that need the tunable cap should call
//      `getAddonPriceMaxCentsLive()` and apply the additional
//      check at the service layer (catalog.service.createAddon).
//      The validator backstop kicks in if the service-layer check
//      is somehow bypassed.
//   3. Backstop can be tightened in code (matches NPC RA 9646
//      reasonable-cost guidance) without changing the admin-tunable
//      setting; raised from 5M to 10M to support the higher tier of
//      addon ranges that the marketing team has already approved
//      for v1.1.
//
// Schema-divergence note: the actual `service_addons.price` column is
// named `price` (not `price_cents`).

import { z } from 'zod';

/** Hard backstop. Admin-tunable cap is enforced at the service layer. */
const ADDON_PRICE_MAX_CENTS = 10_000_000; // ₱100,000 hard ceiling
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POSTGRES_INTEGER_MIN = -2_147_483_648;
const CUSTOMER_SERVICE_SCOPE_MIN = 30;

const displayOrderSchema = z.number().int().min(POSTGRES_INTEGER_MIN).max(POSTGRES_INTEGER_MAX);
const priceSchema = z.number().int().min(0).max(POSTGRES_INTEGER_MAX).nullable();
const iconUrlSchema = z.string().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Icon URL must be an HTTP(S) URL');

export const catalogUuidParamsSchema = z.object({ id: z.string().uuid('Invalid catalog record ID') }).strict();
export const catalogSubcategoryUuidParamsSchema = z.object({
  subcategoryId: z.string().uuid('Invalid subcategory ID'),
}).strict();
export const catalogFieldUuidParamsSchema = z.object({
  fieldId: z.string().uuid('Invalid intake field ID'),
}).strict();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).optional(),
  iconUrl: iconUrlSchema.nullable().optional(),
  displayOrder: displayOrderSchema.optional(),
}).strict();

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  iconUrl: iconUrlSchema.nullable().optional(),
  displayOrder: displayOrderSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one category field is required');

const subcategoryFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(
    CUSTOMER_SERVICE_SCOPE_MIN,
    `Customer service scope must be at least ${CUSTOMER_SERVICE_SCOPE_MIN} characters`,
  ).max(2000),
  pricingType: z.enum(['fixed', 'quote', 'hourly', 'per_unit']),
  basePrice: priceSchema,
  minPrice: priceSchema,
  maxPrice: priceSchema,
  estimatedDurationMinutes: z.number().int().min(0).max(POSTGRES_INTEGER_MAX).nullable(),
  unitLabel: z.string().trim().min(1).max(30).nullable(),
  unitPrice: priceSchema,
  hourlyRate: priceSchema,
  displayOrder: displayOrderSchema,
};

function validatePricingModel(
  value: Partial<Record<keyof typeof subcategoryFields, unknown>>,
  ctx: z.RefinementCtx,
): void {
  if (value.pricingType === 'fixed' && value.basePrice == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['basePrice'], message: 'Fixed services need a base price' });
  }
  if (value.pricingType === 'hourly' && (typeof value.hourlyRate !== 'number' || value.hourlyRate <= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hourlyRate'], message: 'Hourly services need a positive hourly rate' });
  }
  if (value.pricingType === 'per_unit') {
    if (typeof value.unitLabel !== 'string' || value.unitLabel.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitLabel'], message: 'Per-unit services need a unit label' });
    }
    if (typeof value.unitPrice !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitPrice'], message: 'Per-unit services need a unit price' });
    }
  }
}

export const createSubcategorySchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  ...subcategoryFields,
}).strict().superRefine(validatePricingModel);

export const updateSubcategorySchema = z.object({
  name: subcategoryFields.name.optional(),
  description: subcategoryFields.description.optional(),
  pricingType: subcategoryFields.pricingType.optional(),
  basePrice: subcategoryFields.basePrice.optional(),
  minPrice: subcategoryFields.minPrice.optional(),
  maxPrice: subcategoryFields.maxPrice.optional(),
  estimatedDurationMinutes: subcategoryFields.estimatedDurationMinutes.optional(),
  unitLabel: subcategoryFields.unitLabel.optional(),
  unitPrice: subcategoryFields.unitPrice.optional(),
  hourlyRate: subcategoryFields.hourlyRate.optional(),
  displayOrder: subcategoryFields.displayOrder.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one service field is required');

export const catalogLifecycleReasonSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
}).strict();

export const createAddonSchema = z
  .object({
    subcategoryId: z.string().uuid('Invalid subcategory ID'),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1000).optional(),
    price: z.number().int().min(0).max(ADDON_PRICE_MAX_CENTS, 'Add-on price exceeds maximum'),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict();

export const updateAddonSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(1000).optional(),
    price: z
      .number()
      .int()
      .min(0)
      .max(ADDON_PRICE_MAX_CENTS, 'Add-on price exceeds maximum')
      .optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one add-on field is required');

export const ADDON_PRICE_MAX_CENTS_EXPORT = ADDON_PRICE_MAX_CENTS;

/**
 * MED-M09 fix — fetches the admin-tunable addon price ceiling from
 * platform_settings. Returns the configured value if present, falls
 * back to the hard backstop (ADDON_PRICE_MAX_CENTS) on any error.
 *
 * Routes/services that handle addon create/update should call this
 * AFTER the validator runs, e.g.:
 *
 *   const liveMax = await getAddonPriceMaxCentsLive();
 *   if (input.price > liveMax) {
 *     throw createAppError(`Add-on price exceeds tuned maximum...`, 400);
 *   }
 */
export async function getAddonPriceMaxCentsLive(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const settingsService = require('../services/settings.service');
    if (typeof settingsService.getSettingNumber === 'function') {
      const value = await settingsService.getSettingNumber('addon_price_max_cents');
      if (Number.isFinite(value) && value > 0) return Number(value);
    }
  } catch {
    /* fall back to hard backstop */
  }
  return ADDON_PRICE_MAX_CENTS;
}
