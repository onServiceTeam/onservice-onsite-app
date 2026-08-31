# E45 — Referrer first-booking credit is not atomic

**Date:** 2026-08-31
**Status:** OPEN — money-path hard stop
**Scope:** `packages/api/src/services/referral.service.ts`

## What was found

`creditReferrerAfterBooking(bookingId, customerId)` reads an uncredited
`referral_redemptions` row with a normal `db.query` before opening its wallet
transaction. The later transaction credits the wallet and only then marks the
redemption credited. The initial read has no `FOR UPDATE`, and the update has no
`referrer_credited = FALSE` compare-and-set condition.

Two completion calls for the same referred customer can therefore both observe
the same uncredited row, enter separate transactions, and each add the referral
bonus to the referrer's wallet. The unique index on `referee_id` prevents two
redemption rows; it does not prevent two credits against one row.

The function also loads or creates the referrer's wallet outside the credit
transaction even though `walletService.getUserWalletInTransaction` exists for
money paths.

## Customer, admin, and company impact

- The referrer can receive the same “first completed booking” bonus more than
  once.
- Two wallet ledger entries can reference the same redemption.
- Customer 360 referral totals and the wallet balance can disagree with the
  intended one-bonus policy.
- Support and Finance have no reliable automatic recovery path for an excess
  credit.

## Recommended correction

Use one database transaction that:

1. selects the eligible redemption with `FOR UPDATE`;
2. returns without mutation when no uncredited row remains;
3. obtains the customer wallet through
   `getUserWalletInTransaction(client, referrerId, 'customer')`;
4. credits the wallet, inserts the ledger row, and changes
   `referrer_credited` plus `qualifying_booking_id` atomically; and
5. uses a conditional update or a unique ledger idempotency key as defense in
   depth.

Add a real concurrency or repeated-call test proving only one wallet credit is
committed for one redemption.

## Why this batch stops at the boundary

This is a ledger and wallet mutation. `AGENTS.md` requires a hard stop when a
money risk is discovered. The customer referral copy accurately describes the
intended business rule, so no UI claim was changed. The atomic settlement fix
must land as a dedicated money-path change with its own behavioral verification.
