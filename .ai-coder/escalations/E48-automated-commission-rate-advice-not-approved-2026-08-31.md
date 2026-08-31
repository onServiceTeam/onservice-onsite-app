# E48 — Automated provider commission-rate advice is not approved

**Date:** 2026-08-31
**Status:** OPEN — automated rate output removed from operator use
**Hard-stop reason:** commission changes affect provider earnings and platform revenue

## Bad news first

Admin Analytics calculates a `suggestedRate` for every provider tier. With a
large enough sample it lowers commission by two percentage points for high
quality/high completed value, or raises commission by two percentage points
when the legacy quality score is below 60. No active decision or operations
policy approves that formula.

The low-quality branch is especially unsafe: increasing the platform charge on
providers because a disputed quality index is low is a business policy choice,
not an analytical fact. The output can influence a super-admin even though the
screen says it is read-only.

## Safe containment

- Stop returning and displaying an automated recommended or rule-output rate.
- Keep a read-only evidence view with the current live tier rate, approved
  provider count, completed-booking sample, completed booking face value, and
  the count of legacy quality snapshots.
- Label completed booking value as gross booking face value, not platform
  revenue or provider earnings.
- Do not change any commission setting, provider tier, booking amount, payout,
  wallet, or production row.

This is reversible. It removes unsupported advice without selecting a new
commission policy.

## Decision required

Before automated rate advice returns, approve:

1. the business objective (provider retention, supply growth, service quality,
   margin, or a declared balance of those objectives);
2. the canonical quality model after E47;
3. minimum sample and comparison periods;
4. a server-authoritative impact preview across provider earnings and company
   revenue; and
5. the proposal, review, approval, publication, rollback, and audit workflow.

The recommended launch position is no automated rate advice. Use the evidence
view and a separately documented, human-approved commission review until those
controls exist.
