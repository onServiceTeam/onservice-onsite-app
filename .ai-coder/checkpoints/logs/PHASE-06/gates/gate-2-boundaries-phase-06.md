# Phase 06 — Boundary Tests

Boundary behavior for each new service function. ✓ = covered by a unit test
in `packages/api/__tests__/customer-admin.test.ts`. (T) = test name reference.

## getCustomerProfile(id)
- ✓ id matches no row → throws 404 (T: "returns 404 when customer missing")
- ✓ valid id → projects nested addresses + suki memberships + lifetime stats
       (T: "projects nested addresses + suki memberships + lifetime stats")
- ✓ NULL avg_rating → averageRatingGiven coerced to null (T: "handles null
       avg_rating and empty arrays")
- ✓ Empty addresses + empty suki memberships → returns []
- BIGINT columns (lifetime_spent, total_spent) coerced via Number()

## getCustomerBookings(customerId, page, pageSize, status?)
- ✓ page = 0 → clamped to 1; pageSize = 9999 → clamped to 100
       (T: "clamps page/pageSize and returns rows + total")
- ✓ status filter appends $2 placeholder (T: "applies status filter via $2
       placeholder")
- ✓ NULL category_name → coerced to "Uncategorized" (T: "coerces null category")
- ✓ providerId/providerBusinessName preserved as null (when bookings exist
       without an assigned provider)
- has_dispute is computed via EXISTS subquery (no N+1)

## getCustomerPayments(customerId)
- ✓ Aggregates wallet + transactions + intents + method counts (T: "aggregates
       wallet, transactions, intents, method counts")
- ✓ No wallet row → returns 0 / 0 / [] / [] / {} (T: "returns zeros when
       no wallet exists") — this read does NOT auto-create a wallet
- ✓ paymentMethodCounts maps {payment_method: count} from a single GROUP BY

## getCustomerDisputes(customerId)
- ✓ Sparse history (1 dispute) → flagged=false, disputesLast30Days=1
       (T: "projects rows + reports no-flag for sparse history")
- ✓ 5 disputes in 30d, 4/5 favor provider → flagged=true, rate=0.8,
       reason includes "5 disputes in 30 days" + "80%"
       (T: "flags fraud pattern when 5+ disputes in 30d and ≥80% favor provider")
- ✓ 1 recent dispute → flagged=false (T: "does not flag when fewer than 5")
- ✓ No resolved disputes in window → favorProviderRate=null, flagged=false
       (T: "returns null favor rate when no resolved disputes in window")
- LIMIT 200 ceiling on the query
- favor-provider set: {'no_refund','refund_with_warning','refund_with_suspension'}

## getCustomerReferrals(customerId)
- ✓ Aggregates own codes, given, received, and total earned
       (T: "aggregates own codes, given, received, and total earned")
- ✓ totalEarnedFromReferrals counts ONLY referrals where referrer_credited=true
       (uncredited rows excluded)
- ✓ No referrals → ownCodes=[], given=[], received=null,
       totalEarnedFromReferrals=0 (T: "handles no referrals gracefully")
- received returns at most 1 row (LIMIT 1)

## getCustomerActivity(customerId, limit)
- ✓ Customer missing → 404 (T: "throws 404 when customer missing")
- ✓ Merges audit + login + admin_actions; sorts desc by createdAt
       (T: "merges audit + login + admin_actions and sorts desc")
- ✓ limit clamped to [1,200] for each underlying query
       (T: "clamps limit to [1,200]")
- login query keys on users.phone (HONESTY-CHECK documents fragility)

## updateCustomerStatus(customerId, action, reason, adminUserId)
- ✓ reason shorter than 5 chars → 400 (T: "rejects short reason")
- ✓ Invalid action → 400 (T: "rejects invalid action")
- ✓ Customer missing → 404 (T: "404 when customer missing")
- ✓ Suspend on active → flips is_active false; admin_actions.action_type
       = 'customer_suspended' (T: "suspends an active customer")
- ✓ Reactivate on suspended → flips is_active true; action_type
       = 'customer_reactivated' (T: "reactivates a suspended customer")
- ✓ flag_fraud → does NOT touch is_active; admin_actions reason prefixed
       with `[fraud_flag] ` (T: "flag_fraud writes admin_actions but does
       NOT change is_active")
- ✓ Idempotent: suspend on already-suspended customer skips UPDATE
       (T: "skips UPDATE when suspending an already-suspended customer")
- Wraps SELECT … FOR UPDATE → optional UPDATE → INSERT in db.transaction

## creditCustomerWallet(customerId, deltaAmount, reason, adminUserId)  ← SACRED
- ✓ Zero / non-integer (1.5 / NaN) delta → 400 (T: parameterized via .each)
- ✓ Empty / whitespace / "tiny" reason → 400 (T: parameterized via .each)
- ✓ Customer missing → 404 (T: "404 when customer missing")
- ✓ Negative resulting balance → 400 (T: "rejects when adjustment would
       make balance negative")
- ✓ Credit case: balance_after == prev + delta, paired ledger row + paired
       admin_actions row written inside the same transaction
       (T: "credits existing wallet, writes paired ledger row +
            admin_actions, conserves money")
- ✓ Auto-creates wallet when none exists, then credits it (lock re-acquired
       on the new row) (T: "creates a new wallet when none exists, then
       credits it")
- ✓ Debit case: same invariant with negative delta and non-negative result
       (T: "debits wallet correctly when delta is negative and remains
            non-negative")
- ✓ Ledger insert returning no id → 500 → entire transaction rolls back
       (T: "rolls back via thrown error when ledger insert returns no id")
- Uses SELECT … FOR UPDATE on both users (customer) row and wallets row
- description embeds `[admin:<id>]` and the verbatim reason
- reference_id encoded as `admin_credit:<id>` for traceability
- admin_actions.action_type written as a SQL literal `'customer_credited'`
  (NOT a parameter) because the existing admin_actions CHECK constraint
  whitelists this value but psql parameter substitution would treat it as
  arbitrary text — encoded as literal documents the CHECK dependency.
