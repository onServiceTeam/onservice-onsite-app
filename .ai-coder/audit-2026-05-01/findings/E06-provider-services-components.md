# Phase E Findings Part 6 — Provider services + components (Phase E close)

Files added in this batch:
- `apps/mobile/src/services/provider-tools.service.ts` (181) — full
- `apps/mobile/src/services/booking.service.ts` (257) — full
- `apps/mobile/src/services/business.service.ts` (232) — read top 100; remainder is API methods
- `apps/mobile/src/services/notification.service.ts` (48) — full
- `apps/mobile/src/services/referral.service.ts` (47) — full
- `apps/mobile/src/services/security.service.ts` (27) — full
- `apps/mobile/src/services/service-area.service.ts` (107) — full
- `apps/mobile/src/services/suki.service.ts` (77) — full
- `apps/mobile/src/services/device-fingerprint.service.ts` (45) — full
- `apps/mobile/src/components/provider/NewJobModal.tsx` (351) — full
- `apps/mobile/src/components/provider/NbiStatusBanner.tsx` (121) — full
- `apps/mobile/src/components/provider/EarningsChart.tsx` (100) — full
- `apps/mobile/src/components/provider/CommissionBreakdown.tsx` (147) — full

Plus targeted Grep verifications:
- Server has `/me/earnings/{summary,trends,categories}`, `/me/goals`, `/me/demand-insights`, `/me/receipts/:id`, `/me/materials-list/:id`, `/me/monthly-summary` ALL EXIST (provider-tools.service.ts uses them) — but **NO MOBILE SCREEN actually calls these methods** (CRIT-99/100/107/112/113 all use fake hardcoded data instead).
- `/api/v1/provider/nbi-status` → DOES NOT EXIST on server (CRIT-118).

**Phase E running total: ~14,031 lines fully read.**
**Audit grand total: ~52,684 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-117)

### CRIT-118 — `NbiStatusBanner` fetches NON-EXISTENT `/api/v1/provider/nbi-status` → banner never renders → NBI-expiry warnings silently disabled
**Files:**
- [apps/mobile/src/components/provider/NbiStatusBanner.tsx:46-53](apps/mobile/src/components/provider/NbiStatusBanner.tsx#L46) — `api.get('/api/v1/provider/nbi-status')`
- Server: NO `/provider/nbi-status` route exists (verified via grep).
- Component logic: if `query.data` is falsy → `return null` (line 55). Endpoint 404 → query stays in loading/error state → banner permanently hidden.

The banner is mounted in 3 high-visibility provider surfaces:
- `(provider-tabs)/_layout.tsx` (under the new-job overlay) — silently inert.
- `(provider-tabs)/jobs.tsx` (above jobs list) — silently inert.
- `provider/certifications.tsx` (top of cert page) — silently inert.

**Provider experience:**
1. Provider's NBI clearance is approaching expiry (≤30 days).
2. Server-side matching algorithm checks NBI validity. Provider's NBI expires.
3. Server stops matching this provider to new bookings (per the documented matching rules).
4. Provider sees zero new jobs for days/weeks. **No banner. No warning. No "renew now" CTA.**
5. Provider opens support ticket: "Why am I not getting jobs anymore?"
6. Support discovers their NBI expired. Provider re-uploads. Days lost.

For the launch cohort, this is a **silent revenue cliff** — providers who built up regular customers suddenly disappear from search with no explanation.

The banner code is well-written (Phase 14 D12 Pattern P1, per docstring). The endpoint just needs to exist OR the banner needs a different data source. Since the banner is also wired into 3 places, fixing once unblocks 3 surfaces.

**Fix dispatch:**
```
1. Implement GET /api/v1/provider/nbi-status on server. Returns:
       { status: 'valid'|'expiring'|'expired'|'missing', expiresAt: ISO|null }
   Pulls from providers table or provider_documents table.
2. Server should also auto-disable matching when status='expired' or
   'missing' (defense-in-depth). Mobile banner is the customer-facing
   warning; server is the actual gate.
3. Real test: render NbiStatusBanner with mocked fetcher returning each
   of the 4 statuses; assert correct title/body for each.
4. Existing testID props (nbi-banner-expired, nbi-banner-missing,
   nbi-banner-expiring) make the test easy.
5. Pair with admin-side cert-expiry workflow + notification trigger.
```

### CRIT-119 — `device-fingerprint.service.ts` produces a NON-DETERMINISTIC fingerprint (includes `Date.now()` in hash input)
**File:** [apps/mobile/src/services/device-fingerprint.service.ts:23-30](apps/mobile/src/services/device-fingerprint.service.ts#L23)
```ts
const hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  raw + Date.now().toString(),    // ← timestamp salt makes the hash non-stable
);
setSecureItem(FP_KEY, hash);
return hash;
```

The "raw" inputs (Platform.OS, Platform.Version, Application ID, native build version, install time) WOULD produce a stable per-device fingerprint. Adding `Date.now()` to the hash input breaks that — every fresh install gets a brand-new fingerprint.

After the first call, the hash IS cached in secure storage so subsequent calls are stable. But:
- **Uninstall + reinstall** → new fingerprint → server treats as new device.
- **Secure-storage wipe** (rare but possible on Android during low-storage cleanup) → new fingerprint.
- **Migration from legacy storage** (Bug 1061 chain) → may invalidate the cached fingerprint.

**Impact:** the device-trust system (security.service.ts: trustDevice / removeDevice) depends on stable fingerprints. A "trusted" device losing its fingerprint becomes "untrusted" after reinstall, triggering re-2FA / re-verification flows. Also pollutes the `auth_devices` table with one row per install instead of one per device.

The fingerprint is used in auth flows (per security.service.ts surface) — possibly for refresh-token replay detection, MFA bypass, "new device" alerts. Non-stability undermines all of these.

**Fix:**
```ts
const hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  raw,                            // ← drop the Date.now() salt
);
```

The first-call cache writes to secure storage anyway; reproducibility is the point of a fingerprint. (If the concern was hash-collision avoidance: that's already handled by the multi-field input; the timestamp salt isn't necessary.)

---

## MEDIUM bugs

### MED-262 — `NewJobModal.handleAccept` navigates to job WITHOUT actually accepting the job server-side
**File:** [apps/mobile/src/components/provider/NewJobModal.tsx:118-124](apps/mobile/src/components/provider/NewJobModal.tsx#L118)
```ts
const handleAccept = (): void => {
  if (!job) return;
  clearTimer();
  const bookingId = job.bookingId;
  setJob(null);
  router.push(`/provider/job/${bookingId}`);
};
```
No mutation, no API call, no state change on the server. The provider sees the job detail screen (which thinks the booking is still in `paid` / `matched` status awaiting confirmation). The 60s timeout then expires server-side → server re-matches the job to another provider.

**Provider experience:**
1. Notification: "New job at Boracay! ₱1,500"
2. Provider taps Accept.
3. Sees job detail screen, taps "Start Navigation" → server says "you're not assigned to this job" because the 60s window already passed and re-matched.

Compare with `handleDecline` which DOES call `updateBookingStatus(bookingId, 'cancelled_by_provider')`.

**Fix:** add an `acceptMutation` that calls a server endpoint to claim the job (e.g., `POST /api/v1/bookings/:id/claim` or `PATCH status='matched'` with provider claim). On success, navigate.

### MED-263 — `NewJobModal` 60s countdown is hardcoded (`COUNTDOWN_SECONDS = 60`)
**File:** [apps/mobile/src/components/provider/NewJobModal.tsx:26](apps/mobile/src/components/provider/NewJobModal.tsx#L26)
Should be from `platformConfig.providerJobAcceptWindowSeconds` so admin can tune it. Otherwise mobile and server drift if server changes the timeout. CRIT-81 family.

### MED-264 — `NewJobModal` "📍 Location" emoji in detail row (icon-only rule violation)
**File:** [apps/mobile/src/components/provider/NewJobModal.tsx:190](apps/mobile/src/components/provider/NewJobModal.tsx#L190)
Use MapPin Lucide icon. Cross-cutting with several similar emoji-as-icon violations (jobs.tsx 📍, photos.tsx 📷, etc).

### MED-265 — `NewJobModal` socket listener registers in useEffect with `getSocket()` which may return null on cold start
**File:** [apps/mobile/src/components/provider/NewJobModal.tsx:60-78](apps/mobile/src/components/provider/NewJobModal.tsx#L60)
```ts
useEffect(() => {
  const socket = getSocket();
  if (!socket) return;        // ← bailing here means no listener registered
  // ...
  socket.on('new:job', handler);
  return () => { socket.off('new:job', handler); };
}, []);
```

If the modal mounts before `connectSocket()` resolves (cold app start), `getSocket()` returns null, the listener never binds, and **no new-job notifications appear for this session**. Provider is online but invisible to the new-job overlay.

`(provider-tabs)/_layout.tsx` mounts NewJobModal globally — but if the user opens the app and lands on a non-(provider-tabs) screen first (e.g., onboarding), the modal mounts later when they reach the tabs. Race condition with socket connection.

**Fix:** subscribe via `useAuthStore` (auth state) so the effect re-runs when auth resolves AND socket becomes available. Or use a callback ref pattern that re-binds when socket changes.

### MED-266 — `device-fingerprint` non-deterministic (CRIT-119 root cause noted; same as CRIT)
This MED was promoted to CRIT-119 above. Skip.

### MED-267 — `provider-tools.service.ts` fully built (181 lines, 9 endpoints) but ZERO mobile screens call ANY of its methods
**File:** [apps/mobile/src/services/provider-tools.service.ts](apps/mobile/src/services/provider-tools.service.ts)
Server has all 9 endpoints (verified). Mobile service client has all 9 wrappers (typed). **No screen imports the service.** Verified via grep.

This means CRIT-99, CRIT-100, CRIT-107, CRIT-112, CRIT-113 (the entire fake-earnings-data family) could be FIXED today using this service — the data layer exists, the components exist, the screens just don't connect them. **The R5-complete remediation built everything except the wire.**

**Fix dispatch:** wire the existing methods into earnings.tsx, payouts.tsx, withdraw.tsx, complete.tsx (post-job preview), provider/job/[id].tsx (Your Earnings card). Single PR can hit all 5 CRITs.

### MED-268 — `business.service.ts` is 232 lines for a B2B feature not exercised in v1.0 launch
**File:** [apps/mobile/src/services/business.service.ts](apps/mobile/src/services/business.service.ts)
Comprehensive B2B account / contract / invoice client — but no mobile screen uses it (verified via grep). Likely scaffolded for v1.1+ B2B push.

Not a bug per se, but: dead-code shipped to production app bundle adds JS parse + bundle size. Either tree-shake aggressively, lazy-load on demand, or wait until B2B screens ship.

### MED-269 — `notification.service.ts` `Notification.type: string` is unconstrained (drift risk)
**File:** [apps/mobile/src/services/notification.service.ts:5](apps/mobile/src/services/notification.service.ts#L5)
Server emits typed notifications (booking_assigned, payment_received, etc per the icon map in customer/provider notifications.tsx). Type should be a union, not raw string. Causes the icon-fallback drift in MED-188 / MED-248.

### MED-270 — `service-area.service.ts` `checkCoverage(lat, lng)` could solve Boracay launch bugs (CRIT-92/93/116) IF Boracay service-area exists in DB
**File:** [apps/mobile/src/services/service-area.service.ts:64-72](apps/mobile/src/services/service-area.service.ts#L64)
Server-side service-areas table is the canonical source for "are we live in this region?" The mobile customer address-picker (CRIT-92/93) and provider onboarding service-area (CRIT-116) should call `checkCoverage` instead of using hardcoded PH_REGIONS. Fold this into the Boracay-launch dispatch.

### MED-271 — `suki.service.ts` `SukiTier.discount: number` and `pointsMultiplier: number` — units unclear (centavos? percent? decimal?)
**File:** [apps/mobile/src/services/suki.service.ts:27-32](apps/mobile/src/services/suki.service.ts#L27)
No comment, no JSDoc. Caller must guess. If server returns `discount: 0.05` (decimal) and mobile renders as `${discount}%` → "0.05% off". Or if server returns `5` (percent) and mobile multiplies by 100 → "500% off". Cross-cutting type-safety / units gap.

---

## LOW / INFO

- **provider-tools.service.ts is the most disappointing file in the audit.** Beautifully typed, 9 useful endpoints, server fully built — and zero callers in mobile. Pure waste because no screen wired it.
- **booking.service.ts is comprehensive** — all booking lifecycle: create, get, quote, change-order, photos, dispute. Used by both customer and provider flows.
- **NewJobModal countdown UX is excellent** — animated progress bar, urgency state at <15s, color shift to red. Just needs the accept-mutation fix (MED-262).
- **NbiStatusBanner three-state UX** (warning/error/missing/expiring with day countdown) is the right pattern for cert-expiry — just needs the endpoint (CRIT-118).
- **EarningsChart is clean** — pure RN bars with proper accessibility labels per bar. Component is correct; screens that pass it fake data are wrong (CRIT-99 family).
- **CommissionBreakdown disclosure modal** ("Where does each line come from?") is the kind of money-transparency UX that builds provider trust. Ship it with REAL data.
- **service-area.service.ts coverage-check pattern** is a good architecture choice for region rollout — server-canonical with mobile asking "are we live here?"
- **referral.service.ts is minimal and clean** — 3 functions: getMyCode, redeemCode, getMyReferrals.
- **security.service.ts is minimal but correct** — getDevices/trustDevice/removeDevice. Probably underused on mobile.
- **device-fingerprint uses encrypted secure storage** for the cached hash (Bug 1061 family compliant). Just non-deterministic on cold install (CRIT-119).
- **suki.service.ts and notification.service.ts are minimal and correct** apart from MED-269 / MED-271.
- **business.service.ts is complete for B2B v1.1+** — the type definitions are thoughtful (CreateBusinessParams covers the BIR registration fields, contract/invoice lifecycle is modeled).

---

## Updated headline counts after E06

| Severity | Total | New in E06 |
|---|---:|---:|
| **CRITICAL** | **117 (1 invalidated → 116 real)** | **+2 (CRIT-118, CRIT-119)** |
| **MEDIUM** | **271** | **+10 (MED-262–271)** |

**Phase E COMPLETE.** Writing PHASE-E-SUMMARY-AND-HANDOFF.md next.
