# E28 — Admin pricing rules lack authoritative preview and staged publication

**Date:** 2026-08-25  
**Status:** OPTION 1 IMPLEMENTED LOCALLY; PRODUCTION INVENTORY, MIGRATION, AND DEPLOYMENT HELD BY E32
**Hard stop:** money-path behavior and customer/provider revenue allocation

## What the admin audit found

`apps/admin/src/pages/PricingRulesPage.tsx` can create and edit an active surge rule immediately. It can also toggle a rule with a generic browser confirmation. The screen shows one rule at a time but cannot preview the actual server result for a representative booking or identify which existing rule would win after priority and multiplier ordering.

The live pricing resolver in `packages/api/src/services/pricing.service.ts` selects active rules by category and service area, orders them by priority then multiplier, applies the first time/date match, increases the customer price, and divides the surge amount using `platform_surge_share`. A form-level summary is therefore not enough to prove the impact of a proposed rule.

This is already listed as `ADM-012` in `docs/audits/COMPREHENSIVE-271-ISSUE-AUDIT.md` and as a money-path TODO in `docs/audits/CURRENT-PLATFORM-AUDIT-2026-08-22.md`. W1 removed decorative shadow from the page but did not change rule semantics, activation, pricing, or revenue allocation.

## Decision required

Choose the publication contract before this control is rebuilt:

1. **Server-authoritative preview plus explicit publish (recommended).** Save a draft, preview several category/service-area/date/base-price cases through the same resolver used by booking creation, display the winning rule and customer/provider/platform amounts, then publish with a reason.
2. **Immediate save with one confirmation.** Lower implementation cost, but the operator still cannot see overlap or actual booking totals. Not recommended for a live money control.
3. **Keep pricing rules read-only/disabled for launch.** Safest if surge is not needed at launch; existing active rows would need a separately approved handling plan.

Also decide whether delete should remain a hard delete or become an audited deactivation that preserves rule history independently of booking foreign-key references.

## Work that may continue

Read-only inspection, responsive layout, accessibility, truthful labels, and tests that do not change calculation or publication behavior may continue. Do not add a client-only preview, infer overlap rules, alter priority resolution, change multipliers or revenue shares, or enable/disable production rules until this decision is answered and tested on a topic branch.

## Decision update - 2026-09-02

Ken approved Option 1, expanded by E54 as the draft, authoritative preview,
explicit publish, and retirement workflow. Pricing mutation and publication
authority is super-admin only under the existing privileged-money-action
policy; ordinary admins retain read-only visibility. Published records are not
edited or hard-deleted. Existing booking financial snapshots are unchanged.

Implementation is proceeding on the existing money-path topic branch.
Production inventory, migration, and deployment remain blocked by E32 until
server access is restored.

