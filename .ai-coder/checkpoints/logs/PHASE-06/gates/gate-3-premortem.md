# Phase 06 — Pre-Mortem

Five plausible incident scenarios for Customer 360 in production.

## 1. Compromised super-admin abuses customer-credit endpoint

**Scenario:** A super-admin account is compromised. Attacker calls
`POST /api/v1/admin/customers/:id/credit` with `amount: 100_000_00` (₱100k)
and `reason: "thanks for being a customer"` against many customer accounts,
then immediately moves the credits out via wallet → bookings or wallet →
withdraw flows.

**Detection:** Each credit writes BOTH a `wallet_transactions` row of
`type='adjustment'` AND an `admin_actions` row with
`action_type='customer_credited'`. A daily anomaly alert on
`SELECT COUNT(*) FROM admin_actions WHERE action_type='customer_credited'
  AND created_at >= NOW() - INTERVAL '1 day'` exceeding a threshold (e.g. 5)
should fire. Reference IDs encode the admin: `admin_credit:<adminId>`,
making attribution trivial.

**Mitigation now:** `creditCustomerWallet` runs entirely inside one
`db.transaction`; the wallet row is `SELECT … FOR UPDATE` locked, so
concurrent twin requests cannot double-credit. Customer must exist with
role='customer'.

**Future hardening:** require dual-control for credits above a configurable
centavo cap. Auto-throttle: refuse > N credits per admin per hour.

## 2. Fraud-pattern false-positive triggers wrong suspension

**Scenario:** A legitimately-aggrieved customer files 5 disputes in 30 days,
all of which the dispute team genuinely resolves in the provider's favor
because the customer's evidence is weak. The fraud banner fires. A new
admin sees the banner, hits Flag-for-Fraud (or worse: Suspend) without
reading the actual disputes. Real customer is locked out.

**Detection:** Pre-mortem is the detection — admins must read the disputes
before acting. The flag is advisory; the system never auto-actions.

**Mitigation now:** Banner copy ("Possible fraud pattern") is hedged.
Suspend / Flag-Fraud both require a typed reason (≥5 chars) recorded in
`admin_actions`, providing an audit trail for human reversal.

**Future hardening:** Add a "false-positive ack" button that records the
admin's review without taking action, so subsequent admins see the prior
review. Tune the 5/30d/80% thresholds against ground truth once we have
enough labeled cases.

## 3. Wallet auto-creation race during first credit

**Scenario:** Two super-admins simultaneously attempt to credit a customer
who has no wallet row yet. Both transactions hit the
`SELECT … type='customer'` lock at the same instant; both see no row;
both attempt `INSERT INTO wallets`.

**Detection:** Without protection, one INSERT would succeed, the other
would 500 on a unique-constraint violation (or — worse — both could
succeed if there is no unique constraint, leaving a customer with two
wallet rows that diverge over time).

**Mitigation now:** The schema has a UNIQUE(user_id, type) constraint on
`wallets`, so the second INSERT fails fast with a constraint violation,
the entire transaction rolls back, and the second super-admin sees a 500.
No partial state, no double wallet. If this becomes operationally noisy,
upgrade the get-or-create to `INSERT … ON CONFLICT DO NOTHING RETURNING …`
followed by a SELECT.

## 4. Suki memberships double-count after a manual booking-recount

**Scenario:** A future migration recomputes `suki_memberships.total_bookings`
or `total_spent` from scratch by replaying historical bookings, but the
Profile tab also pulls those columns directly. If the recount runs
asynchronously (e.g., a background job), admins viewing the Profile tab
during the run see flickering numbers and may complain or take action on
stale data.

**Detection:** The recount script will print before/after deltas; admins
seeing > 0 deltas after the run should hold on customer-facing actions
until the run completes.

**Mitigation now:** Profile tab reads pre-computed columns, so during
normal operation the numbers are consistent. There is no live aggregation
in this phase.

**Mitigation later:** Wrap any future recount in a single transaction or
add a `last_recomputed_at` column so the UI can warn "stats are X minutes
stale".

## 5. Referral self-redemption via address spoofing

**Scenario:** A customer creates a second account under a different phone
and uses their own referral code. Both sides claim the bonus. With weak
device-fingerprint checks, this is the easiest fraud vector against the
totalEarnedFromReferrals figure shown on the Referrals tab.

**Detection:** The Referrals tab clearly shows `referrer_credited` and
the qualifying booking ID. Admins reviewing fraud-flagged customers
(see Incident 2) can cross-check whether the referee is from the same
device / address / IP.

**Mitigation now:** This phase only **displays** referral data; it does
not credit referrals. No code path here changes who gets the bonus.
The fraud is created by the referral-creation pipeline (a different
phase), not Customer 360.

**Mitigation later:** Add device-fingerprint and ASN match scoring to
the referral attribution job and surface "suspected self-referral"
chips on the Referrals tab.
