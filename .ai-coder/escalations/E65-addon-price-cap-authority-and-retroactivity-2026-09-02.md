# E65 — Add-on price cap authority and retroactivity are contradictory

**Date:** 2026-09-02
**Status:** AWAITING KEN DECISION — no code, migration, production, or existing add-on change made
**Scope:** `addon_price_max_cents`, Admin System Settings, Admin Catalog, public add-on discovery, fixed-price booking and pricing preview

## Bad news

The editable Add-on Price Cap does not have one truthful boundary:

1. migration 074 allows the setting to be saved as high as `50,000,000`
   centavos (₱500,000);
2. the catalog route validator rejects an individual add-on above `10,000,000`
   centavos (₱100,000);
3. `getAddonPriceMaxCentsLive()` returns the stored value without clamping it
   to that hard ceiling, so a direct service caller can treat the higher value
   as authoritative even though the current HTTP route cannot;
4. lowering the setting affects future create, price-edit, and reactivation
   actions only; and
5. public discovery, pricing preview, and booking creation continue accepting
   every active add-on at its stored price, even when that price is above the
   newly lowered cap.

The migration description calls this the "Maximum admin-creatable add-on
price," which supports prospective catalog-authoring semantics. The generic
System Settings summary instead says the value controls "new operations,"
without telling an operator that already-active add-ons remain customer-visible
and purchasable. An operator can also save a value between ₱100,000 and
₱500,000 that the catalog route can never use.

## Evidence

- `packages/api/migrations/074_d05_service_area_bounds_and_settings.sql`
  - setting `max_value = 50,000,000`
  - description says "Maximum admin-creatable add-on price"
- `packages/api/src/validators/admin-catalog.validators.ts`
  - route hard ceiling `ADDON_PRICE_MAX_CENTS = 10,000,000`
  - helper returns an unclamped stored setting
- `packages/api/src/services/catalog.service.ts`
  - create and price-update enforce the live setting
  - reactivation enforces the live setting
  - public active-add-on listing does not apply the setting
- `packages/api/src/services/booking/pricing.service.ts`
  - pricing preview accepts any active add-on for the selected subcategory
- `packages/api/src/services/booking.service.ts`
  - booking creation accepts any active add-on and snapshots its canonical
    stored price into `booking_addons`
- `packages/api/src/services/settings.service.ts`
  - database metadata permits the higher value
  - no add-on-specific runtime summary exists

E32 prevents the required production inventory of current setting and add-on
rows. No assumption is made about whether production currently contains an
active add-on above either boundary.

## Option A — prospective authoring guard with one ₱100,000 ceiling (recommended)

Keep the setting as a guard on future catalog authoring, not as a retroactive
customer-purchase switch:

1. clamp the live helper to the existing ₱100,000 hard ceiling;
2. reject a setting update above that same ceiling and report the effective
   maximum to Admin, without rewriting the historical migration;
3. add an exact runtime summary: future add-on creation, price changes, and
   reactivation use the cap after cache refresh; already-active add-ons and
   historical booking snapshots remain unchanged;
4. identify above-cap active rows in Admin Catalog so a super admin can review,
   reprice, or deactivate each one deliberately; and
5. leave public discovery and booking behavior unchanged until that deliberate
   catalog action, avoiding surprise delisting or checkout failures from cached
   customer screens.

This matches the original "admin-creatable" definition, the existing hard
backstop, and the platform's non-retroactivity rule. It also scales cleanly:
catalog policy changes are prospective, while operator review handles legacy
exceptions explicitly.

## Option B — make the setting an immediate purchase ceiling

Filter above-cap active add-ons out of public discovery and reject them during
pricing preview and booking creation as soon as the setting changes. This makes
the cap immediately authoritative but can invalidate a customer's cached
selection and silently remove live catalog offerings without a per-record
review. It is not recommended.

## Option C — raise the code hard ceiling to ₱500,000

Make the route and service accept the migration's current maximum. This removes
the numerical contradiction but weakens the existing typo/abuse guard by five
times and conflicts with the code's explicit ₱100,000 product backstop. It is
not recommended without a separate approved catalog-pricing policy.

## Required decision

Approve Option A, B, or C. Until then, do not change the cap, migrate setting
metadata, filter customer add-ons, rewrite existing add-on prices, or deploy a
behavior change.
