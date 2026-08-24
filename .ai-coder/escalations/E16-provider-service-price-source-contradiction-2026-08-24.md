# E16 — Provider service prices contradict the booking price source

**Date:** 2026-08-24  
**Status:** OPEN — customer-visible mismatch contained; permanent Ken decision required
**Hard-stop reason:** The customer-visible price and the amount recorded on a
booking can differ. Resolving the conflict changes the platform's pricing
model and money path.

## Bad news first

For a fixed-price service, a provider can save a personal “base price” and the
customer-facing provider profile displays that amount. Booking creation does
not use it. The server records the catalog's fixed price instead.

This is present in production data, not just an unused code path. A read-only
production query on 2026-08-24 found:

| Pricing type | Active provider-service rows | Rows with a provider price | Provider price differs from catalog |
|---|---:|---:|---:|
| fixed | 20 | 17 | 15 |
| quote | 11 | 8 | 8 |

Quote cards were already corrected to say “Get Quote,” so their legacy stored
base prices are not presented as booking prices. Fixed-price cards still show
the provider value even though booking creation uses the catalog value. No
production row was changed during this audit.

## Evidence

### Provider UI and API create a provider-specific price

`apps/mobile/app/provider/services.tsx` asks for “Your Base Price,” sends it to
`POST /api/v1/providers/me/services`, and renders the saved value as “Starting
at.”

`packages/api/src/services/provider.service.ts` validates that value against
the catalog minimum and maximum, stores it in `provider_services.base_price`,
and returns it from provider-profile service data.

Phase 14 Bug 1230 explicitly required provider price overrides to be checked
against the catalog range. `docs/architecture/SPEC.md` also says provider
profiles contain pricing “for services where provider sets price” and that the
platform shows guidance when a provider is far outside the market range.

### Customer profile displays the provider-specific price

`apps/mobile/app/customer/provider/[id].tsx` displays
`provider_services.base_price` for a fixed-price service and seeds the booking
draft with that value.

Hourly and quote cards were recently corrected to use their real pricing
contracts, but the fixed-price branch was not. Current audit documentation
incorrectly describes all fixed provider cards as canonical.

### Booking creation ignores the provider-specific price

`packages/api/src/services/booking.service.ts` resolves fixed-price bookings
from `service_subcategories.base_price`. Its comment explicitly says there is
no fallback to a provider-specific price.

The Phase 200 contract-pricing decision also records the catalog price as the
normal booking source, with an approved B2B contract rate as the only override.
The broader product specification separately says fixed catalog prices may be
set per area.

The repository therefore contains two incompatible approved intentions:

1. providers set personal prices within an admin range; and
2. fixed bookings always use the admin catalog price.

## Why implementation is paused

Changing only the provider or customer screen would silently choose a business
model. Changing booking creation to use the provider value would affect
customer totals, escrow, commissions, promos, recurring bookings, rebooking,
matching, support explanations, and admin reconciliation. Removing provider
pricing would invalidate an existing provider feature and stored production
configuration.

The app also does not currently identify which fixed-price services are
supposed to be provider-priced. Guessing from category names would violate the
city-agnostic, admin-configured direction.

## Decision options

### Option A — Catalog price is authoritative for fixed services (recommended for launch)

- Providers select which services they offer but do not set a fixed price.
- Provider and customer screens display the current catalog price.
- Existing `provider_services.base_price` values remain preserved but dormant
  until a later migration or explicit cleanup decision.
- The API stops accepting new personal fixed prices.
- Admin catalog and service-area pricing remain the company source of truth.
- Tests prove the provider card, customer card, booking preview, and persisted
  booking all use the same catalog amount.

This matches the existing booking and escrow behavior and is the smallest
launch-safe correction.

### Option B — Provider price is authoritative for every fixed service

- Providers must set a price within the admin range before offering a fixed
  service.
- Provider selection must happen before the final price is promised.
- Preview and create-booking endpoints resolve the same provider-service row
  under transaction-safe rules.
- Matching, recurring bookings, rebooking, promos, surge, commissions, admin
  support, and price-change behavior must be updated and tested end to end.

This follows the existing “Your Base Price” feature but is a substantial
money-path redesign.

### Option C — Admin chooses the price source per subcategory

- Add an admin-controlled `price_source` or `provider_sets_price` catalog
  setting.
- Catalog-priced services follow Option A.
- Provider-priced services follow Option B, including the full preview/create
  and support linkage.

This best matches “for services where provider sets price,” but it needs a
schema migration, an admin workflow, defaults for all 29 production services,
and a launch configuration decision.

## Required Ken decision

Choose Option A, B, or C. Option A is recommended for launch because it makes
every visible amount match the server's existing billing source without moving
money or rewriting production provider rows. No provider price, catalog price,
booking, wallet, payout, or production record will be changed until the choice
is recorded.

## Safe containment shipped 2026-08-24

The permanent pricing model remains undecided, but the app no longer shows a
provider value that booking creation ignores. API responses now use the fixed
catalog price for provider-service cards, matching booking and escrow. The
provider screen supports adding/removing service offerings and clearly pauses
personal price editing. Historical `provider_services.base_price` values remain
stored and dormant, and older installed clients may still submit bounded values;
those values do not affect customer-visible or charged prices.

This containment is reversible and changed no production money or pricing row.
It does not select Option A, B, or C as the permanent business model.
