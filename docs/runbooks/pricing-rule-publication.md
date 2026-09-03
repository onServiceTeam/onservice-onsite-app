# Pricing-rule publication runbook

**Owner:** super-admin / finance operations
**Applies to:** `/pricing-rules`, migration `165_pricing_rule_publication_workflow.sql`
**Production status:** not deployed; E32 blocks server inventory and synchronization

## What this control changes

A published pricing rule can increase the customer total for a newly created
fixed-price booking and divide that increase between the provider and the
platform. It does not rewrite an existing booking, payment, refund, escrow,
commission record, or immutable booking financial-terms snapshot.

The lifecycle is:

1. **Draft:** inactive and editable by a super-admin. Both category and
   service-area scope are explicit, including an intentional global choice.
2. **Preview:** the server loads the canonical fixed-price service and live
   service area, evaluates the draft alongside active rules through the same
   resolver used by booking creation, and records the winner, overlap, customer
   total, surge, and provider/platform allocation.
3. **Published:** an unexpired preview created by the same operator is required.
   A changed draft or active-rule set invalidates the receipt. Publication and
   its reasoned Admin action commit in one transaction.
4. **Retired:** the rule stops participating in new pricing. The rule, decision
   reason, previews, Admin actions, and booking references remain available.

Ordinary admins have read-only visibility. Super-admin is required for draft,
preview, publish, and retire actions. There is no two-person approval mechanism
in the current authorization model.

## Non-negotiable checks before production migration

Do not apply migration 165 until the production inventory below has been saved
to a dated private operations record and reviewed. Do not put production query
results containing user information or secrets in Git.

```sql
SELECT
  pr.id,
  pr.name,
  pr.type,
  pr.is_active,
  pr.category_id,
  sc.name AS category_name,
  pr.service_area_id,
  sa.name AS service_area_name,
  sa.city,
  pr.priority,
  pr.multiplier,
  pr.platform_surge_share,
  pr.rush_hours_threshold,
  pr.holiday_date,
  pr.peak_start_time,
  pr.peak_end_time,
  pr.peak_days_of_week,
  pr.created_at,
  pr.updated_at,
  COUNT(b.id) AS referencing_booking_count
FROM pricing_rules pr
LEFT JOIN service_categories sc ON sc.id = pr.category_id
LEFT JOIN service_areas sa ON sa.id = pr.service_area_id
LEFT JOIN bookings b ON b.pricing_rule_id = pr.id
GROUP BY pr.id, sc.name, sa.name, sa.city
ORDER BY pr.is_active DESC, pr.priority DESC, pr.multiplier DESC, pr.created_at;
```

Separately identify active global scope and the resolver order:

```sql
SELECT
  id,
  name,
  type,
  category_id IS NULL AS all_categories,
  service_area_id IS NULL AS all_service_areas,
  priority,
  multiplier,
  platform_surge_share,
  updated_at
FROM pricing_rules
WHERE is_active = TRUE
ORDER BY priority DESC, multiplier DESC, created_at;
```

The reviewer must answer in writing:

- Which active rules are intentionally global?
- Which active rules overlap by category, area, and schedule?
- Does priority then multiplier produce the intended winner?
- Was any row likely created by the former scope-less Admin form?
- Which rows should remain `legacy_active`, be retired after migration, or be
  recreated through the new preview workflow?
- Does every referenced booking retain its existing pricing-rule and financial
  snapshot evidence?

## Migration procedure

1. Confirm the exact Git revision and take the database/config/Git backups
   required by the launch runbook.
2. Run migration 165 against a fresh or restored non-production database first.
3. Confirm every old row became `legacy_active` or `legacy_inactive` without a
   change to `is_active`.
4. Confirm new rules default to `draft` and `is_active = FALSE`.
5. Confirm the immutable-term and lifecycle trigger rejects a published-term
   rewrite and an invalid lifecycle reversal.
6. Run the focused pricing tests, the full API suite, and the Admin production
   build against the migrated database.
7. Apply the migration in the reviewed production window only after E32 is
   cleared. Do not publish or retire a legacy row as part of schema migration.
8. Re-run both inventory queries and compare IDs, active states, scopes, and
   booking-reference counts to the pre-migration record.

Migration 165 is additive but intentionally has no casual down procedure.
Restoring the old immediate-mutation behavior after operators have created
drafts/previews would discard audit meaning. If the migration fails before the
new application receives traffic, restore the reviewed backup. Otherwise stop
and write a production-data escalation before changing rows or constraints.

## Operator procedure

### Create or edit a draft

- Start from current demand/capacity evidence, not a desired revenue target.
- Choose category and service-area scope explicitly. Treat either global choice
  as high impact.
- Enter multiplier, priority, and the platform share of surge. A platform share
  of `0` is valid and must remain `0`.
- Write the operational reason. Saving a draft does not change customer prices.
- If the page reports that the draft changed in another tab, reload and review
  the newer record rather than overwriting it.

### Preview and publish

- Add representative fixed-price services, areas, dates, and times. A global
  rule needs samples across the markets/categories it could affect.
- Review the winning rule and every matching rule, not just the new total.
- Review customer total, platform surge, and provider surge in centavos-derived
  currency output.
- The draft must win at least one representative sample. If it does not, adjust
  the sample or reconsider scope/schedule/priority.
- Enter a separate publication reason describing what was verified.
- If the receipt expires or another active rule changes, run preview again.

### Retire

- Confirm the scope/schedule and why the rule should stop affecting future
  bookings.
- Enter a retirement reason. Retirement never deletes the row and never rewrites
  existing bookings.
- If a replacement is needed, publish the reviewed replacement as a separate
  record. Do not edit a published rule in place.

## Post-action evidence

For every publication or retirement, retain:

- rule ID and lifecycle state;
- operator, reason, and timestamp from `admin_actions` and the rule row;
- preview ID and sample results for publication;
- before/after active-rule inventory;
- a newly created test booking showing the expected snapshot; and
- an older booking proving its stored total and financial terms did not change.
