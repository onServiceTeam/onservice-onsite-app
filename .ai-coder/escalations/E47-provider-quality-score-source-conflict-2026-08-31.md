# E47 — Provider quality score definitions conflict

**Date:** 2026-08-31
**Status:** OPEN — recomputation held; existing snapshots remain read-only
**Hard-stop reason:** provider discipline and tier decisions must not rely on an invented or contradictory score

## Bad news first

The Admin Analytics page presents one automated `overall_score`, but the code
and the approved operations scorecard define different models.

The implemented snapshot in
`packages/api/src/services/admin-analytics.service.ts` weights:

- provider lifetime aggregate rating: 30%;
- booking completion state: 25%;
- completion no later than two hours after the scheduled start: 20%;
- provider cancellation share: 15%;
- quote-response time: 10%.

The monthly scorecard in `docs/operations/12-quality-standards-and-kpis.md`
instead specifies rating 35%, acceptance 20%, cancellation 20%, dispute rate
15%, and on-time arrival 10%. It also defines on-time as arrival within the
scheduled window, not completion within two hours of the scheduled start.

These are not presentation variants of the same metric. They can rank the same
provider differently and can lead to different coaching, suspension, tier, and
dispatch decisions. The implemented two-hour completion test also disadvantages
services whose legitimate duration exceeds two hours.

## Safe containment

- Do not recompute or replace quality snapshots from the Admin UI or public
  admin API while this conflict is open.
- Keep existing snapshots read-only and label them as a legacy automated index,
  not the monthly operations scorecard or an approved discipline decision.
- Show every stored component, snapshot period, calculation time, and a link to
  Provider 360 so an operator can inspect the underlying jobs, reviews,
  disputes, notes, and current account state.
- Do not use the legacy overall score alone to suspend, demote, feature, or
  change commission for a provider.

No stored score, provider status, tier, dispatch rank, commission, booking, or
production row is changed by this containment.

## Decision required

Choose one canonical quality model and define each numerator, denominator,
period, exclusion, source timestamp, and operational consequence.

1. **Make the operations scorecard canonical (recommended).** Implement rating,
   acceptance, cancellation, dispute, and arrival evidence using the definitions
   in the operations manual, then retire or migrate the legacy snapshots.
2. **Approve a revised automated model.** Keep some or all current components,
   but explicitly approve the weights, long-job handling, no-signal defaults,
   and how the result may affect provider operations.
3. **Retire the combined score.** Keep the component evidence and let staff use
   the documented monthly review without a single automated overall number.

The recommendation is Option 1 because it preserves the already documented
operating process and makes the admin screen support, rather than contradict,
provider reviews.
