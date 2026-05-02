# Phase E Verification — Re-read of cited files, status of every CRIT, expanded fix dispatches

**Purpose:** Re-verify Phase E claims (provider mobile — E01–E06, CRIT-99 through CRIT-119). Same protocol as VERIFICATION-C/D.

## Methodology

Per CRIT, marked one of:
- **READ** — opened file via Read tool at the cited line range this session.
- **GREP** — confirmed pattern via grep this session.
- **CARRIED** — original citation specific; not re-opened this session.

E01–E06 were done IN THIS conversation session. The Read calls were genuine and the line snippets in the original docs are direct quotes. Spot-checks below confirm.

---

## Re-verification status — CRIT-by-CRIT

| # | Title | File:line | Status | Truth |
|---|---|---|---|---|
| CRIT-99 | EarningsChart on dashboard fakes data (`availableBalance / 7` flat-line × 7) | (provider-tabs)/earnings.tsx:152-165 | **READ + GREP** | ✅ TRUE — 7 identical entries confirmed |
| CRIT-100 | CommissionBreakdown back-calculates fake math (12% fee, 1.44% "VAT") | earnings.tsx:168-187 | **READ + GREP** | ✅ TRUE — line 171 confirmed `gross * 1.13` |
| CRIT-101 | Provider job/[id] "Your Earnings" = full service price (no commission) | provider/job/[id].tsx:236-243 | **READ** (E02) | ✅ TRUE |
| CRIT-102 | complete.tsx POSTs photos as raw `file://` URIs (Bug 36 reintroduced) | complete.tsx:122-127 | **READ** (E02) | ✅ TRUE |
| CRIT-103 | complete.tsx signature stored as point dots; not persisted | complete.tsx:71-127 | **READ** (E02) | ✅ TRUE |
| CRIT-104 | complete.tsx POSTs `/api/v1/bookings/:id/complete` — endpoint missing | complete.tsx:123 + grep server | **READ + GREP** (E02) | ✅ TRUE — no `/complete` POST in booking.routes.ts |
| CRIT-105 | checklist.tsx ships HARDCODED cleaning checklist | checklist.tsx:40 + INITIAL_SECTIONS | **READ + GREP** | ✅ TRUE — verified at lines 40, 45, 95 |
| CRIT-108 | portfolio.tsx requires URL paste, no upload | portfolio.tsx:159-167 | **READ** (E03) | ✅ TRUE |
| CRIT-109 | certifications.tsx requires URL paste for cert image | certifications.tsx:210-218 | **READ** (E03) | ✅ TRUE |
| CRIT-110 | skills.tsx — dead screen + fake hardcoded categories + non-existent endpoint | skills.tsx:26-160 + grep `/me/skills` server | **READ + GREP** (E03) | ✅ TRUE — server has no /skills route |
| CRIT-111 | service-area.tsx posts to non-existent endpoint + Manila default | service-area.tsx:21-22, 53 + grep | **READ + GREP** (E03) | ✅ TRUE — no /me/service-area on server |
| CRIT-112 | payouts.tsx ships HARDCODED 50000/75000/... + fake commission | payouts.tsx:132-154 | **READ + GREP** | ✅ TRUE — hardcoded numbers at lines 135-141 |
| CRIT-113 | withdraw.tsx fake EarningsChart + getWalletBalance broken | withdraw.tsx:42-46, 132-146 | **READ** (E04) | ✅ TRUE |
| CRIT-114 | Wallet URL plural/singular drift (8 broken endpoints total) | provider screens + server.ts:173 | **READ + GREP** | ✅ TRUE — server uses `/wallet`, mobile uses `/wallets` |
| CRIT-115 | identity-verification.tsx SILENTLY SWALLOWS 404 | identity-verification.tsx:162-175 | **READ + GREP** | ✅ TRUE — confession comment at lines 166-167 |
| CRIT-116 | Onboarding service-area.tsx PH_REGIONS lacks Boracay + Manila fallback | provider-onboarding/service-area.tsx:13-24, 56-58 | **READ** (E05) | ✅ TRUE |
| CRIT-117 | background-check-status.tsx is a PLACEBO with hardcoded fake data | background-check-status.tsx:40-60 | **READ + GREP** | ✅ TRUE — "Placeholder: real implementation" comment confirmed |
| CRIT-118 | NbiStatusBanner fetches non-existent `/api/v1/provider/nbi-status` | NbiStatusBanner.tsx:46-53 + grep server | **READ + GREP** | ✅ TRUE — zero matches for `nbi-status` on server |
| CRIT-119 | device-fingerprint includes `Date.now()` in hash input → non-deterministic | device-fingerprint.service.ts:23-30 | **READ + GREP** | ✅ TRUE — line 25 has `raw + Date.now().toString()` |

**Summary: ALL 19 E CRITs verified TRUE this session via Read tool and/or grep. Phase E findings are 100% confirmed.**

---

## Expanded fix dispatches — full alignment with Phase A/B output quality

The original E01–E06 docs already include detailed dispatches. Below repeats them with consistent formatting and adds tests + runtime verification where missing.

---

### CRIT-99 — EarningsChart shows FABRICATED data on the provider dashboard

**Bug.** apps/mobile/app/(provider-tabs)/earnings.tsx:152-165 — passes 7 identical entries (`availableBalance / 7`) to EarningsChart as the "last 7 days." Provider sees a perfectly flat chart that doesn't reflect their actual job-by-job earnings. The hardcoded ISO dates `'2026-04-25'` to `'2026-05-01'` will become stale within a week of any release.

**Why it matters.** Provider opens Earnings tab daily. Fake flat chart = "the platform is lying about my money." Trust in the entire app collapses.

This is part of the Phase 14 R5-complete "fake-wiring" pattern: the EarningsChart component was built, the screen renders it, the data layer (provider-tools.service.ts) was built — but the wire between component and data was never connected. Every wired-component R5 dispatch deserves the same audit.

**Fix.**
1. The data layer EXISTS and works: `apps/mobile/src/services/provider-tools.service.ts:130-138` exports `getEarningsTrends(period, days)`. Server endpoint exists at `packages/api/src/routes/provider.routes.ts:548` (`/me/earnings/trends`).
2. Wire it:
   ```tsx
   const trendsQuery = useQuery({
     queryKey: ['provider-earnings-trends', 'daily', 7],
     queryFn: () => getEarningsTrends('daily', 7),
     staleTime: 60_000,
   });
   const chartData = (trendsQuery.data ?? []).map(t => ({
     date: t.period,
     amount: t.netEarned,
   }));
   ```
3. Render `<EarningsChart data={chartData} />` only when `trendsQuery.data` is loaded; show Skeleton while loading.
4. Delete the hardcoded array.

**Tests.**
- Unit (RTL): mock getEarningsTrends to return 7 distinct values [100, 200, 300, 400, 500, 600, 700]. Render dashboard. Assert 7 distinct bar values render in the EarningsChart (e.g., via `getByTestId('chart-bar-0')` reading height proportional to value).
- Unit: mock getEarningsTrends to throw → assert Skeleton renders + retry button.
- Lint: ban inline `[{date:..., amount:...}]` literals in app/ source files.

**Runtime verification (AI coder runbook).**
- Spin up API + provider mobile.
- Seed test provider with 7 days of varied earnings (e.g., ₱500, ₱0, ₱1500, ₱200, ₱800, ₱0, ₱1200).
- Open Earnings tab.
- Screenshot the chart — bars should clearly differ in height (not flat).

---

### CRIT-100 — CommissionBreakdown shows FABRICATED math (12% fee, 1.44% "VAT")

**Bug.** apps/mobile/app/(provider-tabs)/earnings.tsx:168-187 — back-calculates from current wallet balance:
```tsx
gross={Math.round(wallet.availableBalance * 1.13)}    // ← invented
lines={[
  { label: 'Platform fee', amount: Math.round(wallet.availableBalance * 0.12), pct: 12, ... },
  { label: 'VAT', amount: Math.round(wallet.availableBalance * 0.0144) },           // ← also invented
]}
net={wallet.availableBalance}
```

Provider sees: "12% platform fee" (real fee is tier-based: 6% founding to 15% new) and "VAT 1.44%" (real PH VAT is 12%). Founding-tier provider paying 6% commission sees "12%" displayed — they will email support.

**Compliance angle.** "VAT 1.44%" displayed to a tax-paying provider is on its face a misrepresentation of tax law. Legal/compliance exposure.

**Fix.**
1. Replace with `useQuery` against a new server endpoint `/api/v1/providers/me/earnings/breakdown?period=current_month` returning real `{gross, lines, net}` from real transactions. Server fee/VAT computed from `commissionRate` actually charged on each release.
2. Use the provider's actual tier commission rate (already returned by `getTierProgression()`).
3. Use real PH VAT (12%) on the platform fee.
4. Display `LoadingState` while fetching; never ship placeholder math.

**Tests.**
- Mock breakdown to return real values; assert rendered numbers match.
- Lint: forbid `Math.round(... * 0.12)` / `Math.round(... * 0.0144)` patterns in app/ — these are tell-tale "fake math" markers.

---

### CRIT-101 — provider job/[id] "Your Earnings" = full service price

**Bug.** apps/mobile/app/provider/job/[id].tsx:236-243 — displays `formatPHP(booking.servicePrice)` as "Your Earnings". The footer note "Commission will be deducted upon payout" mentions deduction but shows no number. ₱2,000 booking → "Your Earnings: ₱2,000" → actual payout ₱1,664–₱1,880 → "Where's the missing ₱120-₱336?"

**Fix.**
1. Fetch tier-based commission rate via existing `getTierProgression()` query (already in cache from dashboard).
2. Compute server-canonical breakdown:
   ```tsx
   const commissionRate = tierData.currentCommission / 100;
   const platformFee = Math.round(booking.servicePrice * commissionRate);
   const vat = Math.round(platformFee * 0.12);
   const net = booking.servicePrice - platformFee - vat;
   ```
3. Display:
   ```
   Service Price:        ₱2,000.00
   Platform Fee (-15%):  -₱300.00
   VAT on Fee (12%):     -₱36.00
   ─────────────────────────────
   Your Earnings:        ₱1,664.00
   ```
4. **Better**: server returns the breakdown directly on `getBookingById` so client doesn't recompute. Add `expectedNetEarnings` field to the booking API response.

**Tests.**
- Render with mocked tier='new' (commission 0.15) + servicePrice 200000 (₱2000). Assert displayed "Your Earnings" string equals ₱1,664.00.

---

### CRIT-102 — complete.tsx POSTs photos as raw `file://` URIs (Bug 36/461/943/944/73 reintroduced)

**Bug.** apps/mobile/app/provider/job/[id]/complete.tsx:122-127 — `photos: photos.filter(...)` — these are `asset.uri` strings from ImagePicker, format `file:///var/mobile/.../IMG_xxx.jpg`. POSTed as JSON to server. Server can't fetch a file:// URI on the customer's phone.

**Why it matters.** Customer disputes work quality → DPO requests "the after photos" → server has `booking_photos.storage_url` = `file:///var/mobile/...` → customer's app fails to load → no evidence → platform pays out from guarantee fund OR customer wins by default.

**Fix.**
1. Replace inline POST with multi-step:
   ```tsx
   import { uploadBookingPhoto } from '@/services/booking-photo.service';

   for (const uri of photos.filter(Boolean)) {
     await uploadBookingPhoto({ uri, bookingId, photoType: 'after' });
   }
   ```
2. THEN PATCH `/api/v1/bookings/:id/status` with `status='completed_by_provider'` (the canonical completion endpoint at provider-api.service.ts:333-350).
3. CRIT-104 (the broken /complete endpoint) goes away because we use the working PATCH /status path.
4. CRIT-103 (signature) handled in the same dispatch.

**Tests.**
- Render complete; mock ImagePicker returning a `file://` URI; trigger submit; assert `uploadBookingPhoto` called with that URI; assert subsequent PATCH /status called with no `photos` array (uploads happened separately).

---

### CRIT-103 — complete.tsx signature is point dots; not persisted

**Bug.** apps/mobile/app/provider/job/[id]/complete.tsx:71-127 — captures `signaturePoints` as `[{x, y}, ...]` via PanResponder; sets `signedAt` timestamp. On submit, only `signedAt` is sent. Server has timestamp string with no visual signature. Provider claims customer signed; customer denies. No proof.

**Fix.**
1. Replace home-rolled PanResponder with `react-native-signature-canvas` (already referenced in booking-photo.service.ts:130-135 docstring).
2. On submit, render canvas to base64 PNG, write to temp file via `expo-file-system`, then call `uploadSignature(uri, 'customer_acceptance', bookingId)`.
3. Store returned `signature.id` in the completion payload.

**Tests.**
- Simulate signature capture; assert `uploadSignature` called with the captured PNG; assert returned id is included in the subsequent PATCH /status payload.

---

### CRIT-104 — complete.tsx POSTs to `/api/v1/bookings/:id/complete` — endpoint missing on server

**Bug.** apps/mobile/app/provider/job/[id]/complete.tsx:123 — `api.post('/api/v1/bookings/${id}/complete', ...)`. server.ts has no /complete handler in `packages/api/src/routes/booking.routes.ts`. Verified by listing all POST routes; closest is PATCH `/status` flow with `status='completed_by_provider'` at booking.routes.ts:477.

**Customer flow today:** provider goes through fake checklist (CRIT-105) → captures local-state photos (CRIT-102) + dot-signature (CRIT-103) → taps Submit → POST 404 → "Submission failed" alert. Provider falls back to /provider/job/[id] "Mark Complete" PATCH /status which works but skips photos+signature entirely.

**Fix.** Combined with CRIT-102 + CRIT-103: reroute completion submission to:
1. Upload all photos via `uploadBookingPhoto`.
2. Upload signature via `uploadSignature`.
3. PATCH `/api/v1/bookings/:id/status` with `status='completed_by_provider'` and the photo/signature IDs in the body.
4. Server-side: extend the PATCH /status handler at booking.routes.ts:477 to accept `completionPhotoIds` + `signatureId` and persist to `bookings.completion_evidence` JSONB.

---

### CRIT-105 — checklist.tsx ships HARDCODED cleaning checklist

**Bug.** apps/mobile/app/provider/job/[id]/checklist.tsx:40 — `const INITIAL_SECTIONS: ChecklistSection[] = [{ id: 'living', items: [makeItem('living-vacuum', 'Vacuum floor'), ...]}, ...]`. 18 hardcoded cleaning items. Used as `useState(INITIAL_SECTIONS)` at line 95.

Server has `GET /api/v1/jobs/:id/checklist` (creates per-category on first open) at packages/api/src/routes/checklist.routes.ts:25 — Bug 460/463 fix. Mobile ignores it.

**Provider doing aircon repair sees "Vacuum floor / Clean stove / Scrub toilet."** Progress bar is meaningless because items don't match the job. Toggle state is local-only — no PATCH to server.

**Fix.**
1. Replace `useState(INITIAL_SECTIONS)` with `useQuery` against `/api/v1/jobs/:id/checklist`.
2. Replace `toggleDone` with `useMutation` against PATCH `/api/v1/jobs/:id/checklist/items/:itemId`.
3. Replace local photo capture with `uploadBookingPhoto(uri, bookingId, 'checklist')`; pass returned photoId to the toggle mutation.

**Tests.**
- Render with mocked server response for an aircon category; assert rendered sections match server response (NOT `INITIAL_SECTIONS`).

---

### CRIT-108 — portfolio.tsx requires URL paste; no upload UI

**Bug.** apps/mobile/app/provider/portfolio.tsx:159-167 — TextInput accepts arbitrary URL string. No ImagePicker, no useImagePicker. Provider must self-host their photos somewhere with a public HTTPS URL.

**Real-world impact.** No tradesperson on the launch market has web hosting. Every provider profile shows an empty Portfolio. Customer trust drops; conversion drops.

**Fix.**
1. Replace TextInput with ImagePicker UI (Camera + Gallery buttons via existing `useImagePicker({context: 'portfolio', maxImages: 12})` hook).
2. On submit, `picker.uploadAll()` returns HTTPS S3 URLs from `/api/v1/uploads`.
3. Pass returned URL to `addPortfolioItem(imageUrl, caption)`.
4. Server-side validation: portfolio image URL must be on the platform's S3 bucket domain (defense against external/malicious URLs).

**Tests.**
- Simulate ImagePicker returning a `file://` URI; trigger submit; assert `uploadImages` called BEFORE `addPortfolioItem`.

---

### CRIT-109 — certifications.tsx requires URL paste

**Bug.** apps/mobile/app/provider/certifications.tsx:210-218 — same URL TextInput pattern as CRIT-108. Provider has TESDA cert in hand but is asked for an "Image URL".

**Verification process impact.** `cert.isVerified` is gated by an admin manually inspecting the certificate image. If providers can't easily attach, they remain "pending" forever, blocking founding/pro/elite tier progression.

**Fix.** Same as CRIT-108 — ImagePicker + uploadImages.

---

### CRIT-110 — skills.tsx triple failure: dead screen + fake categories + non-existent endpoint

**Bug.**
- apps/mobile/app/provider/skills.tsx:26-160 — 12 hardcoded categories with 60+ fake subcategory IDs (e.g., `'cleaning-general'`, `'plumb-leak'` — these are NOT real catalog UUIDs).
- Line 215 — POST `/api/v1/providers/me/skills` — endpoint does not exist (verified via grep).
- Zero callers in app code (only maestro test + jest test reference the file).

**Fix.** Decision: keep or kill?
- **Recommendation: kill.** Real provider-skills configuration happens via `services.tsx` which uses real catalog endpoints + working `/providers/me/services`. Delete `skills.tsx` + maestro test + jest test + any Routes.PROVIDER.SKILLS constant.
- If retained: replace hardcoded CATEGORIES with `useQuery` against `/api/v1/catalog` and add the matching server endpoint.

---

### CRIT-111 — service-area.tsx posts to non-existent endpoint + Manila default

**Bug.**
- apps/mobile/app/provider/service-area.tsx:21-22 — `DEFAULT_LAT = 14.6042; DEFAULT_LNG = 121.0421` (Quezon City).
- Line 53 — POST `/api/v1/providers/me/service-area` — server has no such route.
- Map initialRegion defaults to Quezon City.

Boracay providers see Quezon City as default; manual pan + selection ; tap Save → 404 silently caught somewhere → confused.

**Fix.**
1. Replace POST `/providers/me/service-area` with PATCH `/providers/me` (existing). Include `latitude`, `longitude`, `serviceRadiusKm` in body.
2. Replace Quezon City default with `platformConfig.launchRegion` (Boracay coords).
3. On mount, `useQuery` for current `/providers/me`; populate state from it.
4. Pair with CRIT-77/92/93/116 in the Boracay launch dispatch.

---

### CRIT-112 — payouts.tsx ships HARDCODED static fake numbers

**Bug.** apps/mobile/app/provider/payouts.tsx:132-154:
```tsx
<EarningsChart data={[
  { date: '2026-04-25', amount: 50000 },
  { date: '2026-04-26', amount: 75000 },
  // ... 7 hardcoded entries
]}/>
<CommissionBreakdown
  gross={440000}                                       // ← made up
  lines={[
    { label: 'Platform fee', amount: 52800, pct: 12 },
    { label: 'VAT', amount: 6336 },
  ]}
  net={380864}
/>
```

Even worse than CRIT-99 — STATIC numbers that don't even react to wallet balance. Every provider sees the SAME 50000/75000/... regardless of their actual earnings.

**Fix.** Same wiring as CRIT-99 + CRIT-100 — `getEarningsTrends` and the new `/me/earnings/breakdown` endpoint. The component is correct; only the data is wrong.

---

### CRIT-113 — withdraw.tsx fake EarningsChart + getWalletBalance broken → balance = ₱0 → withdraw blocked

**Bug.**
- apps/mobile/app/provider/withdraw.tsx:132-146 — `availableBalance / 7` flat-line fake (CRIT-99 family).
- Line 42-46 — `getWalletBalance` from payment.service.ts hits `/api/v1/wallet/balance` (CRIT-78). Server has GET `/api/v1/wallet/`, no `/balance`.
- Line 88-91 — `if (amountCentavos > availableBalance)` always rejects because balance is 0.

**Provider cannot withdraw any money. Ever.** Launch-blocking.

**Fix.** Combined dispatch:
1. Fix `getWalletBalance` URL (CRIT-78).
2. Fix all wallet plural→singular URL drift (CRIT-71/114).
3. Wire EarningsChart to real data (CRIT-99).
4. **Verify by withdrawing a known balance** as part of the runtime test.

---

### CRIT-114 — Wallet URL drift expansion (3 more broken endpoints, 8 total)

See VERIFICATION-D.md CRIT-71 entry — same dispatch covers this expansion. Provider-side wallet endpoints now confirmed:
- `/wallets/transactions` → 404 (earnings.tsx)
- `/wallets/withdraw` → 404 (withdraw.tsx)
- `/wallets/payouts` → 404 (payouts.tsx)
- `/wallet/payout-preferences` → ✅ works (payout-settings.tsx)

Bulk find/replace `/api/v1/wallets/` → `/api/v1/wallet/` across `apps/mobile/`.

---

### CRIT-115 — identity-verification.tsx silently swallows 404 (onboarding theatre)

**Bug.** apps/mobile/app/provider-onboarding/identity-verification.tsx:162-175:
```ts
try {
  await api.post('/api/v1/provider-onboarding/identity', payload);
} catch (apiErr) {
  const status = (apiErr as { response?: { status?: number } })?.response?.status;
  if (status === 404) {
    // Endpoint not yet available — proceed silently so the onboarding
    // flow can still advance. The submission will be retried by the
    // background-check polling step once the route is shipped.
    setSubmitError(null);
  } else {
    throw apiErr;
  }
}
router.push(Routes.PROVIDER_ONBOARDING.BACKGROUND_CHECK_STATUS);
```

The comment is the smoking gun: "proceed silently so the onboarding flow can still advance." Every provider through this flow gets the success appearance with NOTHING persisting. The "retry-via-polling" claim is also fake (CRIT-117 is a placebo).

**Fix dispatch.**
1. Decision: keep `identity-verification.tsx` as alternative flow OR delete?
   - **Recommendation: delete.** Main flow (categories → service-area → documents → selfie → terms → /providers/apply) covers ID via `documents.tsx` which works. Avoid two competing flows.
2. If retained: implement `/api/v1/provider-onboarding/identity` server-side, accepting multipart upload (preferred over base64). Persist S3 URLs to provider_documents table.
3. **REMOVE the "swallow 404" hack.** Real failures must surface.
4. CI guard: scan for `if (status === 404)` near `api.post` calls — flag each match for explicit allowlist comment OR removal.

**Tests.**
- Render identity-verification; mock api.post to return 404; assert provider sees clear error AND is NOT advanced to background-check-status.

---

### CRIT-116 — Onboarding service-area PH_REGIONS lacks Boracay + Manila fallback

**Bug.** apps/mobile/app/provider-onboarding/service-area.tsx:13-24 hardcodes 10 cities — none in Aklan/Boracay. handleNext at line 56-58 falls back to Manila coords (14.5995, 120.9842) if no chip matches and reverse-geocode fails.

Provider in Boracay: types "Malay" + "Aklan" → fallback to Manila → service area centered on Manila → invisible to Boracay customers (matching algorithm uses lat/lng radius search).

**Fix.** Same as CRIT-93 — replace hardcoded PH_REGIONS with `/api/v1/geo/regions` server endpoint. Replace Manila fallback with explicit error: "No coordinates for this city. Please pin your location on a map." Bundle into Boracay launch dispatch.

---

### CRIT-117 — background-check-status.tsx is a placebo

**Bug.** apps/mobile/app/provider-onboarding/background-check-status.tsx:40-60:
```ts
function useBackgroundCheckStatus(): BackgroundCheckHookResult {
  const defaultEta = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  const [data, setData] = useState({ status: 'pending', estimatedCompletionAt: defaultEta });
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      // Placeholder: real implementation would call the backend.
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      setData((prev) => ({ ...prev }));
    } finally {
      setLoading(false);
    }
  }, []);
  return { data, loading, refetch };
}
```

Hardcoded `'pending'` + `now + 48h`. "Refetch" is a 600ms sleep that re-sets the same data. Provider sees "Pending — ETA 2 days from now" forever even after admin approves them.

**Fix.**
1. Implement real `GET /api/v1/providers/me/application-status` returning current review state from providers/applications table.
2. Replace placeholder with `useQuery({ queryKey: ['provider-application-status'], queryFn: fetchStatus, refetchInterval: 60_000 })`.
3. On terminal status (approved/rejected), navigate the provider away.
4. Pair with admin-side approval workflow + notification trigger so the "we'll notify you" promise in review-pending.tsx actually fires.

**Tests.**
- Mock endpoint to return `'approved'`; assert screen navigates to provider dashboard (NOT showing "Pending" label).

---

### CRIT-118 — NbiStatusBanner fetches non-existent endpoint → silent NBI cliff

**Bug.** apps/mobile/src/components/provider/NbiStatusBanner.tsx:46-53 — `api.get('/api/v1/provider/nbi-status')`. Verified via grep: zero matches for `nbi-status` anywhere on server. Component logic at line 55: `if (!query.data) return null` → banner permanently hidden.

Banner is mounted in 3 high-visibility provider surfaces (provider-tabs/_layout, jobs.tsx, certifications.tsx). All inert.

Provider's NBI approaches expiry → server (per matching rules) silently stops matching them → provider sees zero new jobs for days → no banner, no warning. **Silent revenue cliff.**

**Fix.**
1. Implement `GET /api/v1/provider/nbi-status` returning `{status: 'valid'|'expiring'|'expired'|'missing', expiresAt: ISO|null}`. Pulls from providers table or provider_documents.
2. Server-side defense: matching algorithm auto-disables when status='expired'|'missing'.
3. Existing testID props (`nbi-banner-expired`, `nbi-banner-missing`, `nbi-banner-expiring`) make tests easy.

**Tests.**
- Render NbiStatusBanner with mocked fetcher returning each of 4 statuses; assert correct title/body for each.

**Runtime verification.**
- Seed provider with NBI expiring in 25 days.
- Open provider app; banner should show "NBI clearance expires in 25 days" warning.

---

### CRIT-119 — device-fingerprint non-deterministic (Date.now in hash input)

**Bug.** apps/mobile/src/services/device-fingerprint.service.ts:23-30:
```ts
const hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  raw + Date.now().toString(),    // ← timestamp salt
);
setSecureItem(FP_KEY, hash);
```

Cached in secureStore, so second call is stable. But uninstall + reinstall = brand-new fingerprint. Device-trust system (security.service.ts trustDevice/removeDevice) pollutes `auth_devices` with one row per install instead of one per device.

**Fix.**
```ts
const hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  raw,                            // ← drop the Date.now() salt
);
```

The multi-field input (Platform.OS + Platform.Version + Application.applicationId + Application.nativeBuildVersion + getInstallationTimeAsync) provides plenty of entropy. Salt is unnecessary.

**Tests.**
- Call `getDeviceFingerprint()` twice with same inputs (mock secure-store to return null both times) → same hash.
- Different secret/inputs → different hash.

---

## What this verification doc DOES NOT do

- Does not run the app. Static code review only.
- Phase E was personally re-verified at high coverage (19/19) — strongest of the three phases. Distinguish from Phase C (12/24 verified) and Phase D (21/31 verified).
- Does not cover all ~71 E MEDs in detail — they stand at the original cited lines.

## Recommended fix sequence — Phase E launch blockers

1. **Onboarding theatre dispatch** (CRIT-115 + CRIT-117) — provider thinks they uploaded ID; nothing persists. Fix BEFORE any launch.
2. **Fake earnings dispatch** (CRIT-99 + CRIT-100 + CRIT-101 + CRIT-112 + CRIT-113) — single PR wires existing provider-tools.service.ts endpoints into 5 screens. Server + components + service-client all built; just connect them.
3. **Job completion dispatch** (CRIT-102 + CRIT-103 + CRIT-104 + CRIT-105) — replace orphan complete.tsx flow with real upload + status PATCH + server-driven checklist.
4. **Wallet URL alignment** (CRIT-114, bundles CRIT-71/78/96/98 too) — bulk find/replace mobile, add CI guard.
5. **Portfolio + cert upload** (CRIT-108 + CRIT-109) — wire ImagePicker. Founding-tier providers blocked from verification today.
6. **NBI banner endpoint** (CRIT-118) — implement server route + remove the silent revenue cliff.
7. **Boracay launch geo** (CRIT-92 + CRIT-93 + CRIT-111 + CRIT-116, plus customer CRIT-77) — server region table, remove all hardcoded Manila fallbacks.
8. **Provider tier 'founding'** (CRIT-97) — type union + TIER_COLORS/LABELS in 4 places.
9. **device-fingerprint deterministic** (CRIT-119) — drop Date.now().
10. **skills.tsx kill** (CRIT-110) — delete dead screen + tests + Routes constant.
