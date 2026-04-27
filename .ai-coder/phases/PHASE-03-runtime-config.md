# PHASE 03 — RUNTIME CONFIG

**Goal:** Implement the full runtime configuration system per `RUNTIME-CONFIG-SYSTEM-SPEC.md`. Commission rates, fees, escrow timeouts, cancellation rules, OTP rules — all editable from admin without code deploys.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/03-runtime-config`
**Estimated time:** 8 hours
**Dependencies:** Phase 02 complete and merged
**Risk:** Medium-high — touches every money-handling code path

---

## Step 1 — Pre-flight

```bash
git checkout main && git pull
git checkout -b phase/03-runtime-config
bash .ai-coder/checkpoints/verify-phase.sh PHASE-03-preflight

# Capture baseline test count
npm run api:test 2>&1 | tee /tmp/baseline.log
grep "passed" /tmp/baseline.log | tail -1
```

## Step 2 — Read the spec

Open and read in full: `RUNTIME-CONFIG-SYSTEM-SPEC.md` (855 lines, in repo root).

This phase implements EVERYTHING in that spec. The spec includes:
- Database schema (`platform_settings`, `platform_settings_audit`)
- Backend service (`settings.service.ts` with full CRUD, validation, caching)
- API routes (`settings.routes.ts`)
- Admin UI (categorized settings page with audit history)
- Migration of every hardcoded `platformConfig.X` value to `settingsService.get(key)`

## Step 3 — Create migration 050

Per the spec, but with these CORRECTED seed values (the spec used older numbers):

```
commission_rate_founding: 10
commission_rate_new: 15
commission_rate_verified: 13
commission_rate_pro: 11
commission_rate_elite: 9
service_fee_rate: 10
service_fee_min: 2500     -- centavos = ₱25
service_fee_max: 50000    -- centavos = ₱500
guarantee_fund_rate: 1.5
vat_rate: 12
escrow_auto_confirm_hours: 24
escrow_dispute_window_hours: 48
minimum_withdrawal_amount: 10000  -- ₱100
withdrawal_processing_days: 3
otp_length: 6
otp_expiry_minutes: 5
otp_max_attempts: 3
otp_cooldown_seconds: 60
quote_expiry_hours: 48
max_quotes_per_booking: 5
provider_noshow_minutes: 30
nbi_expiry_warning_days: 30
max_service_radius_km: 50
rate_limit_window_ms: 900000
rate_limit_max_requests: 100
```

Plus all cancellation refund tiers (`cancel_refund_over_24h`, `cancel_refund_2_to_24h`, etc per FR-102).

## Step 4 — Create migration 051

`platform_settings_audit` table. Records every change with: setting_key, old_value, new_value, changed_by (user_id), reason, ip_address, user_agent, timestamp.

## Step 5 — Create the settings service

`packages/api/src/services/settings.service.ts` per the spec.

Key functions:
- `getSetting(key: string): Promise<string>` — Redis cache → DB → hardcoded fallback
- `getSettingPercent(key)` — returns decimal (15 → 0.15)
- `getSettingNumber(key)` — returns number (centavos)
- `getSettingInteger(key)` — returns integer
- `getSettingBoolean(key)` — returns boolean
- `getCommissionRate(tier)` — convenience
- `updateSetting(key, value, changedBy, reason, ip, ua)` — validates, writes, audits, busts cache
- `resetToDefault(key, changedBy)` — uses default_value
- `getAllSettings()` — for admin UI
- `getSettingsByCategory(category)` — for admin UI tabs

## Step 6 — Create settings routes

`packages/api/src/routes/settings.routes.ts` per spec:
- `GET /api/v1/settings` — list (admin only)
- `GET /api/v1/settings/categories` — list categories
- `GET /api/v1/settings/category/:category` — by category
- `GET /api/v1/settings/audit/recent` — recent changes
- `GET /api/v1/settings/:key` — single
- `GET /api/v1/settings/:key/audit` — audit history
- `PUT /api/v1/settings/:key` — update (super_admin only)
- `POST /api/v1/settings/:key/reset` — reset to default
- `POST /api/v1/settings/cache/flush` — bust cache

Mount at `/api/v1/settings` in `server.ts`. Remove the old inline `/api/v1/admin/settings` routes from `admin.routes.ts`.

## Step 7 — Migrate every `platformConfig.X` reference

Find every reference:
```bash
grep -rn "platformConfig\.\(commissionRates\|serviceFeeRate\|guaranteeFundRate\|vatRate\|escrowAutoConfirmHours\|escrowDisputeWindowHours\|minimumServiceFee\|maximumServiceFee\|minimumWithdrawalAmount\|cancellationRefundSplits\|otpLength\|otpExpiryMinutes\|otpMaxAttempts\|otpCooldownSeconds\|quoteExpiryHours\|maxQuotesPerBooking\|providerNoShowMinutes\|nbiExpiryWarningDays\|rateLimitWindowMs\|rateLimitMaxRequests\)" packages/api/src/services/ packages/api/src/routes/ --include="*.ts"
```

Replace each per the mapping table:

| Old | New |
|---|---|
| `platformConfig.commissionRates[tier]` | `await settingsService.getCommissionRate(tier)` |
| `platformConfig.serviceFeeRate` | `await settingsService.getSettingPercent('service_fee_rate')` |
| `platformConfig.guaranteeFundRate` | `await settingsService.getSettingPercent('guarantee_fund_rate')` |
| `platformConfig.escrowAutoConfirmHours` | `await settingsService.getSettingInteger('escrow_auto_confirm_hours')` |
| `platformConfig.escrowDisputeWindowHours` | `await settingsService.getSettingInteger('escrow_dispute_window_hours')` |
| `platformConfig.minimumServiceFee` | `await settingsService.getSettingNumber('service_fee_min')` |
| `platformConfig.maximumServiceFee` | `await settingsService.getSettingNumber('service_fee_max')` |
| `platformConfig.minimumWithdrawalAmount` | `await settingsService.getSettingNumber('minimum_withdrawal_amount')` |
| `platformConfig.cancellationRefundSplits.<scenario>` | `await settingsService.getSettingPercent('cancel_refund_<scenario>')` |
| (others) | follow same pattern |

Functions that read these values become `async`. Update all callers with `await`.

The hardcoded `platformConfig` values stay in `platform.config.ts` as the **fallback defaults** if both Redis and DB are unreachable, but they are never the source of truth.

**Special case: rate-limit middleware.** Cannot be made async. Use the cached-with-periodic-refresh pattern:

```ts
let currentWindow = 900000;
let currentMax = 100;

async function refreshRateLimits() {
  try {
    currentWindow = await settingsService.getSettingInteger('rate_limit_window_ms');
    currentMax = await settingsService.getSettingInteger('rate_limit_max_requests');
  } catch { /* keep current */ }
}
refreshRateLimits();
setInterval(refreshRateLimits, 60_000);
```

## Step 8 — Rebuild SystemSettingsPage

Replace `apps/admin/src/pages/SystemSettingsPage.tsx` with the categorized UI per spec:
- Left: category tabs (Commissions, Fees, Escrow, Cancellation, Auth, Provider, Security, Cache)
- Center: settings list for active category, each with inline edit, reset-to-default, history view
- Right: recent changes audit feed
- "Force cache flush" button at top
- Per-setting validation (min/max from row)
- Real-time refresh of audit feed (30s)
- Use lucide icons exclusively

## Step 9 — Write E2E test

Create `packages/api/__tests__/runtime-config-e2e.test.ts`:
- Read DB → cache → fallback
- Change a value → confirm cache busted → confirm new value used
- Validation rejects invalid values
- Audit row created on update
- All 50+ seeded values readable

## Step 10 — Verify

```bash
# Run migrations
bash scripts/run-migrations.sh

# Confirm seeds
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM platform_settings;"
# Expected: 50+ rows

psql "$DATABASE_URL" -c "SELECT key, value FROM platform_settings WHERE key LIKE 'commission_rate_%' ORDER BY key;"
# Expected: founding=10, new=15, verified=13, pro=11, elite=9

# Verify
bash .ai-coder/checkpoints/verify-phase.sh PHASE-03

# Money conservation MUST still pass
bash .ai-coder/checkpoints/verify-money-conservation.sh
```

## Step 11 — Manual integration test

Start API + admin + mobile. Place a test booking through mobile. Confirm commission was calculated using DB-stored 15% (not hardcoded). Then go to admin settings, change `commission_rate_new` to 14, place another booking, confirm commission was 14%.

## Step 12 — Commit and report

Standard commit message + phase report. STOP.
