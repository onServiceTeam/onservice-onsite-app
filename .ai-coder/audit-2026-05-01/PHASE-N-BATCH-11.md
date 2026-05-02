# Audit 2026-05-01 — Phase N Batch 11 — admin wrappers + escrow

**Status:** 3 service files fully read line-by-line, ~2,329 lines covered.

## Files fully read (3 files, 2,329 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/dispute-admin.service.ts | 784 |
| packages/api/src/services/marketing-admin.service.ts | 786 |
| packages/api/src/services/escrow.service.ts | 759 |

## NEW CRITICAL findings (1)

### CRIT-N04 — releaseEscrowInTransaction missing MONEY CONSERVATION check

**Where found:** packages/api/src/services/escrow.service.ts:484-597 (no equivalent of lines 90-102)

**Understood:**
The legacy `releaseEscrow` function (line 46) checks `if (totalOut !== totalAmount)` and throws CRIT-500 on >2 centavo mismatch (lines 90-102), preventing money creation/destruction at runtime.
The Phase 14 D06 trx-aware sibling `releaseEscrowInTransaction` (line 484) computes the same `providerReceives + platformRetains + guaranteeFundContribution` decomposition but **does NOT verify the sum equals totalAmount**. A drift between settings (commission rate) and historical booking pricing could now silently mint or burn money inside the trx, and the audit trail would record a successful release.

This is the canonical sacred-money path for admin-resolved disputes (booking-admin.service.ts and dispute-admin.service.ts both call it), so the regression hits the higher-risk paths.

**Fix:** Add the same conservation guard to `releaseEscrowInTransaction` after `platformRetains` is computed (after line 522):
```ts
const totalOut = providerReceives + platformRetains + guaranteeFundContribution;
if (Math.abs(totalAmount - totalOut) > 2) {
  logger.error('MONEY CONSERVATION VIOLATION (trx)', { bookingId, ... });
  throw createAppError('Internal accounting error.', 500);
}
```
Add a regression test that mocks `settingsService.getCommissionRate` to return a value forcing 3+ centavo drift and asserts the trx version throws.

## NEW MEDIUM findings (5)

### MED-N25 — releasePartialEscrow can compute negative platform amount

**Where:** escrow.service.ts:277

```ts
const platformAmount = remainingAmount - breakdown.providerReceives - breakdown.guaranteeFundContribution;
```

If proportional commission calculation yields `breakdown.providerReceives + breakdown.guaranteeFundContribution > remainingAmount` (possible at edge cases when remainingAmount is tiny and serviceFee was the bulk of total), `platformAmount` becomes negative and the platform revenue wallet receives a debit recorded as a 'commission' credit (line 282-288). No guard. The transaction succeeds with money creation.

**Fix:** Assert `platformAmount >= 0` or recompute breakdown against `remainingAmount` directly rather than calling `commissionService.calculateCommission(proportionalServicePrice, ...)` and subtracting. Add a regression test with a booking where serviceFee dominates the total.

### MED-N26 — releasePartialEscrow lacks the money-conservation check entirely

**Where:** escrow.service.ts:207-305

`releasePartialEscrow` performs four wallet credits/debits (escrow -remaining, provider +receives, platform +platformAmount, guarantee +contribution) without summing them and verifying the result equals `remainingAmount`. Same drift risk as CRIT-N04 but for partial releases.

**Fix:** Add `if (providerReceives + platformAmount + guaranteeContribution !== remainingAmount) throw` before the transaction.

### MED-N27 — handleCancellation runs three independent transactions

**Where:** escrow.service.ts:345-461

The legacy `handleCancellation` (still called by mobile booking flow) opens THREE separate `db.transaction(...)` blocks:
1. Customer refund via `refundFromEscrow` (line 377)
2. Provider compensation block (line 389)
3. Customer no-show service-fee retention (line 420)

Plus a final `db.query` (line 454) that updates `escrow_status`. If step 2 succeeds but step 3 throws, the customer was refunded, provider compensated, but no-show fee never retained AND `escrow_status` still says 'held'. The trx-aware `handleCancellationInTransaction` (line 642) addresses this, but the legacy entry point still has the gap.

**Fix:** Either (a) deprecate `handleCancellation` and route all callers through the trx-aware version, or (b) wrap the entire body of `handleCancellation` in a single outer transaction that calls the *InTransaction helpers. Note: refundFromEscrow (line 311) also internally calls `paymentService.processRefund` which is gateway side-effecting — that must remain post-commit.

### MED-N28 — adminResolveDispute post-commit refund is gateway-tolerant but final state can drift

**Where:** packages/api/src/services/dispute-admin.service.ts:545-586

After the dispute resolution + admin_actions audit commits, the function attempts:
1. `escrowService.refundFromEscrow` (post-commit, try/catch logs only)
2. If refund succeeded AND remainingAmount > 0 → `releasePartialEscrow` (post-commit, try/catch)
3. If refund failed → no release attempted but dispute still says "resolved" with refundAmount > 0
4. If `shouldReleaseToProvider` (no_refund or zero refund) → `releaseEscrow` (post-commit, try/catch)

If gateway refund (PayMongo etc.) fails but dispute is already durably "resolved", the customer never gets their money back AND there is no automated retry. Manual ops intervention required, but no surfacing mechanism — only `logger.error` (line 555-558).

**Fix:** Add a `refund_pending` table or `gateway_refund_status` column on disputes; on caught failure, write a row that the workers.ts scheduler retries periodically. Surface to admin Disputes UI as "REFUND FAILED — RETRY" badge.

### MED-N29 — marketing-admin ALLOWED_CHANNELS hardcoded; not platform_settings

**Where:** packages/api/src/services/marketing-admin.service.ts:114-124

```ts
const ALLOWED_CHANNELS = new Set<string>([
  'facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer',
  'sms', 'email', 'referral', 'other',
]);
```

Adding a new channel (e.g., 'tiktok_ads', 'community_partnership') requires a code deploy, not an admin config change. Pattern violates the Phase 14 standing instruction "server canonical, admin editable default" (memory: feedback_admin_editable_default.md).

**Fix:** Move to `platform_settings.marketing_channels` JSONB array. Add admin UI for channel management. Migrate existing values during seed.

## POSITIVE findings (Phase B verification)

1. **Bug 69-84 transactional discipline confirmed across escrow trx-aware helpers.** `releaseEscrowInTransaction`, `refundFromEscrowInTransaction`, `handleCancellationInTransaction` all accept caller's pg client. Pattern matches the dispatch.
2. **dispute-admin.service.ts properly delegates** sacred money to `disputeService.resolveDisputeInTransaction` and `escrowService.*` rather than reimplementing. Audit trail (`admin_actions`) wrapped in same trx as dispute mutation.
3. **Customer / provider pattern detection** for repeat disputers (line 148-168 dispute-admin) — REVIEW_REQUIRED at 2 disputes, AT_RISK at 3+ with ≥50% favorable. Reasonable defaults.
4. **OR issuance is correctly side-effect-only** (escrow.service.ts:184-197) — failure does not roll back escrow release.

## Confirmations of earlier audit findings

- **Phase 14 D06 trx-aware helpers in escrow** confirmed at source — three new functions (`releaseEscrowInTransaction`, `refundFromEscrowInTransaction`, `handleCancellationInTransaction`).
- **Bug 1271 native fetch wrapper** — no axios in any of the 3 files.
- **CRIT-130 (junior admin can mutate disputes)**: dispute-admin.service.ts itself does NOT have a role check; super_admin gating is route-layer only (per file header comment line 14-16). Same shape as admin.routes.ts CRIT-N01.

## Cumulative running totals (after Phase N Batch 11)

| | Total | Batch 11 additions |
|---|---:|---:|
| **CRITICAL** | **178 + 1 = 179 real** (1 invalidated of 180) | **+1** |
| **MEDIUM** | **508 + 5 = 513** | **+5** |
| Lines fully read | ~113,729 / 146,236 | +2,329 |
| Coverage | **77.8%** | +1.6% |

## Files NOT YET READ — remaining list (~91 files, ~27,500 lines)

Per PHASE-N-PARTIAL-SUMMARY.md unread list, minus the 3 closed in Batch 11. Next batches should target:
- provider-tools.service.ts (743) + catalog.service.ts (711) + business.service.ts (681)
- compliance.service.ts (678) + vat-report.service.ts (645) + service-area.service.ts (634)
- booking.service.ts (1197) — re-verify Phase B partial read
- auth.routes.ts (977) + booking.routes.ts (1025) + provider.routes.ts (735)
