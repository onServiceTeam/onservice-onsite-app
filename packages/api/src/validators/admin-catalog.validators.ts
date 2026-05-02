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

export const createAddonSchema = z
  .object({
    subcategoryId: z.string().uuid('Invalid subcategory ID'),
    name: z.string().min(1).max(150),
    description: z.string().max(1000).optional(),
    price: z.number().int().min(0).max(ADDON_PRICE_MAX_CENTS, 'Add-on price exceeds maximum'),
    displayOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const updateAddonSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(1000).optional(),
    price: z
      .number()
      .int()
      .min(0)
      .max(ADDON_PRICE_MAX_CENTS, 'Add-on price exceeds maximum')
      .optional(),
    displayOrder: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

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
