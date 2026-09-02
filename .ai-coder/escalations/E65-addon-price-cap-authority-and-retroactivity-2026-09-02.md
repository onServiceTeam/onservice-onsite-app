# E65 — Add-on price cap authority and retroactivity are contradictory

**Date:** 2026-09-02
**Status:** OPTION A APPROVED AND CLEAN-RUNNER VERIFIED — topic branch only; no migration, production, backfill, public-catalog filter, or existing add-on rewrite made
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

## Decision recorded

Ken approved Option A on 2026-09-02. The implementation keeps this as a
prospective authoring guard, preserves public discovery and historical booking
snapshots, and adds deliberate Admin Catalog review signals for active rows
above the effective cap.

## Implementation and verification

Commits `98d3c00` and `e17b2fe` implement the approved decision on
`codex/system-settings-control-fix`:

1. one shared `10,000,000`-centavo hard ceiling now governs catalog validation,
   the live helper, and the Admin Settings effective maximum;
2. Admin Settings rejects a higher value and states the prospective runtime
   effect explicitly;
3. Admin Catalog flags active rows above the effective cap for deliberate
   review while leaving public discovery and booking behavior unchanged;
4. a non-price edit to a grandfathered active row no longer submits or
   revalidates its unchanged legacy price, while a real price edit and an
   inactive-row reactivation still enforce the cap; and
5. the Catalog edit request no longer includes the unsupported
   `subcategoryId` field rejected by the strict update schema.

The first clean CI run `33594360113` failed only the new Admin rendered test.
That failure exposed a real browser boundary: the HTML `max` attribute blocked
submission of an unchanged ₱120,000 grandfathered price before the non-price
edit could reach the approved server behavior. Commit `e17b2fe` corrected that
boundary and added an explicit form error for an actual above-cap price change.

The final clean runners passed in full:

- GitHub CI `33594942588`: API, Admin, Mobile, and API Docker build/liveness;
- GitHub Gates `33594942589`: Gates A, B, C, D, E, and the all-gates result;
- Admin: 300 files and 391 assertions, with the three existing todos; and
- API and Mobile: complete TypeScript and test jobs green.

API TypeScript also passed locally. Local Jest, Vitest, and Admin TypeScript are
not claimed because the local npm shim and OneDrive dependency reads failed
before those runners loaded a target. The clean GitHub runners are the
authoritative test evidence.

No migration, backfill, historical booking rewrite, existing add-on rewrite,
customer-facing filter, refund, merge to master, server synchronization, or
production change occurred. E32, E50, and the existing release and money holds
remain in force.
