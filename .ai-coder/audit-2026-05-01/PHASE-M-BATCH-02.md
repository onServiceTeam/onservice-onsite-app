# Phase M Batch 2 — API validators (21 files, ~795 lines)

## Files fully read
- packages/api/src/validators/address.validators.ts (17)
- packages/api/src/validators/admin.validators.ts (14)
- packages/api/src/validators/admin-catalog.validators.ts (45)
- packages/api/src/validators/admin-pricing-rules.validators.ts (69)
- packages/api/src/validators/admin-service-area.validators.ts (66)
- packages/api/src/validators/auth.validators.ts (33)
- packages/api/src/validators/booking.validators.ts (119)
- packages/api/src/validators/cancellation-policy.validators.ts (94)
- packages/api/src/validators/dispute.validators.ts (66)
- packages/api/src/validators/messaging.validators.ts (11)
- packages/api/src/validators/notification-template.validators.ts (26)
- packages/api/src/validators/payment.validators.ts (26)
- packages/api/src/validators/payout.validators.ts (13)
- packages/api/src/validators/promo.validators.ts (33)
- packages/api/src/validators/provider.validators.ts (52)
- packages/api/src/validators/recurring.validators.ts (37)
- packages/api/src/validators/referral.validators.ts (5)
- packages/api/src/validators/review.validators.ts (30)
- packages/api/src/validators/suki.validators.ts (6)
- packages/api/src/validators/tip.validators.ts (27)
- packages/api/src/validators/wallet.validators.ts (7)

## Findings

### MED-M06 — PH lat/lng bounds drift between validators
**Where found:**
- address.validators.ts:11-12 — `min(4).max(22)` / `min(116).max(128)` (slightly permissive)
- admin-service-area.validators.ts:27-33 — `min(4.5).max(21.5)` / `min(116).max(127.5)` (tighter)
- booking.validators.ts:28-29, 51-52, 79-80 — `min(4.5).max(21.5)` / `min(116).max(127.5)` (matches service-area)
- recurring.validators.ts:27-35 — `min(4.5).max(21.5)` / `min(116).max(127.5)` (matches)
- provider.validators.ts:9-10 — `min(4.5).max(21.5)` / `min(116).max(127.5)` (matches application)
- provider.validators.ts:24-25 — `min(4).max(22)` / `min(116).max(128)` (matches address) ← inconsistent within same file

**Understood:** Two PH-coord band conventions exist. Service-area + booking + recurring + provider-app uses tight 4.5..21.5/116..127.5 (matches migration 074 CHECK constraints). Address + provider-update uses loose 4..22/116..128. The loose set could pass validation server-side but fail DB CHECK if those columns also have the tight constraint.
**Fix:** Pick one band (recommend tight 4.5..21.5 / 116..127.5 — matches DB). Update the loose validators. Or extract a shared `phLatLng` z.object() helper.

### MED-M07 — updateBookingStatusSchema enum missing some real states
**Where found:** packages/api/src/validators/booking.validators.ts:42-49
**Understood:** The enum has 17 statuses. The booking state machine in booking.service.ts (Phase B audit) uses additional internal states like 'rematching'. The server may still apply those states via internal calls, but if the admin force-set or status-update endpoint receives 'rematching' from a client, validation rejects it. Whether that's intended (admins shouldn't manually trigger rematching) or a gap (admin reassign workflow needs it) needs Phase N route check.
**Fix:** Phase N reading of booking routes will confirm. If admin actions need 'rematching' transition, add it to the enum.

### MED-M08 — Multiple validators lack upper bound on monetary amounts
**Where found:**
- payment.validators.ts:9-10 — `processRefundSchema.amount: positive()` no max
- payout.validators.ts:4 — `requestPayoutSchema.amount: positive()` no max
- wallet.validators.ts:4 — `withdrawalSchema.amount: positive()` no max
- promo.validators.ts:19 — `discountValue: positive()` no max
- review.validators.ts: no monetary fields (clean)

**Understood:** Validators accept arbitrarily large positive integers. Server-side enforcement (per-tier max payout, available-balance check, refund-not-exceeding-payment) is in service layer. If service-layer logic ever has a hole, validator allows ₱9 quintillion (BIGINT max). Defense-in-depth would add explicit caps. Per refund: cap at booking total. Per payout/withdrawal: cap at available_balance. Per promo discountValue: cap at sane max for percentage (100) and centavos.

**Fix:** Add upper bounds. For refund: refine that amount <= booking.totalAmount (requires DB lookup at validation time, or service-layer enforcement is enough). For payout/withdrawal: refine that amount <= wallet.availableBalance. For promo: refine that discountValue <= 100 if discountType='percentage'.

### MED-M09 — admin-catalog ADDON_PRICE_MAX_CENTS hardcoded; not sourced from platform_settings
**Where found:** packages/api/src/validators/admin-catalog.validators.ts:18 — `const ADDON_PRICE_MAX_CENTS = 5_000_000;`
**Understood:** Comment line 8 references `addon_price_max_cents` setting from migration 074, but the validator hardcodes 5,000,000. Admin tuning the setting in /admin/settings has no effect on the validator. Same anti-pattern as CRIT-M01.
**Fix:** Validator should fetch the setting via settingsService at request time. Or accept a class instance with a refreshable config. Or document that the validator is a hard backstop and per-request limits live in the service layer.

### MED-M10 — Tip dynamic cap depends on platform setting; validator hard cap is 10,000,000 centavos backstop
**Where found:** tip.validators.ts:12, 21
**Understood:** Hard cap 10M centavos (₱100K). Service-layer enforces dynamic `tip_max_amount_cents` from settings. Same pattern as MED-M09. Documented intent: backstop. Lower-bound is the per-request setting. Acceptable as long as service-layer enforcement is wired (verify in Phase N).

### POSITIVE — Bug 1323 verified
- admin.validators.ts:12 — `tier: z.enum(['founding', 'new', 'verified', 'pro', 'elite'])` includes founding (matches migration 073).

### POSITIVE — Bug 175/176 + 261 verified
- booking.validators.ts:19-40 — servicePrice removed from schema, addons changed to `{addonId, quantity}`, promoCode field added. `.strict()` rejects unknown keys.

### POSITIVE — Bug 1170/1198 verified  
- cancellation-policy.validators.ts has full cross-row validation (refund+fee=100, monotonic, contiguous, top-tier max=null, bottom covers post-scheduled).

### POSITIVE — Bug 320/322 verified
- admin-service-area.validators.ts has PH-bounds on centerLat/centerLng + 1..100 km radius + 1..50 minProvidersToLaunch.

### POSITIVE — Bug 269 verified
- admin-pricing-rules.validators.ts has platformSurgeShare 0..1.

### POSITIVE — Bug 266 verified
- admin-catalog.validators.ts has addon price ≤ ₱50K (with hardcoded constant — see MED-M09).

### POSITIVE — Bug 1219 verified
- booking.validators.ts:101 has change order ₱10K hard cap.

### POSITIVE — Bug 417 verified
- tip.validators.ts has hard ₱100K backstop + service-layer dynamic cap from settings.

### POSITIVE — Notification template body cap
- notification-template.validators.ts:7 — `bodyTemplate.max(2000)` closes the migration MED-422 (no length cap on DB-level template body).

### POSITIVE — Provider application required fields
- provider.validators.ts:5-18 — businessName 2..200, categoryIds 1..10, serviceRadiusKm 1..50, full PH-bounds lat/lng, all 4 KYC URLs required, icAgreementAccepted = literal true.

### POSITIVE — Review tags allowlist
- review.validators.ts:6-9 — ALLOWED_TAGS = 10 specific values, max 5 per review. Closes the migration "tags array no validation" gap.

### POSITIVE — Promo code referrer-friendly normalization
- referral.validators.ts:4 — `.transform(v => v.toUpperCase())` normalizes case at validation time so 'abc123' = 'ABC123'.

### POSITIVE — Strict Zod schemas
- 9+ validators use `.strict()` (rejects unknown keys). This is the right default.

## Cumulative Phase M progress: 31 / ~55 files (~1,295 lines)
