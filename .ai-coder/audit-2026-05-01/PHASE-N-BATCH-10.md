# Phase N Batch 10 — provider.service.ts (1 file, 808 lines)

## File fully read
- packages/api/src/services/provider.service.ts (808)

## Findings

### MED-N22 — TIER_LADDER missing 'founding' tier; getTierProgression returns 4 tiers instead of 5
**Where found:** packages/api/src/services/provider.service.ts:718-743
```ts
const TIER_LADDER: TierRequirement[] = [
  { tier: 'new',       minJobs: 0,   minRating: 0,   commission: 15, ... },
  { tier: 'verified',  minJobs: 5,   minRating: 4.0, commission: 13, ... },
  { tier: 'pro',       minJobs: 25,  minRating: 4.5, commission: 11, ... },
  { tier: 'elite',     minJobs: 100, minRating: 4.7, commission: 9,  ... },
];
```
**Understood:** Same drift family as MED-K05/K20/M17. Migration 073 added 'founding' tier with 10% commission. provider.service.ts's TIER_LADDER hardcodes only 4 tiers. Founding-tier providers querying tier-progression get currentTier='founding' (per their actual DB row) but TIER_LADDER.find returns undefined, so `currentTier` falls back to `TIER_LADDER[0]` (new). Provider sees they're at "new tier" with "15% commission" when they're actually 'founding' with 10%. UI lies.
**Fix:** Insert 'founding' tier at the beginning of TIER_LADDER or make it a first-class tier. Match commission to platform_settings.commission_rate_founding.

### CONFIRMS — provider KYC URL columns are WRITTEN, just not READ
**Where found:** packages/api/src/services/provider.service.ts:289-302
```ts
INSERT INTO providers (
  ..., government_id_front_url, government_id_back_url,
  nbi_clearance_url, selfie_url, ic_agreement_accepted_at, applied_at, status
) VALUES (..., $8, $9, $10, $11, NOW(), NOW(), 'pending')
```
**Understood:** This service WRITES the KYC URLs to the providers table during application submission. So the data IS in the DB. Per CRIT-128 family, provider-admin.service.ts (admin Provider Detail page) hardcodes them as null at READ time. The fix is purely in the read path — no schema change needed for admin Provider Detail to show the URLs.

### POSITIVE — Bug 1230 subcategory price bounds enforced
- Line 168-194: addProviderService rejects basePrice below min_price or above max_price of subcategory. Server-canonical (validators on input + service-side bounds check).

### POSITIVE — Application flow
- Line 271-316: Wraps user role update + provider INSERT + per-category provider_services INSERT in single transaction.
- Refuses second application per user (line 275-281).
- Captures all 4 KYC URL columns + ic_agreement_accepted_at + applied_at + status='pending'.

### POSITIVE — Schedule update transactional
- Line 236-254: setSchedule wraps DELETE old + INSERT new schedule slots in single transaction.

### POSITIVE — Availability override pattern
- addAvailabilityOverride DELETEs existing for same date before INSERT — clean upsert via 2-step.

### POSITIVE — Soft delete on portfolio + certifications
- removePortfolioItem / removeCertification flip `is_active` to FALSE rather than hard DELETE. Preserves history.

### MED-N23 — addProviderService UPSERT loses base_price if not supplied on update
- Line 196-202: `ON CONFLICT (provider_id, subcategory_id) DO UPDATE SET is_active = TRUE, base_price = COALESCE($4, provider_services.base_price)` — re-adding a service with no basePrice keeps the old price; with basePrice replaces. Reasonable but unstated.

### MED-N24 — getTierProgression open-disputes filter excludes 'dismissed' status which doesn't exist
- Line 783: `WHERE ... status NOT IN ('resolved', 'dismissed')` — but disputes status enum (migration 014) has 'open', 'under_review', 'escalated', 'resolved'. No 'dismissed'. The filter accidentally excludes nothing extra but signals the developer expected a status that was never added.

## Cumulative Phase N progress: 10 / 104 files (~10,339 lines)
