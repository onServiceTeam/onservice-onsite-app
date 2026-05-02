# Phase E Findings Part 3 — Provider profile management (services, schedule, availability, calendar, portfolio, certifications, skills, service-area, tier-progression, suki-customers, reviews)

Files added in this batch:
- `apps/mobile/app/provider/services.tsx` (323) — full
- `apps/mobile/app/provider/schedule.tsx` (255) — full
- `apps/mobile/app/provider/availability.tsx` (437) — full
- `apps/mobile/app/provider/calendar.tsx` (393) — full
- `apps/mobile/app/provider/portfolio.tsx` (322) — full
- `apps/mobile/app/provider/certifications.tsx` (415) — full
- `apps/mobile/app/provider/skills.tsx` (413) — full
- `apps/mobile/app/provider/service-area.tsx` (268) — full
- `apps/mobile/app/provider/tier-progression.tsx` (415) — full
- `apps/mobile/app/provider/suki-customers.tsx` (209) — full
- `apps/mobile/app/provider/reviews.tsx` (399 — read top 200; bottom 199 is StyleSheet)

Plus targeted Grep verifications:
- `/api/v1/providers/me/skills` → DOES NOT EXIST on server (CRIT-110)
- `/api/v1/providers/me/service-area` → DOES NOT EXIST on server (CRIT-111)
- `/provider/skills` callers in app code → ZERO (dead screen) (CRIT-110)

**Phase E running total: ~7,943 lines fully read.**
**Audit grand total: ~46,596 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-105)

### CRIT-108 — `portfolio.tsx` requires the provider to PASTE A URL — no upload mechanism
**File:** [apps/mobile/app/provider/portfolio.tsx:159-167](apps/mobile/app/provider/portfolio.tsx#L159)
```tsx
<TextInput
  style={styles.input}
  value={imageUrl}
  onChangeText={setImageUrl}
  placeholder="Image URL (https://...)"
  ...
/>
```

The "Add Photo" form has no ImagePicker, no useImagePicker, no upload button. Provider must:
1. Take a photo on their phone.
2. Upload it to a third-party host (Google Drive, Imgur, Dropbox).
3. Get a public HTTPS URL.
4. Paste the URL.

**No real-world provider can complete this flow.** The vast majority of providers in Boracay are tradespeople (plumbers, cleaners, aircon technicians, masseuses) without web hosting accounts.

**Customer impact:** every provider profile page has an empty "Portfolio" section. Customers see no work samples → trust drops → conversion drops. This is a launch-blocking provider-acquisition / customer-conversion failure.

**Fix dispatch:**
```
1. Replace the URL TextInput with useImagePicker({context: 'portfolio',
   maxImages: 12}) + ImagePicker UI (Camera + Gallery buttons).
2. On submit, upload via picker.uploadAll() to /api/v1/uploads (existing
   endpoint, returns HTTPS S3 URLs).
3. Pass returned URL to addPortfolioItem(imageUrl, caption).
4. Add server-side validation: portfolio image URL must be on the
   platform's S3 bucket domain (defense against pasting external URLs
   that may break or host malicious content).
5. Real test: simulate ImagePicker returning a file:// URI, trigger
   submit, assert uploadImages was called with that URI before the
   addPortfolioItem call.
```

### CRIT-109 — `certifications.tsx` requires the provider to PASTE A URL for the certificate image — no upload
**File:** [apps/mobile/app/provider/certifications.tsx:210-218](apps/mobile/app/provider/certifications.tsx#L210)
Same issue as CRIT-108. Provider has a TESDA certificate physically in their hand and is asked for an "Image URL". Same fix: ImagePicker + upload.

**Verification process impact:** the file `cert.isVerified` is gated by an admin reviewer manually inspecting the certificate image (per the "Pending Review" → "Verified" badge flow). If the provider can't easily attach the image, they remain "pending" indefinitely, blocking their progression to `verified` / `pro` / `elite` tiers.

**Founding-tier providers in particular** — they need their NBI clearance + TESDA cert verified to get the founding-tier commission rate. This screen is the bottleneck. **Same launch-blocking severity as CRIT-108.**

### CRIT-110 — `skills.tsx` is a TRIPLE FAILURE: dead screen + hardcoded fake categories + non-existent server endpoint
**Files:**
- [apps/mobile/app/provider/skills.tsx:26-160](apps/mobile/app/provider/skills.tsx#L26) — 12 hardcoded categories with 60+ fake subcategory IDs (e.g., `'cleaning-general'`, `'plumb-leak'`, `'ac-cleaning'`)
- [apps/mobile/app/provider/skills.tsx:215](apps/mobile/app/provider/skills.tsx#L215) — `await api.post('/api/v1/providers/me/skills', payload)` — endpoint does not exist on server
- Grep verified: zero callers in app code (only maestro test + jest test reference the file)

The hardcoded subcategory IDs (`'cleaning-general'`, `'plumb-leak'`, etc.) DO NOT match the real subcategory IDs from the catalog table (which are UUIDs). Even if the screen were reachable AND the endpoint existed, the server would receive nonsensical IDs.

This is the same Phase 14 R5-complete pattern (build the screen, ship it, never wire it to the user flow). The maestro test renders fine because rendering doesn't require the endpoint to work.

**Fix dispatch:**
```
1. Decision: keep or kill?
   - The real provider-skills configuration happens via services.tsx
     (which DOES use real catalog endpoints + working /providers/me/services
     endpoint). skills.tsx is an obsolete duplicate.
   - Recommendation: delete skills.tsx + the maestro test + the jest
     test. Remove SKILLS from any Routes constants if present.
2. If retained for some future plan, replace the hardcoded CATEGORIES
   with useQuery against /api/v1/catalog (already used in services.tsx)
   and add the matching server endpoint OR redirect to services.tsx.
```

### CRIT-111 — `service-area.tsx` posts to a non-existent server endpoint AND defaults to Manila center (Boracay launch CRIT-92 family)
**Files:**
- [apps/mobile/app/provider/service-area.tsx:21-22, 53](apps/mobile/app/provider/service-area.tsx#L21) — `DEFAULT_LAT = 14.6042; DEFAULT_LNG = 121.0421` (Quezon City, Manila NCR); POST to `/api/v1/providers/me/service-area`
- Grep verified: server has no `/providers/me/service-area` endpoint.
- Provider's actual service-area data lives in the providers table (latitude / longitude / serviceRadiusKm fields fetched via /providers/me — verified in provider-api.service.ts:5-24); the "Save" path here doesn't update those fields. The screen is essentially a write-only UI to nowhere.

**Provider experience:**
1. Provider opens `/provider/service-area`.
2. Sees Quezon City as the default map center (Boracay providers see Manila — same family as CRIT-92, CRIT-93).
3. Manually pans + selects radius.
4. Taps Save → "Saved" alert (the catch block doesn't fire because some other middleware returns 404 and is swallowed?).
5. Reopens the screen → sees Quezon City defaults again. Their selection didn't persist.

Wait — actually the POST will throw 404 → catch block fires "Save failed" alert. So provider sees error → confused → cannot configure service area at all.

**There IS a working path** — the provider can update `serviceRadiusKm` via the profile editor in `(provider-tabs)/provider-profile.tsx` (which calls `updateMyProfile`). But the rich service-area screen with map + center pin is broken.

**Fix dispatch:**
```
1. Replace POST /providers/me/service-area with PATCH /providers/me
   (existing, working endpoint). Include latitude, longitude,
   serviceRadiusKm in the body.
2. Replace the Quezon City default with the launch-region constant
   from platformConfig.launchRegion (Boracay: 11.97°N, 121.92°E).
3. On mount, fetch current /providers/me data and use those lat/lng/radius
   as initial state (don't always default).
4. Add a useQuery for the current provider profile, populate state
   from it.
5. Real test: render with mocked profile {latitude: 11.97, longitude:
   121.92, serviceRadiusKm: 20}; assert the map's initial region matches.
```

---

## MEDIUM bugs

### MED-233 — `services.tsx` doesn't fetch subcategory price bounds before validating provider's basePrice input
**File:** [apps/mobile/app/provider/services.tsx:62-67](apps/mobile/app/provider/services.tsx#L62)
Server has `GET /api/v1/catalog/subcategories/:id/bounds` (verified D10) returning min/max/base prices. Mobile services.tsx doesn't fetch it — provider can enter any price, only finds out it's out-of-range when the POST /providers/me/services rejects. Should pre-fetch bounds + show min/max guidance + client-side validate.

### MED-234 — `schedule.tsx` time inputs are free-form text (no time-picker, no format check)
**File:** [apps/mobile/app/provider/schedule.tsx:147-163](apps/mobile/app/provider/schedule.tsx#L147)
TextInputs accept any string, even `"abc"` or `"25:99"`. Server may reject; client should format-check (HH:MM 00:00–23:59) and ideally use `@react-native-community/datetimepicker`.

### MED-235 — `availability.tsx` date + time inputs are free-form text (same issue as MED-234)
**File:** [apps/mobile/app/provider/availability.tsx:194-242](apps/mobile/app/provider/availability.tsx#L194)
Date format checked via regex `/^\d{4}-\d{2}-\d{2}$/` (passes "9999-99-99"). Time inputs unchecked. Use a date picker.

### MED-236 — `calendar.tsx` `STATUS_COLORS` map missing several states
**File:** [apps/mobile/app/provider/calendar.tsx:25-32](apps/mobile/app/provider/calendar.tsx#L25)
Lists 6 statuses; misses: matched, provider_en_route, provider_arrived, completed_by_provider, confirmed, disputed, payout_ready, paid_out, cancelled_by_*. Falls back to grey. Use `StatusBadge` component (D11) for consistency with provider/job/[id].

### MED-237 — `tier-progression.tsx` TIER_COLORS / TIER_ICONS missing 'founding' (CRIT-97 family)
**File:** [apps/mobile/app/provider/tier-progression.tsx:24-36](apps/mobile/app/provider/tier-progression.tsx#L24)
A founding-tier provider opens this screen and sees their own tier rendered with `colors.text` (default fallback) and the `Sparkle` icon (the 'new' icon). Server's `getTierProgression()` returns `currentTier: 'founding'` plus `allTiers` array including the 'founding' entry — mobile doesn't render either correctly.

### MED-238 — `reviews.tsx` declares Review/Aggregate types inline instead of importing from review.service.ts
**File:** [apps/mobile/app/provider/reviews.tsx:24-57](apps/mobile/app/provider/reviews.tsx#L24)
review.service.ts (D10) already exports the Review and ReviewAggregate types. The screen redeclares both inline — drift risk if server adds fields. Import the canonical types.

### MED-239 — `reviews.tsx` has no "Report" or "Flag" affordance for a review the provider believes is abusive/fake
**File:** [apps/mobile/app/provider/reviews.tsx](apps/mobile/app/provider/reviews.tsx)
Server review schema has `isFlagged: boolean` (line 44) — implies a flagging workflow exists. Mobile has no UI to set it. Provider receiving a malicious 1-star review can only respond in text; no escalation path. Missing from F#10 launch concerns? Note for legal review.

### MED-240 — `service-area.tsx` doesn't fetch the provider's CURRENT service area on mount (always shows defaults)
**File:** [apps/mobile/app/provider/service-area.tsx:24-30](apps/mobile/app/provider/service-area.tsx#L24)
No `useQuery` for the current `/providers/me` data. Provider's existing radius/center is invisible until they save (and even then, the save endpoint doesn't exist per CRIT-111). Compounds CRIT-111.

### MED-241 — Three provider-side screens are duplicated in onboarding (skills, service-area, payouts)
**Observation:** `apps/mobile/app/provider-onboarding/categories.tsx` (201 lines) likely overlaps with `provider/skills.tsx` + `provider/services.tsx`. `apps/mobile/app/provider-onboarding/service-area.tsx` (195 lines) overlaps with `provider/service-area.tsx`. Recommend consolidation when E05 (onboarding) audit lands. Track as a cross-cutting cleanup.

### MED-242 — `services.tsx`, `schedule.tsx`, `availability.tsx`, `portfolio.tsx`, `certifications.tsx` all use native `Alert.alert` for confirmations instead of `ConfirmModal` (D11)
**Files:** all five screens use `Alert.alert(..., 'Cancel'|'Remove')` patterns. Cross-cutting MED-219 family. ConfirmModal exists, is documented, isn't being used.

### MED-243 — `portfolio.tsx` and `certifications.tsx` use `err.message` extraction (loses server-specific message)
**Files:**
- [apps/mobile/app/provider/portfolio.tsx:58, 69, 78](apps/mobile/app/provider/portfolio.tsx#L58)
- [apps/mobile/app/provider/certifications.tsx:67, 83, 92](apps/mobile/app/provider/certifications.tsx#L67)
For axios errors, `err.message` returns the generic "Request failed with status code 400" — the server's specific error message ("Image URL must be HTTPS", "Certificate already exists") is dropped. Use a normalized error helper that extracts `response?.data?.error?.message` first, falls back to `message`.

---

## LOW / INFO

- **`services.tsx` add-service flow** correctly fetches catalog + subcategories from server. Real data, real query invalidation. This is the pattern skills.tsx should have followed.
- **`schedule.tsx` merges existing schedule with DEFAULT_SCHEDULE** — provider sees their existing slots in the form. Good.
- **`availability.tsx` distinguishes between block-day and custom-hours overrides** — clean affordance for "vacation day" vs "shorter shift".
- **`calendar.tsx` is the strongest provider-side screen.** Real server data (getCalendarData), proper month navigation, dot-per-status visualization, override notice on tap, navigates to the actual job detail. Use as a template.
- **`certifications.tsx` distinguishes verified vs pending review** with badges — clear visual feedback.
- **`tier-progression.tsx` derives all data from `getTierProgression()`** — server-canonical commission, requirements, benefits. Provider sees the truth (modulo MED-237 'founding' tier). Strong.
- **`tier-progression.tsx` shows REAL progress bars** (`requirements.jobs.current / requirements.jobs.required`) — no fake data unlike earnings (CRIT-99/100).
- **`suki-customers.tsx` is clean** — real query, proper empty state with icon, customer cards with stats. No bugs here.
- **`reviews.tsx` infinite query + aggregate breakdown + per-aspect rating bars + provider response submission** — comprehensive. The screen architecture is sound; the inline type duplication (MED-238) is the only structural concern.
- **DEFAULT_SCHEDULE** in schedule.tsx defaults to Mon-Fri 08:00-17:00 — sensible Filipino-business default.

---

## Updated headline counts after E03

| Severity | Total | New in E03 |
|---|---:|---:|
| **CRITICAL** | **109 (1 invalidated → 108 real)** | **+4 (CRIT-108–111)** |
| **MEDIUM** | **243** | **+11 (MED-233–243)** |

Continuing into E04 (provider payouts, withdraw, payout-settings, account-management, settings, help, notifications, chat, _layout).
