# Phase 06 — HONESTY CHECK

Things this phase **does NOT** ship, gaps from the original spec, and
shortcuts the AI coder took. Read this before declaring Phase 06 "done".

## flag_fraud is encoded via reason prefix, not as a first-class action

The `admin_actions.action_type` CHECK constraint (set by an earlier phase)
whitelists a finite set of values: `customer_suspended`, `customer_reactivated`,
etc. It does NOT include `flag_fraud`. To avoid widening that constraint
mid-phase, the service writes flag-fraud events under
`action_type='customer_suspended'` with the literal prefix `[fraud_flag] `
in the `reason` column. Downstream queries that want only "real" suspensions
must filter `WHERE reason NOT LIKE '[fraud_flag]%'`.

**Why we did not add a new action_type now:** widening a CHECK constraint
on a high-write table mid-phase would risk a long lock and conflicts with
the verify-master migration sanity scan. A future phase can introduce
`'customer_flagged'` properly.

**Tested:** `customer-admin.test.ts` — "flag_fraud writes admin_actions but
does NOT change is_active" asserts the prefix is present and `UPDATE users`
is not invoked.

## admin_actions.action_type is written as a SQL literal, not a parameter

In `creditCustomerWallet` the INSERT into `admin_actions` writes
`'customer_credited'` directly inline in the SQL string rather than via
`$N` parameter substitution. Reason: the value is a constant tied to the
CHECK-constraint surface, and using a literal makes the dependency obvious
when someone later edits the CHECK. Tests assert the literal is present
(`expect(adminAction.sql).toContain("'customer_credited'")`) so accidental
parameterisation would fail loudly.

## Wallet auto-creation on first credit

Customer wallet rows are NOT created at signup. `creditCustomerWallet`
performs a get-or-create inside the same transaction (`SELECT … FOR UPDATE`
→ if missing → `INSERT INTO wallets` → `SELECT … FOR UPDATE` again on the
new row). This is documented in pre-mortem Incident 3, including the
UNIQUE(user_id, type) constraint that protects against concurrent INSERTs.

## Spec endpoints we deferred

| Spec endpoint                               | Status     | Why |
| ------------------------------------------- | ---------- | --- |
| `POST …/refund` (full refund flow)          | **deferred** | Touches the sacred refund/dispute service; will be done as part of a focused refunds pass. |
| `POST …/message` (in-app message)           | **deferred** | Notification routing requires its own audit-trail design. |
| Address CRUD (admin-edit customer addresses)| **read-only** | Customer addresses are user-owned PII; admin write-back is out-of-scope for this phase. |
| `POST …/notes` (customer admin notes)       | **deferred** | No `customer_admin_notes` table exists yet; would require a new migration. Provider has notes (Phase 05); customer notes is its own scope. |
| `GET …/nps`                                 | **not-shipped** | No NPS scoring infra in the schema. The Profile tab uses `averageRatingGiven` (avg of reviews this customer wrote about providers) as a directional proxy. |
| `POST …/wallet/withdraw`                    | **deferred** | Withdrawals are not part of admin-360 scope. |
| `POST …/credit-card/decline-track`          | **out-of-scope** | Belongs in payments / fraud phase. |

What **is shipped** in Phase 06: the
Profile / Bookings / Payments / Disputes (with fraud detection) /
Referrals / Activity read endpoints + Status mutation (suspend / reactivate
/ flag_fraud) + Wallet credit. That covers the 6 tabs the spec demands as
the primary deliverable.

## Frontend gold-plating skipped

- CustomersPage CSV export and saved-segment filters: **not added** (out
  of scope for the core "make rows clickable" requirement).
- Suki tier progression progress bars: **not added** (data shown as raw
  numbers; visual progression bars are decorative).
- Customer-side timeline of in-app messages: **not added** (no message
  endpoint shipped).
- @mention notifications in the (deferred) notes feature: **not
  implemented** — no notes feature here at all.

## Tests written

`packages/api/__tests__/customer-admin.test.ts` — 36 unit tests, all PASS,
contributing to the **594/594** jest total (Phase 05 baseline 558 → +36
this phase). No tests were deferred; the in-phase mandate "A. Write the
tests. No deferral." was honored.

## Sacred-file touches (TD-005)

This phase writes to `wallet_transactions` (via `creditCustomerWallet`,
type='adjustment'). Per TD-005, sacred-file writes warrant mutation tests.
Coverage approach mirrors Phase 05:

- 11+ boundary tests on `creditCustomerWallet` itself, including the
  money-conservation invariant (balance_after == prev + delta), debit-
  vs-credit symmetry, get-or-create wallet path, and rollback when the
  ledger insert returns no id.
- A dedicated Stryker mutation run on `customer-admin.service.ts` is
  delegated to the verify-master mutation gate (already wired) rather
  than re-run by hand here.

## Migration count

Phase 06 ships **no new migrations**. All operations use existing tables
(`users`, `wallets`, `wallet_transactions`, `admin_actions`,
`customer_addresses`, `suki_memberships`, `bookings`, `disputes`,
`reviews`, `payment_intents`, `referral_codes`, `referrals`, `audit_log`,
`login_attempts`). The earlier migration 053 (extending
`wallet_transactions.type` CHECK to include 'adjustment') is what makes
the credit ledger row legal.
