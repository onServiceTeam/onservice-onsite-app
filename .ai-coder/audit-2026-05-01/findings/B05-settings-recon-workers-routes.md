# Phase B Findings Part 5 — Settings, Reconciliation, Workers, Small Routes

Files added in this batch:
- `services/settings.service.ts` (498) — foundational, called by 30+ services
- `services/reconciliation.service.ts` (472) — daily money snapshot
- `jobs/workers.ts` (566) — all background scheduled jobs
- `routes/payment.routes.ts` (117)
- `routes/payout.routes.ts` (160)
- `routes/tip.routes.ts` (86)

**Phase B running total: ~6,901 lines fully read** (was 5,102; +1,899 this batch).

---

## CRITICAL bugs (continuing from CRIT-23)

### CRIT-24 — Settings update + audit are NOT in a transaction
**File:** [packages/api/src/services/settings.service.ts:287-300](packages/api/src/services/settings.service.ts#L287)
```ts
const updated = await db.query<SettingRow>(
  `UPDATE platform_settings SET value = $1, ... RETURNING *`,
  [newValue, changedBy, key],
);

await db.query(
  `INSERT INTO platform_settings_audit (...) VALUES (...)`,
  [...],
);
```
Two separate top-level queries. If audit INSERT fails (DB hiccup, FK violation, etc.) after UPDATE commits, the platform setting is changed with **NO AUDIT TRAIL.** This is a compliance disaster for money-relevant settings (commission rates, fee caps, refund tiers). Phase 14 D06 fixed similar pattern in payout.service.ts but missed this one.

**Fix dispatch:**
```
1. Wrap both queries in db.transaction(async (client) => { ... }).
2. Same fix for resetToDefault (line 343 calls updateSetting, inherits the bug).
3. Same fix for bulkUpdateSettings (line 315-333, no transaction wrapping the loop — partial state on mid-loop failure).
4. Add test: simulate audit INSERT failure (e.g., violate change_reason length constraint), assert UPDATE rolls back.
```

### CRIT-25 — Settings DB read failure silently falls through to in-memory defaults
**File:** [packages/api/src/services/settings.service.ts:139-159](packages/api/src/services/settings.service.ts#L139)
```ts
try {
  const result = await db.query<{ value: string }>(...);
  if (result.rows.length > 0) { return val; }
} catch (err) {
  logger.error('Settings DB read failed', { key, error });
}
const fallback = SETTING_DEFAULTS[key];
if (fallback !== undefined) return fallback;
```
A transient DB error → falls back to hardcoded `SETTING_DEFAULTS`. If admin updated `commission_rate_pro` from 11 to 9 in the DB, but the DB blip happens during a booking creation, **the booking is created with the OLD 11% rate, no warning to anyone.** Money flows under the wrong rate.

**Fix dispatch:**
```
1. Define a money-relevant key allowlist (commission_rate_*, service_fee_*, guarantee_fund_rate, cancel_refund_*, vat_rate, minimum_payment_amount, minimum_withdrawal_amount, tip_max_amount_cents).
2. For these keys, on DB-read failure, throw createAppError('Settings read failed; refusing to apply default for money-relevant key', 503) instead of falling through.
3. For non-money keys (cache TTLs, OTP length, branding), keep the current fallback behavior.
4. Add tests: mock DB throw on getSetting('commission_rate_pro'), assert 503 thrown not silently 11%.
```

### CRIT-26 — Wallet-payment flow has 4 sequential commits (no transaction)
**File:** [packages/api/src/routes/payment.routes.ts:46-72](packages/api/src/routes/payment.routes.ts#L46)
```ts
if (paymentMethod === 'wallet') {
  await walletService.debitWallet(...);          // tx 1
  await paymentService.updatePaymentStatus(...);  // tx 2
  await db.query(`UPDATE bookings SET status = 'paid', escrow_status = 'held' ...`);  // tx 3
  await escrowService.holdInEscrow(...);          // tx 4
  res.status(201).json({ success: true, ... });
}
```
Four independent commits. If tx2/3/4 fails after tx1 commits, customer wallet is debited but booking isn't paid OR escrow isn't held. UI shows error → customer thinks payment failed → tries again → wallet debited twice.

**Fix dispatch:**
```
1. Refactor into one db.transaction(async (client) => { ... }):
   - debitWalletInTransaction(client, ...)
   - updatePaymentStatusInTransaction(client, ...)
   - UPDATE booking SET status='paid', escrow_status='held'
   - escrowService.holdInEscrowInTransaction(client, ...)
2. holdInEscrow currently is in its own tx (escrow.service.ts:31-36). Add an InTransaction variant per the D06 pattern.
3. Same problem exists in the webhook handler (CRIT-18 in B04). Fix both call sites.
4. Add integration test: hit POST /intent with wallet payment, kill DB connection between tx1 and tx2, assert wallet balance returned to original on retry.
```

### CRIT-27 — Auto-confirm worker can release escrow before booking commits
**File:** [packages/api/src/jobs/workers.ts:55-105](packages/api/src/jobs/workers.ts#L55)
The autoConfirm worker:
1. UPDATE booking → 'confirmed' (commit 1)
2. escrowService.releaseEscrow() (commit 2 — itself a transaction with multiple wallet UPDATEs)
3. UPDATE booking → 'payout_ready' (commit 3)

Manual rollback if step 2 throws (line 67-74). But:
- **Race window:** another process could query booking status='confirmed' between commits 1 and 2 and act on it.
- **Step 3 has no rollback** (line 82-87): if it fails, escrow is released but booking is stuck at 'confirmed' forever. Logged but no recovery.

The D06 `releaseEscrowInTransaction` pattern exists — should be used here.

**Fix dispatch:**
```
1. Wrap all three steps in one db.transaction:
   await db.transaction(async (client) => {
     // SELECT ... FOR UPDATE
     // UPDATE bookings SET status='confirmed'
     // releaseEscrowInTransaction(client, bookingId)
     // UPDATE bookings SET status='payout_ready'
   });
   // After commit (outside transaction):
   // - send notification
   // - issue OR (best effort)
2. Add SKIP LOCKED to the initial SELECT for multi-instance safety.
3. Test: simulate step 3 failure, assert escrow movements rolled back.
```

### CRIT-28 — Tip booking endpoint leaks any user's tips on any booking
**File:** [packages/api/src/routes/tip.routes.ts:70-84](packages/api/src/routes/tip.routes.ts#L70)
```ts
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
  const tips = await tipService.getTipsByBooking(bookingId);
  res.json({ success: true, data: tips.map(...) });
});
```
**No ownership check.** Any authenticated user can pass any bookingId and see all tips for that booking, including the customer's name (via tip→customer_id lookup), tip amount, and message. Privacy leak across the platform.

**Fix dispatch:**
```
1. Before returning tips, verify the requester is:
   - The customer of the booking, OR
   - The provider assigned to the booking, OR
   - An admin/super_admin (with appropriate staff perm).
2. SELECT b.customer_id, b.provider_id FROM bookings b WHERE b.id = $1, then check req.user.userId.
3. Add tests: customer A queries customer B's booking tips → 403.
```

### CRIT-29 — completePayout endpoint accepts arbitrary paymongoTransferId without validation
**File:** [packages/api/src/routes/payout.routes.ts:143-158](packages/api/src/routes/payout.routes.ts#L143)
```ts
router.put('/:id/complete', authMiddleware, async (req, res, next) => {
  requireAdmin(req);
  const payout = await payoutService.completePayout(id, req.body.paymongoTransferId);
  ...
});
```
- No validationMiddleware (no Zod schema).
- `paymongoTransferId` is optional (per MED-02 from B01).
- Any string accepted, no format check.

Combined with CRIT-23 (RBAC ignores staff perms), any user with role='admin' can mark any payout 'completed' with a fake or empty transfer ID. Money is "released" in DB without bank confirmation.

**Fix dispatch:**
```
1. Add validators/payout.validators.ts:completePayoutSchema = z.object({
     paymongoTransferId: z.string().min(8).max(64).regex(/^tr_[a-zA-Z0-9]+$/),
   }).strict();
2. Apply validationMiddleware(completePayoutSchema) to the route.
3. Make payoutService.completePayout's paymongoTransferId required (drop the ?).
4. Tests: missing field → 400; bad format → 400; valid → success.
```

### CRIT-30 — Reconciliation has no auto-fetch of PayMongo balance
**File:** [packages/api/src/services/reconciliation.service.ts:178-271](packages/api/src/services/reconciliation.service.ts#L178)
The daily reconciliation cron runs without `paymongoBalance` (since cron has no manual input). Result: every daily snapshot has `paymongo_balance=NULL` and discrepancy=0. **Discrepancy detection is effectively disabled until ops manually re-runs with the PayMongo balance.**

PayMongo has a `/balance` API. Should be fetched automatically.

**Fix dispatch:**
```
1. Add to runDailyReconciliation: if input.paymongoBalance === undefined && process.env.PAYMONGO_SECRET_KEY, GET https://api.paymongo.com/v1/balance, parse balance.attributes.available.balance, set paymongoBalance.
2. On API error: log warning, proceed with paymongoBalance=null (current fallback).
3. Schedule daily auto-run via workers.ts (currently no schedule entry — see WORK-17 below).
4. Test: mock PayMongo /balance with mismatched value, assert discrepancy_alert_sent=true.
```

### CRIT-31 — Reconciliation discrepancy alert never reaches a human
**File:** [packages/api/src/services/reconciliation.service.ts:8-12, 257-270](packages/api/src/services/reconciliation.service.ts#L257)
Comment explicitly says "DB flag + structured error log IS the alert. Actual outbound dispatch (Slack/email) is intentionally deferred." But:
- No notifications table INSERT for admins.
- No admin UI page that reads `listAlertedSnapshots()` (need to verify in admin pages — Phase F).
- If log shipper breaks (or Slack integration not set up), money discrepancies pile up undetected.

For a launch product handling real pesos, this is a single point of failure.

**Fix dispatch:**
```
1. After alertSent=true, INSERT notifications row for each active admin/super_admin user with type='reconciliation_alert', includes snapshot_id and discrepancy amount.
2. Verify admin DispatchConsole or FinancialsPage reads listAlertedSnapshots and displays a banner.
3. Add SMS/email to operations@onservice.us via existing notification.service templates if available.
4. Test: discrepancy > threshold, assert at least one notifications row INSERT'd to admin user.
```

---

## MEDIUM bugs

### MED-24 — Settings cache cold + 13 sequential gets in /config
**File:** [packages/api/src/services/settings.service.ts:406-452](packages/api/src/services/settings.service.ts#L406)
`getClientConfig` calls `getSetting*` ~13 times sequentially. Cold cache = 13 sequential DB roundtrips per /config request. Mobile clients hit /config on every app open. Real perf bug under load.

**Fix:** call `getAllSettings()` once, build a map, pluck values from it.

### MED-25 — `getSettingsByCategory` doesn't filter is_active
**File:** [packages/api/src/services/settings.service.ts:218-224](packages/api/src/services/settings.service.ts#L218)
Inactive settings returned to admin UI category view. Either intentional (admin sees draft settings) or unintended. Document the contract.

### MED-26 — `getCommissionRate` falls back silently to 'new' tier on missing tier
**File:** [packages/api/src/services/settings.service.ts:181-187](packages/api/src/services/settings.service.ts#L181)
If a new tier name is added (e.g., 'platinum') but no `commission_rate_platinum` setting exists, falls back to `commission_rate_new`. No log, no error. New-tier providers silently get the wrong commission. At minimum, `logger.warn` with the tier name.

### MED-27 — bulkUpdateSettings has no outer transaction
**File:** [packages/api/src/services/settings.service.ts:315-333](packages/api/src/services/settings.service.ts#L315)
Sequential while loop, each updateSetting in its own (currently broken — see CRIT-24) transaction. If update 5 of 10 fails, 1-4 are committed, 5-10 are not. Admin UI shows partial state. Wrap loop in one transaction.

### MED-28 — auto-confirm worker SELECT has no row lock
**File:** [packages/api/src/jobs/workers.ts:47-52](packages/api/src/jobs/workers.ts#L47)
Multiple API instances → contention. Use `SELECT ... FOR UPDATE SKIP LOCKED` or a job-claim pattern.

### MED-29 — NBI suspend → notify ordering allows missed notifications
**File:** [packages/api/src/jobs/workers.ts:206-227](packages/api/src/jobs/workers.ts#L206)
Marks `nbi_expiry_notified=TRUE` (line 216) BEFORE running suspend UPDATE (line 222). If suspend throws, notified flag is set but provider isn't suspended. Next worker run skips them (already notified) and they continue accepting jobs with expired NBI. Wrap in transaction OR set notified flag only after successful suspend.

### MED-30 — Bypass detection runs WEEKLY (line 498), too infrequent
**File:** [packages/api/src/jobs/workers.ts:497-501](packages/api/src/jobs/workers.ts#L497)
Customers can be flagged for bypass attempts up to 7 days after the message. Move to daily (or hourly).

### MED-31 — No-show detection only sends notifications, no auto-action
**File:** [packages/api/src/jobs/workers.ts:241-295](packages/api/src/jobs/workers.ts#L241)
Customer + provider notified, but no follow-up. After, e.g., 60 min past no-show, should auto-cancel with provider penalty. Currently customer must manually cancel + dispute.

### MED-32 — Admin notification for bypass picks first 5 admins (no ORDER BY)
**File:** [packages/api/src/jobs/workers.ts:374-385](packages/api/src/jobs/workers.ts#L374)
Postgres LIMIT without ORDER BY = nondeterministic. Same 5 admins could always be selected, or different admins each run. Use a dedicated "operations alerts" admin role + notify all of them.

### MED-33 — Worker scheduler concurrency=1 — long jobs block fast jobs
**File:** [packages/api/src/jobs/workers.ts:472](packages/api/src/jobs/workers.ts#L472)
If quality-score-compute runs 5+ minutes, blocks the next 5-min auto-confirm. Use multiple workers or split queues per job type.

### MED-34 — Reconciliation acknowledgment audit row outside transaction
**File:** [packages/api/src/services/reconciliation.service.ts:355-405](packages/api/src/services/reconciliation.service.ts#L355)
The transaction handles snapshot UPDATE, but `insertAuditRow` (line 396) runs after and is wrapped in best-effort try/catch. For acknowledgments, audit IS the attribution — should be required, in same transaction.

### MED-35 — listAlertedSnapshots loses ack'd discrepancies from view
**File:** [packages/api/src/services/reconciliation.service.ts:460-472](packages/api/src/services/reconciliation.service.ts#L460)
Once ack'd, `discrepancy_alert_sent=FALSE`, snapshot disappears from list. Admin can't see history of past discrepancies that were ack'd. Add `acknowledged_at` column, distinguish "active alert" vs "historical resolved discrepancy".

### MED-36 — payment.routes /intent has no row lock on booking
**File:** [packages/api/src/routes/payment.routes.ts:24-44](packages/api/src/routes/payment.routes.ts#L24)
Two concurrent /intent calls for same booking can both create intents. UPDATE is unconditional. Wrap in transaction with `SELECT ... FOR UPDATE`.

---

## LOW / INFO

- `settings.service.ts` is otherwise well-architected. 3-tier read (Redis → DB → defaults) with try/catch around each tier is correct cache hygiene. Validation function is clean.
- `reconciliation.service.ts` is well-written: read-only against wallets, append-only to snapshots, validates date format and ranges. The thin `insertAuditRow` best-effort pattern is appropriate for snapshot audit (snapshot IS the artifact).
- `workers.ts` regex bypass patterns (line 308-319) are a thoughtful PH-localized list — covers gcash, viber, bank names, Tagalog phrases. Good local domain knowledge.
- `payout.routes.ts` correctly checks provider ownership on GET /:id (line 65-75).
- `tip.routes.ts` GET /limits is public — appropriate for an unauthenticated booking flow probe.

---

## What's still NOT read in money path

- `routes/booking.routes.ts` (1,025) — endpoint validation
- `routes/wallet.routes.ts` (342)
- All `validators/*.validators.ts` (795)
- `services/invoice.service.ts` (498)
- `services/or.service.ts` (807) — BIR receipts
- `services/bir-2307.service.ts` (842) — withholding tax
- `services/vat-report.service.ts` (645)
- `services/booking-admin.service.ts` (1,143)
- `services/financial-admin.service.ts` (1,065)

Continuing in next batches.
