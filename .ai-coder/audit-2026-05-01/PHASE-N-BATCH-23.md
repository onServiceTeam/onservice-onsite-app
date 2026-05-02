# Audit 2026-05-01 — Phase N Batch 23 — all remaining route files

**Status:** 37 route files fully read line-by-line, ~6,650 lines covered. Phase N route layer now 100% covered.

## Files fully read (37 files, ~6,650 lines)

| File | Lines |
|---|---:|
| packages/api/src/routes/catalog.routes.ts | 466 |
| packages/api/src/routes/business.routes.ts | 400 |
| packages/api/src/routes/compliance-admin.routes.ts | 348 |
| packages/api/src/routes/wallet.routes.ts | 342 |
| packages/api/src/routes/bir-admin.routes.ts | 333 |
| packages/api/src/routes/marketing-admin.routes.ts | 284 |
| packages/api/src/routes/provider-admin.routes.ts | 283 |
| packages/api/src/routes/cancellation-policy-admin.routes.ts | 267 |
| packages/api/src/routes/dispute.routes.ts | 237 |
| packages/api/src/routes/service-area.routes.ts | 233 |
| packages/api/src/routes/recurring.routes.ts | 222 |
| packages/api/src/routes/upload.routes.ts | 218 |
| packages/api/src/routes/financial-admin.routes.ts | 217 |
| packages/api/src/routes/booking-admin.routes.ts | 211 |
| packages/api/src/routes/messaging.routes.ts | 202 |
| packages/api/src/routes/webhook.routes.ts | 201 |
| packages/api/src/routes/customer-admin.routes.ts | 182 |
| packages/api/src/routes/dispute-admin.routes.ts | 162 |
| packages/api/src/routes/staff.routes.ts | 160 |
| packages/api/src/routes/payout.routes.ts | 160 |
| packages/api/src/routes/support-ticket.routes.ts | 150 |
| packages/api/src/routes/suki.routes.ts | 132 |
| packages/api/src/routes/notification.routes.ts | 124 |
| packages/api/src/routes/settings.routes.ts | 119 |
| packages/api/src/routes/payment.routes.ts | 117 |
| packages/api/src/routes/review.routes.ts | 115 |
| packages/api/src/routes/notification-template.routes.ts | 110 |
| packages/api/src/routes/promotion.routes.ts | 96 |
| packages/api/src/routes/account.routes.ts | 93 |
| packages/api/src/routes/address.routes.ts | 89 |
| packages/api/src/routes/breach-log.routes.ts | 86 |
| packages/api/src/routes/tip.routes.ts | 86 |
| packages/api/src/routes/checklist.routes.ts | 76 |
| packages/api/src/routes/security.routes.ts | 73 |
| packages/api/src/routes/referral.routes.ts | 62 |
| packages/api/src/routes/compliance.routes.ts | 56 |
| packages/api/src/routes/cancellation-policy-public.routes.ts | 26 |

## NEW CRITICAL findings (1)

### CRIT-N16 — settings.routes.ts admin settings surface gated only by 'admin' role

**Where found:** packages/api/src/routes/settings.routes.ts:14-15

```ts
router.use(authMiddleware);
router.use(rbacMiddleware('admin', 'super_admin'));
```

ALL routes under `/api/v1/admin/settings` accept either 'admin' OR 'super_admin'. This includes:
- `PUT /` — bulk-update settings (max 50 per call)
- `PUT /:key` — single setting update
- `POST /:key/reset` — reset to default
- `POST /cache/flush` — flush settings cache

The `platform_settings` table contains every money knob:
- `commission_rate_*` (per-tier, 5 keys)
- `service_fee_rate`, `service_fee_min`, `service_fee_max`
- `guarantee_fund_rate`, `vat_rate`
- `escrow_auto_confirm_hours`, `escrow_dispute_window_hours`
- `minimum_payment_amount`, `minimum_withdrawal_amount`
- `cancel_refund_*` tiers (Bug 1170/1198 cancellation policy values)
- `tip_max_amount_cents` (Bug 417)
- All admin-tunable security thresholds

**Impact:**
- A junior admin can flip the platform's commission rate from 15% to 0% (zero-out provider deductions) or 100% (zero-out provider takings) with a single PUT.
- Combined with CRIT-N13 (settings.service updateSetting non-transactional with audit), the change can happen with audit failure → no record of who did it.
- This is the highest-leverage attack surface in the entire admin web. Every bug-fix dispatch that says "admin can tune X via platform_settings" routes through here.

This was already noted in Phase F's "All platform settings editable by junior admin" theatre item at the original audit close. **Re-confirmed at source as still-open.**

**Fix:**
1. Change line 15 to `rbacMiddleware('super_admin')` — single line fix.
2. Add a separate `rbacMiddleware('admin', 'super_admin')` mount for read-only routes (`GET /`, `GET /:key/history`, `GET /:category`) so junior admins can still observe the current values.
3. Add CI guard: grep for `rbacMiddleware('admin'` on settings/money/compliance routes — should be empty.

## NEW MEDIUM findings (15)

### MED-N155 — webhook.routes.ts payment.amount mismatch breaks silently

**Where:** webhook.routes.ts:105-110

```ts
if (webhookAmount != null && Number(webhookAmount) !== Number(intent.amount)) {
  logger.error('Webhook amount mismatch', { ... });
  break;
}
```

If PayMongo sends a different amount than expected (potential payment-tampering signal), the webhook just logs an error and breaks the switch — no PagerDuty alert, no admin notification, no Sentry capture. Fraud goes unnoticed.

**Fix:** Add Sentry capture + admin alert (DB row in security_events with eventType='payment_amount_mismatch'). Surface to admin alerts dashboard.

### MED-N156 — webhook.routes.ts payment.paid → escrow.holdInEscrow not transactional

**Where:** webhook.routes.ts:146-165

```ts
const updateResult = await db.query(
  `UPDATE bookings SET status = 'paid', escrow_status = 'held' ...`,
);
// ...
await escrowService.holdInEscrow(bookingId, ...);
```

UPDATE bookings flips status to 'paid' BEFORE `escrow.holdInEscrow` runs. If holdInEscrow fails (DB blip), booking shows 'paid' but no escrow row exists. CRIT-N10 family.

**Fix:** Wrap the UPDATE bookings + escrow hold + notification in a single transaction. Or use the existing `escrowService.holdInEscrow` to also handle the booking status flip atomically.

### MED-N157 — webhook.routes.ts top-up routing via string prefix is fragile

**Where:** webhook.routes.ts:88

```ts
const isTopUp = bookingId?.startsWith('topup_') ?? false;
```

Routes payment processing based on whether bookingId starts with `topup_`. UUIDs don't, but custom IDs could. If `topUpId` format ever changes (e.g., to `topup-{userId}-{ts}`), webhooks fail silently for top-ups.

**Fix:** Add a dedicated metadata field `intent_kind: 'booking' | 'top_up'` instead of string prefix detection. Or use payment_intents table with kind column.

### MED-N158 — payment.routes.ts wallet payment path has 4 separate updates

**Where:** payment.routes.ts:46-63

For wallet payment method, runs:
1. `walletService.debitWallet` (line 48-54)
2. `paymentService.updatePaymentStatus` (line 56)
3. UPDATE bookings status = 'paid', escrow_status = 'held' (line 58-61)
4. `escrowService.holdInEscrow` (line 63)

Four separate operations. Step 1 commits; if step 2-4 fail, customer wallet is debited but booking shows still pending. CRIT-N10 family at customer-side payment too.

**Fix:** Wrap all four in a single `db.transaction` using the trx-aware variants.

### MED-N159 — payout.routes.ts /approve /reject /complete only requireAdmin

**Where:** payout.routes.ts:108-158

```ts
router.put('/:id/approve', authMiddleware, async (req, res, next) => {
  ...
  requireAdmin(req);  // <-- accepts both admin and super_admin
  const payout = await payoutService.approvePayout(id, req.user!.userId);
```

Provider payout approval/rejection moves real money. Per Phase 14 D08 boundary, money operations should be super_admin only. Junior admin can approve any payout, including their own colleagues' fraudulent payout requests.

**Fix:** Change `requireAdmin` to `requireSuperAdmin` for all three endpoints. Add CI guard.

### MED-N160 — dispute.routes.ts /resolve /escalate /assign only requireAdmin

**Where:** dispute.routes.ts:158-210

```ts
router.put('/:id/resolve', ..., async (req, res, next) => {
  ...
  requireAdmin(req);  // <-- accepts both admin and super_admin
```

Dispute resolution releases escrow (or refunds customer), moving money. Compare with admin/disputes/:id/resolve in dispute-admin.routes.ts which DOES use requireSuperAdmin. Two routes for same operation with different gating — junior admin uses the public dispute.routes path to bypass super_admin gating.

**Fix:** Either (a) make this dispute.routes.ts /resolve also requireSuperAdmin, OR (b) deprecate this endpoint entirely in favor of admin/disputes/:id/resolve.

### MED-N161 — catalog.routes.ts requireAdmin for all admin mutations

**Where:** packages/api/src/routes/catalog.routes.ts:13-17, applied to lines 224-441

CRIT-N01 family — junior admin can mutate the entire service catalog (categories, subcategories, addons). Catalog mutations affect platform-wide pricing structure and customer-facing listings.

**Fix:** Change `requireAdmin` to `requireSuperAdmin` for all mutation endpoints in this file. Pattern matches CRIT-N01.

### MED-N162 — catalog.routes.ts DELETE /admin/subcategories/:id bypasses transactional service

**Where:** catalog.routes.ts:443-464

```ts
router.delete('/admin/subcategories/:id', ..., async (req, res, next) => {
  ...
  const result = await db.query(
    `UPDATE service_subcategories SET is_active = FALSE ... RETURNING id`,
    [id],
  );
  ...
  await cacheDeletePattern('onservice:http:*/api/v1/catalog*');
});
```

Inline UPDATE bypasses the transactional service pattern used by createCategory/updateCategory/createSubcategory (which DO write admin_actions audit). Subcategory deactivation has no admin_actions audit trail.

**Fix:** Move to `catalogService.deactivateSubcategory(id, adminUserId)` with transactional UPDATE + admin_actions INSERT. Mirror the deleteAddon pattern at catalog.service.ts:430-477.

### MED-N163 — service-area.routes.ts /waitlist unauthenticated, no rate limit, no CAPTCHA

**Where:** service-area.routes.ts:89-126

```ts
router.post('/waitlist', async (req, res, next) => {
  // No authMiddleware, no rateLimit, no CAPTCHA
```

Anyone can flood the waitlist with fake names/phone numbers/emails. Spam vector. Could also be used to enumerate which cities/provinces the platform considers "underserved."

**Fix:** Add reCAPTCHA / hCaptcha verification (CAPTCHA is already wired for OTP — reuse). Add per-IP rate limit. Optionally add phone OTP verification for legitimate signup intent.

### MED-N164 — webhook.routes.ts no rate limit on PayMongo webhook endpoint

**Where:** webhook.routes.ts:57-200

The signature check at line 14-47 is the only defense. A flood of well-formed-but-unmatched webhooks (e.g., spoofed by an attacker who somehow obtained the secret) would consume DB queries. PayMongo's actual delivery rate is bounded but defense-in-depth would add per-source rate limit.

**Fix:** Add rate limit middleware (max 100 webhooks/min from PayMongo's IP range).

### MED-N165 — business.routes.ts businessType + paymentTerms whitelists hardcoded

**Where:** business.routes.ts:48, 53

```ts
const validTypes = ['office', 'condo_management', 'restaurant', ...];
if (paymentTerms && !['net_15', 'net_30', 'net_60'].includes(paymentTerms)) { ... }
```

Should be from platform_settings. Adding a new business type ('coworking', 'gym', etc.) requires code deploy.

**Fix:** Move to `platform_settings.business_account.allowed_types` JSONB array.

### MED-N166 — wallet.routes.ts /withdraw inline transaction bypasses payout.service

**Where:** wallet.routes.ts:116-183

The withdraw endpoint runs its own inline `db.transaction` (line 149-171) for wallet debit + payout INSERT, instead of calling `payoutService.requestPayout`. This:
- Duplicates the money-path code (drift risk)
- Bypasses MED-N77 (AML threshold check) recommendations
- Doesn't use the consistent admin_actions audit pattern

**Fix:** Replace inline transaction with `payoutService.requestPayout` call.

### MED-N167 — notification-template.routes.ts DELETE only requireAdmin

**Where:** notification-template.routes.ts:93-108

Notification templates affect customer-facing notification copy. Hard delete (per MED-N142) with no audit. requireAdmin not requireSuperAdmin gating.

**Fix:** Either (a) require super_admin for delete, OR (b) keep requireAdmin but add admin_actions audit + soft-delete (mirror MED-N142 fix).

### MED-N168 — promotion.routes.ts all mutations only rbacMiddleware('admin', 'super_admin')

**Where:** promotion.routes.ts:42, 66, 81

Marketing-team admin can create/update/delete promotions. Promotions affect customer-facing copy. With MED-N150/N151 (no admin_actions audit), admin's promotional changes have no trail. Combined with rbac being 'admin' (junior), no super_admin oversight.

**Fix:** Add audit (per MED-N150/N151) and consider raising delete to super_admin.

### MED-N169 — webhook.routes.ts logger.error on missing PAYMONGO_WEBHOOK_SECRET still returns 401

**Where:** webhook.routes.ts:14-19

```ts
function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('PAYMONGO_WEBHOOK_SECRET not set — rejecting webhook for security');
    return false;
  }
```

Returns false (which becomes 401 unauthorized at line 71) — fail closed. Good. BUT logger.error in production gets buried. If secret is unset in prod, every PayMongo webhook is silently rejected and customer payments fail. Should fail at server startup, not per-request.

**Fix:** Add startup-time validation (server.ts) that fails to boot if `PAYMONGO_WEBHOOK_SECRET` missing. Same pattern as recommended for CRIT-M04 / MED-N66 / MED-N95.

## POSITIVE findings

1. **bir-admin.routes** properly distinguishes read (requireAdmin) from money-moving generate/finalize/run (requireSuperAdmin). Phase 14 D08 boundary respected.
2. **cancellation-policy-admin.routes** super_admin-only + 1-hour edit window after creation (lines 230-235) — proper change-management discipline.
3. **breach-log.routes** uses `requireDpoRole` middleware — correct DPO scoping for NPC compliance breach log access.
4. **compliance-admin.routes** /reject and /escalate require super_admin (lines 281, 299).
5. **staff.routes** all routes require super_admin via rbacMiddleware (line 21+). Proper.
6. **booking-admin.routes** money-moving endpoints (escrow release/refund, reassign, cancel, force-complete, message) all require super_admin.
7. **customer-admin.routes** /status (suspend/reactivate/flag_fraud) and /credit (wallet credit) require super_admin.
8. **dispute-admin.routes** /resolve and /reopen require super_admin (the dispute.routes.ts version is the loose-gate site, MED-N160).
9. **provider-admin.routes** PATCH /:id/profile and POST /wallet/adjust require super_admin.
10. **financial-admin.routes** /receipts/:id/cancel requires super_admin.
11. **catalog.routes** (cacheMiddleware on read endpoints, post-commit cacheDeletePattern on writes) — pattern correct, even if rbac gating loose.
12. **upload.routes** Bug 1325 SSE-KMS verified at service layer. Multipart limits enforced.
13. **checklist.routes** properly defers to checklist.service for transactional state (Phase 14 D07 verified).
14. **payment.routes intent creation** has proper authorization (booking customer only, line 26-28).
15. **Webhook signature verification** (timestamp + 5-min replay window + timingSafeEqual) — correct shape, fail-closed.

## Confirmations of earlier audit findings

- **CRIT-N01 family** confirmed at: catalog.routes (mutations), dispute.routes (resolve), payout.routes (approve/reject/complete), promotion.routes (mutations). 4 additional sites where junior admin can perform sensitive actions.
- **CRIT-N10/N11 family** confirmed at: webhook.routes payment.paid path (MED-N156), payment.routes wallet path (MED-N158). Money/state inconsistency on multi-step failure.
- **MED-N142 (notification-template hard delete no audit)** route-level confirmation at MED-N167.
- **CRIT-M05 trust proxy** has further downstream impact at compliance-admin.routes audit log capture (line 194 uses req.ip).

## Cumulative running totals (after Phase N Batch 23)

| | Total | Batch 23 additions |
|---|---:|---:|
| **CRITICAL** | **189 + 1 = 190 real** (2 invalidated of 192) | **+1** |
| **MEDIUM** | **640 + 15 = 655** | **+15** |
| Lines fully read | ~142,224 / 146,236 | +6,650 |
| Coverage | **97.3%** | +4.6% |

## Phase N — 100% complete

All API services + routes have now been read line-by-line:
- 60 services (~28,000 lines) — Batch 1-22 + Phase B
- 39 routes (~11,089 lines) — Batches 1, 16, 17, 23 + earlier
- Plus admin-routes.ts (1,614), auth.routes.ts (977), booking.routes.ts (1,025), provider.routes.ts (735), all admin sub-routes

**Phase N is closed.** Remaining 2.7% to 100% is in:
- ~85 of 96 API test files (Phase O sampled-only)
- ~83 of 84 maestro YAMLs (Phase O sampled-only)
- apps/admin/tests/visual/ (Phase O not visited)
- apps/mobile/__tests__/ (Phase O sampled-only)

Phase O remaining work focuses on test honesty verification at scale (vs Phase O's 7-test sample). Moving to Phase O Batch 2.
