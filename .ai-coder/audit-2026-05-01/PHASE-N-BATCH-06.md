# Phase N Batch 6 — customer-admin.service.ts (1 file, 904 lines)

## File fully read
- packages/api/src/services/customer-admin.service.ts (904)

## Findings

### MED-N15 — 'flag_fraud' action records as 'customer_suspended' with prefix; analytics will mis-count
**Where found:** packages/api/src/services/customer-admin.service.ts:765-789
```ts
} else {
  // flag_fraud — does NOT change is_active; only writes admin_actions.
  // Re-use the action_type CHECK constraint: 'flag_fraud' is not a valid
  // value, so we record under customer_suspended with a reason prefix.
  actionType = 'customer_suspended';
}
...
const detailsPrefix = action === 'flag_fraud' ? '[fraud_flag] ' : '';
```
**Understood:** The 'flag_fraud' UI action maps to `action_type='customer_suspended'` in admin_actions, distinguished only by `[fraud_flag] ` reason prefix. Analytics counting suspensions vs flags can't tell them apart without parsing the reason string. Same problem in reverse: if admin reports "X% of customers suspended this month", actual suspended-from-platform count is inflated by fraud-flagged customers who remain active.
**Fix:** Add 'customer_flagged_fraud' to admin_actions.action_type CHECK constraint via new migration. Update this code path. Bonus: add `is_flagged_fraud` boolean to users so the flag is queryable directly, not just via admin_actions reason prefix.

### MED-N16 — Fraud-pattern threshold hardcoded; not admin-tunable
**Where found:** packages/api/src/services/customer-admin.service.ts:497-510
```ts
// Fraud pattern: 5+ disputes in last 30 days where ≥80% resolved without refund
const cutoff = now - 30 * 24 * 60 * 60 * 1000;
const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
const resolved = recent.filter((r) => r.status === 'resolved');
...
const flagged = recent.length >= 5 && favorProviderRate !== null && favorProviderRate >= 0.8;
```
**Understood:** Magic numbers (5 disputes, 30 days, 80% threshold) hardcoded. Admin can't tune via /admin/settings. Same anti-pattern as CRIT-M01 / MED-M09 — claimed-tunable values that aren't actually tunable. Operations team will want to adjust these as the real-world dispute pattern reveals itself.
**Fix:** Source thresholds from settingsService.

### POSITIVE — creditCustomerWallet transactional discipline
- Get-or-create customer wallet with FOR UPDATE lock.
- Wallet update + wallet_transactions INSERT + admin_actions INSERT in single transaction.
- Refuses negative-balance adjustments.
- Reference ID embeds `admin_credit:${adminUserId}` for forensics.

### POSITIVE — Fraud-pattern detection
- Flags customer when 5+ disputes in 30 days AND ≥80% resolved in favor of provider (no_refund / refund_with_warning / refund_with_suspension).
- Surfaces "reason" string with explicit calc for admin review.

### POSITIVE — Activity merging
- audit_log + login_attempts + admin_actions merged + sorted + limited.

### MED-N17 — Same MED-N13/N14 pattern: getCustomerDisputes LIMIT 200, getCustomerActivity returns raw IP/UA
- LIMIT 200 truncates; should paginate.
- IP/userAgent unmasked regardless of admin role.

## Cumulative Phase N progress: 6 / 104 files (~7,039 lines)

---

## Phase N PARTIAL HANDOFF — what's been read so far + what remains

Given the scope of Phase N (~104 files, ~40k lines) and context budget, future sessions should pick up from here using this list.

### Files fully read in Phase N (6 files, ~7,039 lines)
- packages/api/src/routes/admin.routes.ts (1614)
- packages/api/src/services/admin-analytics.service.ts (1314)
- packages/api/src/services/booking-admin.service.ts (1143)
- packages/api/src/services/financial-admin.service.ts (1065)
- packages/api/src/services/provider-admin.service.ts (999)
- packages/api/src/services/customer-admin.service.ts (904)

### Files NOT YET READ in Phase N (98 files, ~33,000 lines)

**Large services (>500 lines):**
- booking.service.ts (1197) — Phase B partial; needs full re-read
- dispute.service.ts (843)
- bir-2307.service.ts (842)
- provider.service.ts (808)
- or.service.ts (807)
- marketing-admin.service.ts (786)
- dispute-admin.service.ts (784)
- escrow.service.ts (759) — Phase B claims read but verify
- provider-tools.service.ts (743)
- catalog.service.ts (711)
- business.service.ts (681)
- compliance.service.ts (678)
- vat-report.service.ts (645)
- service-area.service.ts (634)
- data-management.service.ts (557)
- notification.service.ts (551)
- security.service.ts (524)
- admin.service.ts (520)

**Routes (>400 lines):**
- booking.routes.ts (1025) — Phase B partial; verify
- auth.routes.ts (977)
- provider.routes.ts (735)
- catalog.routes.ts (466)
- business.routes.ts (400)

**Medium services (200-500 lines):**
- recurring.service.ts (513), settings.service.ts (498), invoice.service.ts (498), compliance-admin.service.ts (489), reconciliation.service.ts (472), pricing.service.ts (411), auth.service.ts (387), checklist.service.ts (382), provider-onboarding.service.ts (349), suki.service.ts (335), booking-photo.service.ts (334), staff.service.ts (321), review.service.ts (313), payout.service.ts (290), breach-log.service.ts (277), pricing/cancellation.service.ts (268)

**Many smaller routes + services (50-280 lines each):** ~60 files

### Strategy for next session(s)
1. Read remaining services in domain batches: payments, disputes, compliance, marketing, BIR/VAT, support, staff, settings, notifications, etc.
2. Continue per-batch findings doc pattern.
3. Each batch: 4-8 small files OR 1 large file.
4. Estimated 20-30 more batches to complete Phase N.
5. Then Phase O (tests, scripts, infra) and Phase P (final synthesis).

### Net-new findings so far in Phase N (3 confirmed CRITs + 17 MEDs)

**Confirmations:**
- F03 CRIT-128 (provider KYC fields hardcoded null) confirmed at code level in provider-admin.service.ts:248-249.
- F audit family of CRITs about junior-admin access confirmed in admin.routes.ts:23-27.

**New CRITs (2):**
- CRIT-N01 — Junior admin can mutate providers/invoices/areas/IPs/AB-tests via requireAdmin instead of requireSuperAdmin.
- CRIT-N02 — GET /admin/audit-log returns raw IP/UA bypassing PII masking.

**New MEDs (15):**
- MED-N01 through MED-N17 (see individual batch files).

The audit continues. Phase N is incomplete pending the remaining 98 files of API services and routes.
