# Audit 2026-05-01 — Phase K PARTIAL — Mobile shared (interim findings as of 77/140 files)

**Status:** 77 of ~140 Phase K files read line-by-line. Writing this file now because the previous "accumulate in head, summarize at end" pattern is the same failure mode the audit was supposed to fix. Per-batch findings going forward.

## Files fully read in Phase K (77 files, ~9,800 lines covered)

### Auth + storage core (10 files, ~1,250 lines)
- apps/mobile/src/services/api.ts (251)
- apps/mobile/src/services/secure-storage.ts (164)
- apps/mobile/src/services/secure-storage.service.ts (64)
- apps/mobile/src/services/auth-migration.ts (90)
- apps/mobile/src/services/__tests__/auth-migration.test.ts (141)
- apps/mobile/src/services/device-fingerprint.service.ts (45)
- apps/mobile/src/stores/auth.store.ts (100)
- apps/mobile/src/hooks/useAuth.ts (47)
- apps/mobile/src/services/socket.service.ts (51)
- apps/mobile/src/services/push.service.ts (235)

### Layouts + index (5 files, ~414 lines)
- apps/mobile/app/_layout.tsx (119)
- apps/mobile/app/(tabs)/_layout.tsx (70)
- apps/mobile/app/(provider-tabs)/_layout.tsx (76)
- apps/mobile/app/index.tsx (86)
- apps/mobile/app/auth/_layout.tsx (13)
- apps/mobile/app/provider-onboarding/_layout.tsx (17)
- apps/mobile/app/onboarding.tsx — NOT YET READ

### Auth screens (3 files, ~413 lines)
- apps/mobile/app/auth/login.tsx (121)
- apps/mobile/app/auth/otp-verify.tsx (143)
- apps/mobile/app/auth/register.tsx (149)

### Provider onboarding screens (9 files, ~2,082 lines)
- apps/mobile/app/provider-onboarding/role-select.tsx (95)
- apps/mobile/app/provider-onboarding/categories.tsx (201)
- apps/mobile/app/provider-onboarding/service-area.tsx (195)
- apps/mobile/app/provider-onboarding/documents.tsx (195)
- apps/mobile/app/provider-onboarding/selfie.tsx (191)
- apps/mobile/app/provider-onboarding/identity-verification.tsx (514)
- apps/mobile/app/provider-onboarding/terms.tsx (240)
- apps/mobile/app/provider-onboarding/review-pending.tsx (124)
- apps/mobile/app/provider-onboarding/background-check-status.tsx (315)

### Customer tabs (4 files, ~1,613 lines)
- apps/mobile/app/(tabs)/home.tsx (831)
- apps/mobile/app/(tabs)/bookings.tsx (281)
- apps/mobile/app/(tabs)/wallet.tsx (245)
- apps/mobile/app/(tabs)/profile.tsx (256)

### Provider tabs (4 files, ~1,401 lines)
- apps/mobile/app/(provider-tabs)/dashboard.tsx (409)
- apps/mobile/app/(provider-tabs)/jobs.tsx (265)
- apps/mobile/app/(provider-tabs)/earnings.tsx (312)
- apps/mobile/app/(provider-tabs)/provider-profile.tsx (415)

### Mobile services (~22 files, ~2,700 lines)
- apps/mobile/src/services/booking.service.ts (257)
- apps/mobile/src/services/provider-api.service.ts (350)
- apps/mobile/src/services/payment.service.ts (53)
- apps/mobile/src/services/booking-photo.service.ts (166)
- apps/mobile/src/services/upload.service.ts (64)
- apps/mobile/src/services/config.service.ts (99)
- apps/mobile/src/services/compliance.service.ts (44)
- apps/mobile/src/services/data-management.service.ts (51)
- apps/mobile/src/services/security.service.ts (27)
- apps/mobile/src/services/address.service.ts (63)
- apps/mobile/src/services/business.service.ts (232)
- apps/mobile/src/services/catalog.service.ts (59)
- apps/mobile/src/services/messaging.service.ts (70)
- apps/mobile/src/services/notification.service.ts (48)
- apps/mobile/src/services/pricing.service.ts (59)
- apps/mobile/src/services/provider.service.ts (76)
- apps/mobile/src/services/provider-tools.service.ts (181)
- apps/mobile/src/services/rebooking.service.ts (55)
- apps/mobile/src/services/recurring.service.ts (129)
- apps/mobile/src/services/referral.service.ts (47)
- apps/mobile/src/services/review.service.ts (74)
- apps/mobile/src/services/service-area.service.ts (107)
- apps/mobile/src/services/slot-waitlist.service.ts (45)
- apps/mobile/src/services/suki.service.ts (77)
- apps/mobile/src/services/tip.service.ts (31)

### Mobile hooks (6 files, ~571 lines)
- apps/mobile/src/hooks/useImagePicker.ts (198)
- apps/mobile/src/hooks/useJobGpsBroadcast.ts (119)
- apps/mobile/src/hooks/useLocation.ts (90)
- apps/mobile/src/hooks/useSocket.ts (64)
- apps/mobile/src/hooks/useSocketRoom.ts (53)
- apps/mobile/src/hooks/useAccessibility.ts (40)

### Mobile stores (10 files, ~1,123 lines)
- apps/mobile/src/stores/booking.store.ts (154)
- apps/mobile/src/stores/onboarding.store.ts (59)
- apps/mobile/src/stores/business.store.ts (195)
- apps/mobile/src/stores/security.store.ts (60)
- apps/mobile/src/stores/data-management.store.ts (81)
- apps/mobile/src/stores/service-area.store.ts (111)
- apps/mobile/src/stores/recurring.store.ts (134)
- apps/mobile/src/stores/pricing.store.ts (115)
- apps/mobile/src/stores/provider-tools.store.ts (145)
- apps/mobile/src/stores/accessibility.store.ts (69)

**Total Phase K so far: 77 files / ~9,800 lines fully read**

---

## STILL NOT READ in Phase K (~63 files remaining)

### Components (38 files, ~3,200 lines)
- apps/mobile/src/components/ — all 8 files
- apps/mobile/src/components/icons/index.ts (197)
- apps/mobile/src/components/provider/ — all 4 files
- apps/mobile/src/components/ui/ — all 17 files

### Mobile config (5 files, ~501 lines)
- apps/mobile/src/config/accessibility.ts (90)
- apps/mobile/src/config/animations.ts (70)
- apps/mobile/src/config/navigation.ts (174)
- apps/mobile/src/config/platform.config.ts (82)
- apps/mobile/src/config/theme.ts (85)

### Mobile lib (3 files, ~183 lines)
- apps/mobile/src/lib/i18n.ts (88)
- apps/mobile/src/lib/logger.ts (68)
- apps/mobile/src/lib/toast.ts (27)

### Mobile utils (8 files, ~336 lines)
- apps/mobile/src/utils/address.ts (35)
- apps/mobile/src/utils/cancellation-policy.ts (70)
- apps/mobile/src/utils/currency.ts (29)
- apps/mobile/src/utils/date.ts (68)
- apps/mobile/src/utils/distance.ts (17)
- apps/mobile/src/utils/haptics.ts (53)
- apps/mobile/src/utils/phone.ts (38)
- apps/mobile/src/utils/validation.ts (26)

### Mobile types (3 files, ~109 lines)
- apps/mobile/src/types/expo-image-picker.d.ts (39)
- apps/mobile/src/types/expo-modules.d.ts (60)
- apps/mobile/src/types/sentry.d.ts (10)

### Other mobile hooks (8 files, ~321 lines)
- apps/mobile/src/hooks/useAppState.ts (56)
- apps/mobile/src/hooks/useBooking.ts (44)
- apps/mobile/src/hooks/useDebouncedValue.ts (22)
- apps/mobile/src/hooks/useFeatureFlags.ts (42)
- apps/mobile/src/hooks/useOffline.ts (48)
- apps/mobile/src/hooks/useStatusMutation.ts (56)
- apps/mobile/src/hooks/useWallet.ts (86)
- apps/mobile/src/services/secure-storage.service.ts — done above

### Other mobile services (1 file)
- apps/mobile/src/services/auth-migration.ts — done above (note: covered)

### Mocks + jest (15 files, ~363 lines)
- apps/mobile/__mocks__/ — all 15 files
- apps/mobile/jest.config.js (73)
- apps/mobile/jest.setup.js (65)
- apps/mobile/app.config.ts (159)
- apps/mobile/app/onboarding.tsx (206)

---

## CRITICAL findings from Phase K so far

### CRIT-K01 — Two secure-storage implementations; hardcoded encryption key in legacy one

**Files:**
- apps/mobile/src/services/secure-storage.ts:33-115 — NEW correct implementation (Bug 1061 fix). Uses OS-keychain-derived random 32-byte key, MMKV id `'onservice-auth-secure'`. Holds tokens + user PII.
- apps/mobile/src/services/secure-storage.service.ts:1-64 — OLD implementation. Uses **HARDCODED** key `'onservice-dev-only-key'` if env var unset. MMKV id `'onservice-secure'`. Currently holds device fingerprint + accessibility prefs.
- apps/mobile/src/services/device-fingerprint.service.ts:4 — STILL imports from the old `./secure-storage.service`. Device fingerprint stored under known plaintext-equivalent key.

**Why critical:** Even though the device fingerprint isn't a credential, it participates in security decisions (per-device login verification per `apps/mobile/src/services/security.service.ts`). With a hardcoded key, the encryption is meaningless — anyone reading the source knows the key. The "encrypted" MMKV is decryptable by anyone with the source code.

**Fix scope:** Either (a) migrate `device-fingerprint.service.ts` and `accessibility.store.ts` to the new encrypted pattern, OR (b) drop the encryption pretense and use the unencrypted MMKV `publicStorage` for non-PII data. Pick one and remove the dead "secure-with-known-key" code path.

---

### CRIT-K02 — Provider tabs layout has no role check

**File:** apps/mobile/app/(provider-tabs)/_layout.tsx:17-77

The layout renders `<Tabs>` with no check that `useAuthStore.user.role === 'provider'`. A customer who lands at `/(provider-tabs)/dashboard` via deep-link or buggy navigation gets the provider UI rendered, then sees 403/empty data when API calls fire.

Mirror issue: `apps/mobile/app/(tabs)/_layout.tsx:16-57` similarly has no role check (but a provider rendering customer UI is less harmful).

**Fix:** Add `if (user?.role !== 'provider') router.replace('/(tabs)/home');` guard at layout level. Same for the customer side.

---

### CRIT-K03 — push.service.ts reads user from WRONG storage; provider deep-links broken

**File:** apps/mobile/src/services/push.service.ts:100-109

```ts
function getUserRole(): string {
  try {
    const userJson = storage.getString('user');  // ← legacy unencrypted MMKV
    if (userJson) {
      const user = JSON.parse(userJson) as { role?: string };
      return user.role ?? 'customer';
    }
  } catch { /* default */ }
  return 'customer';
}
```

`storage` here is the legacy MMKV (id `'onservice-auth'`). After Bug 1061 fix landed, `auth.store.ts:73` writes user to encrypted `secure-storage` via `storeUser()`. The auth-migration.ts moves the existing 'user' key to secure-storage on first boot. After that, `storage.getString('user')` returns `undefined` permanently.

**Result:** every push notification deep-link defaults to customer routes. A provider receiving a `new_job_available` push gets routed to `/customer/booking/${id}` instead of `/provider/job/${id}`.

**Fix:** Replace with `getStoredUser()` from `secure-storage.ts`.

---

### CRIT-K04 — socket.service.ts reads accessToken from WRONG storage; sockets won't authenticate

**File:** apps/mobile/src/services/socket.service.ts:14

```ts
const token = storage.getString('accessToken');  // ← legacy unencrypted MMKV
socket = io(platformConfig.apiUrl, {
  auth: { token },
  ...
});
```

Same anti-pattern as CRIT-K03. After auth-migration ran, the access token lives in encrypted `secure-storage`, not in `storage`. Socket connections are made with `token = undefined`, server rejects, real-time chat/booking-status/messaging silently broken.

**Fix:** Replace with `getAccessToken()` from `secure-storage.ts`.

---

### CRIT-K05 — Two storage locations for booking photos active in mobile code

**Confirms migration-level CRIT-159 with mobile evidence.**

- apps/mobile/src/services/booking.service.ts:33-35 — `Booking.providerBeforePhotos: string[]` and `providerAfterPhotos: string[]` interface fields (legacy TEXT[] arrays from migration 037).
- apps/mobile/src/services/booking.service.ts:231-241 — `uploadJobPhotos(bookingId, phase, urls)` POSTs to `/api/v1/bookings/${id}/photos` with `{ phase, urls }` — writes to the legacy TEXT[] arrays.
- apps/mobile/src/services/booking-photo.service.ts:80-110 — `uploadBookingPhoto(...)` POSTs to `/api/v1/uploads/booking-photo` — writes to the new `booking_photos` table from migration 079.

Both code paths exist and are used. Photos written by one path are not visible to the other. Dispute evidence display will break.

**Fix:** Pick canonical (booking_photos table per migration 079), backfill TEXT[] data, remove the `uploadJobPhotos` legacy endpoint and the array fields from the interface.

---

### CRIT-K06 — Provider onboarding has dead-code parallel flow

**Files:**
- apps/mobile/app/provider-onboarding/_layout.tsx:7-15 — declares 7 stack screens: role-select, categories, service-area, documents, selfie, terms, review-pending. **Does NOT include identity-verification or background-check-status.**
- apps/mobile/app/provider-onboarding/identity-verification.tsx (514 lines) — submits ID photos as base64-in-JSON to `/api/v1/provider-onboarding/identity`. **Not reachable from the active onboarding stack.**
- apps/mobile/app/provider-onboarding/background-check-status.tsx (315 lines) — also not in the stack.
- apps/mobile/app/provider-onboarding/terms.tsx:23-39 — the active path. Submits to `/api/v1/providers/apply` with `governmentIdFrontUrl/governmentIdBackUrl/nbiClearanceUrl/selfieUrl` (uploaded URLs from `/api/v1/uploads`).

Two parallel implementations of provider KYC, both shipped, neither integrated with the other.

**Fix:** Delete `identity-verification.tsx` and `background-check-status.tsx` OR add them to `_layout.tsx` and remove the inline submit from `terms.tsx`. Pick one.

---

### CRIT-K07 — background-check-status.tsx is a static placeholder, never queries server

**File:** apps/mobile/app/provider-onboarding/background-check-status.tsx:40-60

```ts
function useBackgroundCheckStatus(): BackgroundCheckHookResult {
  const defaultEta = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  const [data, setData] = useState<BackgroundCheckState>({
    status: 'pending',
    estimatedCompletionAt: defaultEta,
  });
  ...
  // Placeholder: real implementation would call the backend.
  await new Promise<void>((resolve) => setTimeout(resolve, 600));
  setData((prev) => ({ ...prev }));
  ...
}
```

Provider always sees "Pending, 48-hour ETA" regardless of actual admin review state. Even after admin approval, this screen lies. (Mitigated only because it's not in the active stack — see CRIT-K06.)

---

### CRIT-K08 — Provider earnings chart shows hardcoded fake data

**File:** apps/mobile/app/(provider-tabs)/earnings.tsx:153-165

```tsx
<EarningsChart
  data={[
    { date: '2026-04-25', amount: wallet?.availableBalance ? Math.round(wallet.availableBalance / 7) : 0 },
    { date: '2026-04-26', amount: wallet?.availableBalance ? Math.round(wallet.availableBalance / 7) : 0 },
    ... 7 identical entries ...
  ]}
/>
```

All 7 days show the same value (current balance / 7). Provider can't see real daily earnings. Should call `getEarningsTrends('daily', 7)` from provider-tools.service.ts:130 (which exists and works).

---

### CRIT-K09 — Commission breakdown panel shows static 12% regardless of provider tier

**File:** apps/mobile/app/(provider-tabs)/earnings.tsx:168-186

```tsx
<CommissionBreakdown
  gross={Math.round(wallet.availableBalance * 1.13)}
  lines={[
    { label: 'Platform fee', amount: Math.round(wallet.availableBalance * 0.12), pct: 12, ... },
    { label: 'VAT', amount: Math.round(wallet.availableBalance * 0.0144) },
  ]}
  net={wallet.availableBalance}
/>
```

Hardcoded 12% commission. Real commission rates from migration 050 + 073: founding=10%, new=15%, verified=13%, pro=11%, elite=9%. Provider sees wrong fee. Service `getMyProfile()` returns `tier`; the UI ignores it here.

---

### CRIT-K10 — Provider auto-routed to provider-tabs after submitting onboarding (before admin approval)

**File:** apps/mobile/app/provider-onboarding/terms.tsx:42-48

```ts
onSuccess: () => {
  const user = useAuthStore.getState().user;
  if (user) {
    setUser({ ...user, role: 'provider' });  // ← role flipped client-side
  }
  ...
  router.replace(Routes.PROVIDER_ONBOARDING.REVIEW_PENDING);
},
```

After submitting application, the client sets `user.role = 'provider'` immediately. Combined with CRIT-K02 (no role gate on provider-tabs), the user can navigate freely into the provider experience. Server is presumably gating by status='pending', but UI/UX leaks the unapproved state.

---

## MEDIUM findings from Phase K so far

### MED-K01 — getDeviceFingerprint() race condition
**File:** apps/mobile/src/services/device-fingerprint.service.ts:9-30
Two simultaneous calls before SecureStore write completes will both compute different fingerprints and store one of them. Add module-level promise lock.

### MED-K02 — auth.store.verifyOtp lacks API response shape validation
**File:** apps/mobile/src/stores/auth.store.ts:69-78
`const { accessToken, refreshToken, user, isNewUser } = res.data.data;` assumes shape. If server returns malformed payload, `storeTokens(undefined, undefined)` crashes downstream.

### MED-K03 — api.ts refreshOnce() not synchronized
**File:** apps/mobile/src/services/api.ts:174-189
Concurrent 401s trigger N parallel refresh attempts. Should mutex the refresh call so only one fires per token-expiry window.

### MED-K04 — Auth screens use wrong error-shape parsing (won't show server messages)
**Files:** login.tsx:36-39, otp-verify.tsx:56-60, register.tsx:48-52, identity-verification.tsx:165-170, terms.tsx:50-53, profile.tsx:84-86, dashboard.tsx:83-86, provider-profile.tsx:82-85
All use `axErr?.response?.data?.error?.message` (axios shape). The api.ts wrapper throws `ApiError` with `body?.error?.message`. Server error messages never display — users always see generic fallback text.

### MED-K05 — provider-api.service.ts ProviderSelf.tier missing 'founding'
**File:** apps/mobile/src/services/provider-api.service.ts:10
`tier: 'new' | 'verified' | 'pro' | 'elite'` — missing 'founding' from migration 073. Founding-tier providers fail TypeScript and may render incorrectly.

### MED-K06 — Provider onboarding service-area defaults to Manila for unknown cities
**File:** apps/mobile/app/provider-onboarding/service-area.tsx:50-58
If a provider types "Cagayan de Oro" (not in PH_REGIONS list), lat/lng default to Manila (14.5995, 120.9842). Same Boracay launch-family pattern as Bug 320/322. Provider gets zero jobs because location is wrong.

### MED-K07 — Provider onboarding doesn't capture ID number, NBI expiry, ID expiry
**Files:** documents.tsx, terms.tsx
Submits 4 photo URLs but no ID number, no NBI clearance expiration date, no ID expiration date. Admin must type these from the photo at review time. AMLA/KYC compliance gap.

### MED-K08 — identity-verification.tsx silent-404 fallback is unreachable
**File:** apps/mobile/app/provider-onboarding/identity-verification.tsx:165-174
The 404-fallback block checks `apiErr.response?.status === 404` but api.ts throws `ApiError` not axios-shape errors, so the check never fires. Comment about "silent fallback" is misleading.

### MED-K09 — Customer doesn't see selected location in home header
**File:** apps/mobile/app/(tabs)/home.tsx:189-194
Header shows static "Select your address ▾" text — never reads from booking store / current address. Customer can't see what address is selected.

### MED-K10 — provider-profile yearsExperience / radius accept any positive integer
**File:** apps/mobile/app/(provider-tabs)/provider-profile.tsx:71-74
Migration 013 limits yearsExperience to 0-60; migration 074 limits radius. Client doesn't pre-validate — server rejects with generic error.

### MED-K11 — Provider dashboard renders job.servicePrice instead of job.totalAmount
**Files:** (provider-tabs)/dashboard.tsx:232, (provider-tabs)/jobs.tsx:105
After Phase 14 D05 made server-canonical pricing, the meaningful number on a provider's job card is `totalAmount` (what customer paid). Showing `servicePrice` only is misleading.

### MED-K12 — push.service.ts isRegistered tracked via legacy storage
**File:** apps/mobile/src/services/push.service.ts:187-188
`storage.getString('pushToken')` for the `isRegistered` flag. After auth-migration, this returns undefined and the app re-registers on every boot.

### MED-K13 — Auth screens default landing path puts ALL new users in provider-onboarding
**File:** apps/mobile/app/auth/otp-verify.tsx:46
After register-mode OTP verify, ALL users go to `Routes.PROVIDER_ONBOARDING.ROLE_SELECT`. The role-select screen offers Customer or Provider, but the routing language ("provider-onboarding/role-select") is misleading and the screen breadcrumb may confuse customers.

### MED-K14 — useImagePicker mime-type derived from extension; spoofable
**File:** apps/mobile/src/hooks/useImagePicker.ts (and upload.service.ts:43-47)
File extension determines mime type sent to server. A file named `photo.jpg` with .exe content gets mime `image/jpeg`. Server must verify content-type matches actual bytes.

---

## POSITIVE findings (genuinely well-done in Phase K)

1. **secure-storage.ts** — The new Bug 1061 fix is correctly implemented: per-device random key, OS-keychain-locked, base64 fallback for SSR. Solid.
2. **auth-migration.ts** — Idempotent flag in secure store, captures partial failures, marks complete even on clean install. Test coverage is real (auth-migration.test.ts uses Map mocks for both stores).
3. **useJobGpsBroadcast.ts** — Correct lifecycle gating (only on `provider_en_route` / `provider_arrived`), graceful permission denial, foregroundService notification (Android compliance), TaskManager registered at module load (survives JS bridge teardown).
4. **booking-photo.service.ts** — Correctly uses multipart upload to `/api/v1/uploads/booking-photo` per migration 079 schema. No `file://` leakage.
5. **api.ts** — Correct one-retry-only refresh pattern, AbortController timeout, ApiError class with status + body. Good shape.
6. **R5-complete component wiring** verified at JSX level: bookings.tsx renders FilterChips, FilterModal, PaginationLoader, StatusBadge. dashboard.tsx + jobs.tsx render NbiStatusBanner, PulsingDot, CommissionBreakdown, EarningsChart. All real usages, not just imports.

---

## Going forward (Phase K continuation)

Reading 3-5 files per batch, writing per-batch findings before moving on. Starting from file 78: `apps/mobile/app/onboarding.tsx`, then `apps/mobile/src/components/`, then config/lib/utils/types/hooks/mocks.

Honest line count remaining: ~63 files / ~4,500 lines of mobile to finish Phase K. Then Phase L (admin), M (api support), N (api services/routes), O (tests/scripts/infra), P (synthesis).
