# E54 - Pricing rules can become global and active without an authoritative preview

**Date:** 2026-09-01
**Status:** OPEN
**Hard stop:** customer price, provider surge allocation, platform revenue, and production rule history
**Extends:** E28 admin pricing-rule preview and publication

## Bad news

The current Admin Pricing Rules screen cannot safely express or publish the
database contract.

1. `PricingRulesPage.tsx` does not load or submit `categoryId` or
   `serviceAreaId`, even though both scope fields exist in the API and database.
   A rule created from the screen therefore has both values `NULL`, which the
   pricing resolver interprets as all categories and all service areas.
2. `pricing_rules.is_active` defaults to `TRUE`. Creating that unintentionally
   global rule changes new booking prices immediately. There is no draft state,
   server-authoritative preview, overlap/winner explanation, or separate publish
   decision.
3. The create form builds `platformSurgeShare` with
   `Number(form.platformSurgeShare) || 0.5`. An intentional value of `0`, meaning
   no platform share of the surge, is silently replaced with `0.5`.
4. The UI does not show category or service-area scope in the queue, so an
   operator cannot distinguish a global rule from a narrow rule after creation.
5. Update, toggle, and delete accept no operator reason. Toggle still uses a
   browser-native confirmation without calculated customer/provider/platform
   impact.
6. Delete is a hard delete. A rule referenced by a booking is protected by its
   foreign key and may fail deletion; an unreferenced rule can disappear from
   the operational table even though pricing publication history should be
   append-only or explicitly retired.
7. Both ordinary Admin and super-admin roles can execute these controls. The
   approved authority for publishing a customer-price and revenue-allocation
   change is not documented.

## Why this cannot be fixed as a visual-only patch

Adding category and area dropdowns would still create an active money rule
without proving which overlapping rule wins. Adding a client-side calculator
would duplicate the server resolver and can drift. Disabling controls would be
E28 Option 3 and requires an approved handling plan for existing active rows.
Changing hard delete to retirement requires a history/publication model.

This is therefore the same unresolved publication architecture identified by
E28, now with a confirmed global-scope and zero-share defect.

## Required decision

Choose the E28 publication contract and the authority model.

### Option A - Draft, server preview, explicit publish, and retirement (recommended)

- New rules start as drafts, never active.
- Scope selection uses live category and service-area records and requires an
  explicit global-scope choice rather than `NULL` by omission.
- Preview calls the same server resolver used by booking pricing and shows the
  winning rule, overlap, customer total, surge amount, provider surge share,
  and platform surge share for representative cases.
- Publish requires a bounded reason and an authorized role.
- Published rules are retired or superseded, not hard-deleted.
- Existing booking financial snapshots remain immutable under E50.
- The 0% platform-share input is preserved exactly.

The decision must also identify whether publication requires super-admin only
or a future two-person approval threshold.

### Option B - Read-only launch posture

- Freeze create/edit/toggle/delete in the application.
- Inventory every existing active production rule.
- Approve a separate keep/retire plan for each row before launch.

This is safer than the current control but removes surge operations until the
full publication workflow exists.

## Production-data requirement

Do not deploy a schema or behavior change blindly. Before promotion, inventory
all production pricing rules and report at least:

- ID, name, type, active state, category scope, service-area scope, priority,
  multiplier, platform share, creation/update timestamps, and referencing
  booking count;
- which active rows are global by `NULL` scope;
- overlap order for active rules;
- whether any active row was created through the scope-less Admin form.

E32 currently blocks that production inspection and synchronization.

## Work paused

Do not fix the 0-to-0.5 conversion in isolation, add client-only preview, expose
scope dropdowns that still publish immediately, change role authority, mutate
existing rules, or replace hard delete until Option A or B and its production
handling are explicitly approved. Read-only audit of unrelated areas may
continue in a later task.
