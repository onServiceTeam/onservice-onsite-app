# Phase B Findings Part 4 — Webhooks, State Machine, Auth Foundations

Files added in this batch:
- `routes/webhook.routes.ts` (201) — PayMongo webhook handler, the single source of payment success
- `types/booking.types.ts` (92) — state machine
- `middleware/auth.middleware.ts` (70)
- `middleware/rbac.middleware.ts` (25)

**Phase B+C running total: ~5,102 lines fully read.**

---

## CRIT-14 INVALIDATED — premature customer confirm not possible

The state machine in `booking.types.ts:66-84` only allows `completed_by_provider → confirmed` (line 75). Customer cannot confirm a booking until provider marks complete. **Withdraw CRIT-14 from B03.**

The customer-allowed list in `booking.service.ts:579-584` includes 'confirmed' but the state machine gates when. Two layers of defense — good.

---

## NEW CRITICAL bugs (continuing numbering)

### CRIT-18 — Webhook holdInEscrow fires outside booking-status transaction
**File:** [packages/api/src/routes/webhook.routes.ts:146-165](packages/api/src/routes/webhook.routes.ts#L146)
```ts
const updateResult = await db.query(
  `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW()
   WHERE id = $1 AND status = 'payment_pending' RETURNING id`,
  [bookingId],
);
// ... separate query
if (booking.rows[0]) {
  await escrowService.holdInEscrow(bookingId, Number(booking.rows[0].total_amount));
  await notificationService.notifyBookingStatusChange(...);
}
```
The status flip and escrow ledger update are **two separate top-level queries**. If `holdInEscrow` fails after `status='paid'` is committed, the booking shows as paid but the escrow wallet pending_balance was never incremented. Subsequent escrow release would underfund or fail invariant checks.

**Fix:** wrap in a single transaction. The booking UPDATE, escrow ledger movements, and notification INSERT must all roll back together.

### CRIT-19 — No payment.refunded webhook handler — refunds assumed instant
**File:** [packages/api/src/routes/webhook.routes.ts:90-192](packages/api/src/routes/webhook.routes.ts#L90)
Switch statement only handles `payment.paid` and `payment.failed`. PayMongo also emits `payment.refunded`, `payment.refund_succeeded`, `payment.refund_failed`. Current code assumes `paymentService.processRefund` succeeds synchronously. If PayMongo's downstream (bank) rejects the refund 12 hours later, the system has no recovery path.

**Impact:** Customer expecting refund → status='refunded' in our DB → but no money actually returned by bank. Customer support nightmare.

**Fix:** add `payment.refund_*` event handlers that:
- Verify the refund_id exists in our system.
- Update payment_intent.refunded_amount on success.
- Reverse the wallet adjustments + alert ops on failure.

### CRIT-20 — No payment_intent.expired or canceled handler — bookings stuck
**File:** [packages/api/src/routes/webhook.routes.ts:90-192](packages/api/src/routes/webhook.routes.ts#L90)
If customer abandons checkout (closes browser before payment completes), PayMongo emits `payment_intent.expired` after ~24h. We don't handle it. Booking stays at `payment_pending` forever; no slot release; provider matching engine still considers the booking active.

**Fix:** handle expiration → set booking to `cancelled_by_customer` with reason='payment_abandoned', release slot via `slotWaitlistService.processSlotAvailability`, emit notifications.

### CRIT-21 — Webhook amount mismatch silently rejected (no alert, no PayMongo retry)
**File:** [packages/api/src/routes/webhook.routes.ts:106-111](packages/api/src/routes/webhook.routes.ts#L106)
```ts
if (webhookAmount != null && Number(webhookAmount) !== Number(intent.amount)) {
  logger.error('Webhook amount mismatch', {...});
  break;  // ← falls through to res.json({success: true}) — PayMongo thinks we accepted!
}
```
A successful PayMongo charge with mismatched amount is logged-and-dropped. PayMongo's HTTP 200 response means PayMongo will NOT retry. The customer paid — but our DB doesn't know. Money received, no service rendered.

This could happen if:
- PayMongo's amount differs from our intent due to a bug (their fee deduction, currency conversion, etc.)
- A race between intent update and webhook
- Tampered intent metadata

**Fix:**
- Return HTTP 500 (PayMongo will retry; gives ops time to investigate).
- Insert into `webhook_anomalies` table for ops review.
- Page on-call.

### CRIT-22 — JWT-only auth has no revocation
**File:** [packages/api/src/middleware/auth.middleware.ts](packages/api/src/middleware/auth.middleware.ts)
- No token blacklist check.
- No session table lookup.
- Logged-out users' tokens stay valid until natural expiry.
- Compromised admin credentials can't be force-logged-out — token continues to work.

For ADMIN role, this is high severity. Admin compromise = window of malicious access until token expiry.

**Fix:**
- Add `revoked_tokens` (or `active_sessions`) Redis-backed set.
- On logout, add jti to blacklist with TTL = remaining token lifetime.
- Middleware checks blacklist before accepting.
- For admin: mandatory short access-token TTL (15 min) + refresh-token rotation.

### CRIT-23 — RBAC middleware doesn't enforce staff permissions
**File:** [packages/api/src/middleware/rbac.middleware.ts](packages/api/src/middleware/rbac.middleware.ts)
Middleware only checks `req.user.role` is in allowed roles. The DB schema (migration 046) has `staff_roles.permissions JSONB` for fine-grained perms ("can view financials", "can issue refunds", "can suspend providers", etc.). The middleware ignores them.

Result: any staff with `role='admin'` can hit any admin endpoint, regardless of their assigned permissions. A "support" staff role meant for read-only ticket handling can issue refunds.

**Fix:** add a permission middleware:
```ts
export function requirePermission(perm: string) {
  return async (req, res, next) => {
    const staff = await db.query(
      `SELECT permissions FROM staff_roles
       WHERE id = (SELECT staff_role_id FROM admin_users WHERE id = $1)`,
      [req.user.userId]
    );
    const perms = staff.rows[0]?.permissions ?? {};
    if (!perms[perm]) return next(createAppError('Insufficient permissions.', 403));
    next();
  };
}
```
Then apply per-route: `router.post('/refund', authMiddleware, requirePermission('financial.issue_refund'), handler)`.

---

## MEDIUM bugs

### MED-20 — PAYMONGO_WEBHOOK_SECRET missing only logs, doesn't fail at startup
**File:** [packages/api/src/routes/webhook.routes.ts:16-19](packages/api/src/routes/webhook.routes.ts#L16)
A misconfigured production deploy (forgotten env var) silently rejects all webhooks → all payments stuck at `payment_pending`. Add a startup check that throws on missing critical secrets in production.

### MED-21 — JWT_SECRET missing returns per-request 500
**File:** [packages/api/src/middleware/auth.middleware.ts:49-53](packages/api/src/middleware/auth.middleware.ts#L49)
Same pattern. Validate at startup, not per-request.

### MED-22 — payment.failed handler resets to payment_pending (no-op)
**File:** [packages/api/src/routes/webhook.routes.ts:181-184](packages/api/src/routes/webhook.routes.ts#L181)
The "reset" `WHERE status = 'payment_pending'` matches when status IS ALREADY `payment_pending`, so it's a no-op. Either remove or transition to a distinct `payment_failed` status so the UI can distinguish "you haven't paid yet" from "your last attempt failed."

### MED-23 — Top-up booking_id parsing is fragile
**File:** [packages/api/src/routes/webhook.routes.ts:115-144](packages/api/src/routes/webhook.routes.ts#L115)
Format: `topup_{userId}_{timestamp?}`, parsed via `split('_').slice(1, -1).join('_')`. If userId contains underscores (unlikely for UUID but possible for other ID schemes), parsing breaks. Either:
- Make ID format strict + validated (`topup_<uuid>_<timestamp>`), OR
- Pass a separate `intent_type` field in metadata and read userId from a dedicated metadata field.

---

## State machine observations (booking.types.ts)

The state machine is GOOD. Correctly enforces:
- `completed_by_provider → confirmed` is the only path to confirmed (no premature confirm).
- `paid → cancelled_by_customer` allowed (cancellation refund tier handles money).
- `provider_arrived → in_progress` only (provider must mark in_progress; can't skip to complete).
- Terminal states (`paid_out`, `cancelled_*`) have empty transition sets.

One gap: **no path for `paid → payment_failed` or `paid → refunded` from a webhook-driven refund.** Currently `paid` can only go to `provider_en_route` or various cancel states. If we add CRIT-19's refund webhook handler, it'll need a state for "refunded but not cancelled" — or we just use `cancelled_by_admin` with a refund metadata trail.

---

## What's still NOT read in money path

- `services/reconciliation.service.ts` (472 lines)
- `services/settings.service.ts` (498 lines)
- `services/booking.service.ts` lines 600-end already done above. Done.
- `routes/booking.routes.ts` (1,025)
- `routes/wallet.routes.ts` (342)
- `routes/payment.routes.ts` (117)
- `routes/payout.routes.ts` (160)
- `routes/tip.routes.ts` (86)
- `validators/*.validators.ts` (795)
- `jobs/workers.ts` (566)

These pick up in next session's Phase B continuation.
