// Phase 14 Dispatch 05 — Bug 266 admin catalog validators.
//
// Admin addon create/update inputs. The original route at
// `/admin/addons` validated `typeof price !== 'number' || price < 0`
// only — no upper bound, so an admin typo or compromised admin token
// could create an addon at, e.g., ₱100,000,000. This validator adds
// `priceCents.max(5_000_000)` (₱50,000 cap), matching the seeded
// `addon_price_max_cents` setting from migration 074.
//
// Schema-divergence note: the actual `service_addons.price` column is
// named `price` (not `price_cents`). The admin route maps the
// validator's `price` field to the column directly. We keep the field
// name as `price` to match the existing wire shape; the upper bound is
// 5_000_000 centavos.

import { z } from 'zod';

const ADDON_PRICE_MAX_CENTS = 5_000_000; // ₱50,000

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
