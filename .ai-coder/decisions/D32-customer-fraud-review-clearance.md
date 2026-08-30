# D32 - Customer fraud-review clearance

Date: 2026-08-30
Status: OPEN - enforcement and audit contract required
Raised from: Customer 360 suspicion-first audit, Bugs UX-442/444

## Decision

How should an administrator clear `users.is_flagged_fraud` after a customer review is complete?

## Current behavior and evidence

- A super-admin can add the durable fraud-review marker with a reason.
- The marker is now visible in Customer 360 and duplicate flagging is rejected.
- The marker is internal. It does not suspend the customer, decide a dispute, cancel a booking, move money, or notify the customer.
- The current schema has `customer_flagged_fraud` but no corresponding clearance action in the `admin_actions.action_type` constraint.
- Reactivating a suspended customer deliberately does not clear the marker.
- Directly setting the boolean to false would destroy the distinction between an explicit reviewed clearance and an accidental data edit.

## Options

### Option A - Explicit review clearance (recommended)

- Add a `customer_fraud_review_cleared` audit action through a forward-only migration.
- Restrict clearance to super-admin.
- Require a reason that references the reviewed cases and evidence.
- Atomically record previous and next flag state with the clearance action.
- Do not change account activation, bookings, disputes, balances, or notifications.
- Keep the historical flag and clearance records visible in Customer 360 activity.

Benefits: reversible operational state with a permanent decision trail and no hidden money or account effect.

Tradeoff: requires a schema migration and deployment window.

### Option B - Clear on reactivation

Benefits: fewer controls.

Tradeoff: incorrectly couples two independent decisions and can erase an unresolved trust review.

### Option C - Never clear the marker

Benefits: no schema change.

Tradeoff: creates permanent false positives and makes the marker lose operational meaning.

## Recommendation

Choose Option A. A fraud-review marker should be a review state, not a permanent accusation and not a side effect of account activation.

## Safe behavior while open

- Show the current marker and block duplicate flagging.
- Keep fraud analytics advisory and internal.
- Do not clear the marker through reactivation or a direct database edit.
- Continue unrelated Customer 360 and admin audit work.
