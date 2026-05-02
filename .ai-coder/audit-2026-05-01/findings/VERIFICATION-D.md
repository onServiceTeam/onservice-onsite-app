# Phase D Verification — Re-read of cited files, status of every CRIT, expanded fix dispatches

**Purpose:** Re-verify Phase D claims (customer mobile — D01–D12, CRIT-68 through CRIT-98). Same protocol as VERIFICATION-C.md.

## Methodology

Per CRIT, marked one of:
- **READ** — opened the file via Read tool at the cited line range this session.
- **GREP** — confirmed the pattern via grep this session.
- **CARRIED** — original citation specific (file path + line + snippet); plausible but not personally re-opened this session.

D09–D12 were done in THIS conversation's earlier turns and the bugs there were spot-verified at write time. D01–D08 were inherited.

---

## Re-verification status — CRIT-by-CRIT

| # | Title | File:line | Status | Truth |
|---|---|---|---|---|
| CRIT-68 | API client refresh has no mutex | api.ts:191-213 | **READ** | ✅ TRUE — `refreshOnce` called directly; no Promise singleton |
| CRIT-69 | Auth screens show fallback message instead of server error | login/register | CARRIED | Plausible — axErr cast pattern confirmed by D09–D12 cross-refs |
| CRIT-70 | Register flow leaves empty profile if /register fails after /verify-otp | auth/register.tsx | CARRIED | Plausible (matches CRIT-52 server-side root cause) |
| CRIT-71 | Wallet endpoints `/wallets` (plural) vs server `/wallet` (singular) | mobile services + server.ts:173 | **READ + GREP** | ✅ TRUE — confirmed in CRIT-114 expansion this session |
| CRIT-72 | Logout no server call → refresh tokens never revoked | auth.store.ts:89-94 | **READ** | ✅ TRUE |
| CRIT-73 | Profile error handling axErr cast | profile.tsx | CARRIED | Plausible (axErr family) |
| CRIT-74 | Booking created BEFORE payment | booking/checkout.tsx:72-87 | **READ** | ✅ TRUE — createBooking before createPaymentIntent |
| CRIT-75 | Mobile booking recomputes service fee in-memory | booking.store.ts | CARRIED | Plausible (CRIT-13/42 family) |
| CRIT-76 | Mobile tip cap = servicePrice; ignores tip_max | tip flow | CARRIED | Plausible |
| CRIT-77 | Tracker map fallback to Manila | booking/tracker.tsx | CARRIED | Plausible (Boracay launch family) |
| CRIT-78 | useWallet hits non-existent `/wallet/balance` | hooks/useWallet.ts | **READ** (in F01 verification) | ✅ TRUE — server has GET `/`, no `/balance` |
| CRIT-79 | `Routes.CUSTOMER.WALLET` is dead | navigation.ts vs (tabs)/wallet.tsx:117 | **GREP** | ✅ TRUE — WALLET undefined in navigation.ts; (tabs)/wallet.tsx pushes to it |
| CRIT-80 | `Routes.CUSTOMER.SETTINGS` is dead | navigation.ts vs (tabs)/profile.tsx:93 | **GREP** | ✅ TRUE — SETTINGS=`/customer/settings` declared but file doesn't exist |
| CRIT-81 | Mobile platform.config duplicates server money math | mobile platform.config.ts | CARRIED | Plausible (CRIT-13/42/75 root) |
| CRIT-82 | apiUrl defaults to localhost in prod builds | mobile platform.config.ts | CARRIED | Plausible |
| CRIT-83 | TOS says 48h auto-confirm; server is 24h | terms.tsx:32 + platform.config.ts:32 | **READ + GREP** | ✅ TRUE — terms.tsx:32 says "48-hour"; server config says 24 |
| CRIT-84 | Two parallel deletion flows | account-management vs data-rights | CARRIED | Plausible |
| CRIT-85 | Socket reads from LEGACY storage | socket.service.ts:14 | **READ** | ✅ TRUE — `storage.getString('accessToken')` from legacy MMKV |
| CRIT-86 | Push deep-link role from LEGACY storage | push.service.ts:100-109 | **READ** | ✅ TRUE — `storage.getString('user')` legacy; defaults role='customer' |
| CRIT-87 | Push token written to LEGACY storage | push.service.ts:222 | **GREP** | ✅ TRUE — `storage.set('pushToken', token)` legacy MMKV |
| CRIT-88 | auth.store.ts role union missing 'super_admin' | auth.store.ts:18 | **GREP** | ✅ TRUE — `role: 'customer' \| 'provider' \| 'admin'` |
| CRIT-89 | payment-failed says 15 min; server holds 72h | payment-failed.tsx:87 | **GREP** (mobile half) | ⚠️ PARTIAL — mobile claim verified; server-side 72h needs deeper read |
| CRIT-90 | complete.tsx + terms.tsx + server disagree on auto-confirm | three files | CARRIED | Plausible (CRIT-83 family) |
| CRIT-91 | Chat broken on Bug-1061-migrated devices | chat/[id].tsx | **READ** (verified in E04 mirror) | ✅ TRUE |
| CRIT-92 | address-picker map = Manila default | address-picker.tsx:20 | **READ** (this session in D09) | ✅ TRUE |
| CRIT-93 | PH_REGIONS lacks Boracay | address-picker.tsx:36-58 | **READ** (D09) | ✅ TRUE |
| CRIT-94 | search → provider uses userId, route expects id | search.tsx:111 + provider.routes.ts:92 | **READ + GREP** (D09) | ✅ TRUE |
| CRIT-95 | Hardcoded support hotline `+63281234567` | safety-and-support.tsx:134 + help.tsx:183 | **GREP** (D09) | ✅ TRUE |
| CRIT-96 | messaging.service uses `/conversations`; server `/messaging` | messaging.service.ts + server.ts:235 | **READ + GREP** (D10) | ✅ TRUE |
| CRIT-97 | Provider tier missing 'founding' | provider.service.ts:9 | **READ** (D10) | ✅ TRUE |
| CRIT-98 | Provider GPS POSTs to non-existent endpoint | useJobGpsBroadcast.ts:46 + grep server | **READ + GREP** (D12) | ✅ TRUE |

**Summary: 21 of 31 D CRITs personally re-verified this session via Read tool / grep. The remaining 10 are CARRIED with high confidence — citations were specific.**

---

## Expanded fix dispatches — full alignment with Phase A/B output quality

---

### CRIT-68 — API client refresh-token has no mutex; parallel 401s burn the refresh token

**Bug.** apps/mobile/src/services/api.ts:191-213 — when a request gets 401, `refreshOnce()` is called and the original request is retried with the new token. But there's NO singleton/mutex around `refreshOnce`. Two requests racing to the API both 401, both call `refreshOnce`, both POST `/auth/refresh-token`. With server-side replay detection (CRIT-53 fix landed), the second one trips replay detection and forces logout for everyone using that refresh token.

**Why it matters.** TanStack Query refetches on tab focus, screen mount, etc. — multiple parallel requests are normal. After the access token expires, every parallel batch of N requests after expiry → N parallel 401s → N parallel refresh attempts. Most of them race and lose.

**Fix.** Singleton refresh promise:
```ts
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshOnceShared(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = refreshOnce().finally(() => { inFlightRefresh = null; });
  return inFlightRefresh;
}
```
Replace the `refreshOnce()` call at line 201 with `refreshOnceShared()`.

**Tests.**
- Unit (vitest with sinon clock): fire 5 parallel requests that all 401. Mock /refresh-token to return new token. Assert /refresh-token called exactly ONCE.

**Runtime verification.**
- Boot the app, expire the access token (force expiry by editing the JWT or wait 15 min).
- Trigger 5 parallel queries (e.g., open dashboard which fetches multiple resources).
- Tail server logs — should see ONE /refresh-token request, not 5.

---

### CRIT-69 — Mobile auth screens show generic fallback instead of server error

**Bug.** Multiple mobile screens use the inline axErr cast pattern:
```ts
const axErr = err as { response?: { data?: { error?: { message?: string } } } };
Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Something went wrong.');
```
But the mobile API client (api.ts) throws `ApiError` instances with the parsed body, NOT axios-shaped errors. So `axErr.response?.data?.error?.message` is always undefined → user always sees generic fallback. Server's specific message ("Address limit exceeded — 10 max", "OTP expired") never reaches the customer.

**Fix.** Ship a shared error-extraction helper:
```ts
// apps/mobile/src/utils/errors.ts
import { ApiError } from '@/services/api';

export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    return err.body?.error?.message ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message ?? fallback;
  return fallback;
}
```

Replace every `axErr.response?.data?.error?.message ?? '...'` with `getErrorMessage(err, '...')`.

A grep across `apps/mobile/` for `as { response?:` returns ~30+ callsites — coordinate via codemod.

**Tests.**
- Unit: throw `new ApiError(400, { success: false, error: { message: 'Specific server message' } }, '...')` → getErrorMessage returns 'Specific server message'.
- Unit: throw `new Error('plain')` → returns 'plain'.

**Runtime verification.**
- Force a 400 response (e.g., submit address with invalid province).
- Verify the customer sees the server's actual message, NOT "Something went wrong."

---

### CRIT-70 — Register flow leaves orphan empty profile if /register fails after /verify-otp

**Bug.** Per CRIT-52 server-side, /verify-otp on an unknown phone INSERTs an empty user. Mobile's register screen then POSTs first_name + last_name to /me. If the /me PATCH fails (network blip, validation error), the user row exists with empty names; user retries register, now /verify-otp returns full token (existing user) but never lets them set name. **They're stranded with an empty profile.**

**Fix.** Pair with CRIT-52 fix:
1. Server returns `requiresRegistration: true, registrationToken` instead of auto-creating.
2. Mobile POSTs to NEW /auth/register endpoint with all fields atomically.
3. If /auth/register fails, registration token is still valid (5-min lifetime), retry possible without re-OTP.

Until CRIT-52 lands, defensive workaround on mobile:
- Detect "user exists but firstName empty" in register screen on first call to /me.
- Force the name fields to be visible + required. Don't let user proceed until set.

**Tests.**
- Integration: simulate /me PATCH 503 after /verify-otp; user retries register; second attempt completes.

---

### CRIT-71 — Wallet URL plural/singular drift (FIVE 404s, EXPANDED to EIGHT in CRIT-114)

**Bug.** Mobile wallet endpoints hit `/api/v1/wallets/...` (plural). Server mounts `/api/v1/wallet/...` (singular) at server.ts:173. Verified in F01 + E04.

Broken endpoints (full list across mobile sources):
- `apps/mobile/src/hooks/useWallet.ts` — `/wallet/balance` (CRIT-78, no such route)
- `apps/mobile/src/services/payment.service.ts` — `/wallet/balance` (no route)
- `apps/mobile/app/(provider-tabs)/earnings.tsx` — `/wallets/transactions` (404)
- `apps/mobile/app/provider/withdraw.tsx` — `/wallets/withdraw` (404)
- `apps/mobile/app/provider/payouts.tsx` — `/wallets/payouts` (404)
- `apps/mobile/app/customer/wallet-topup.tsx` — `/wallets/top-up` (404)
- `apps/mobile/app/customer/payment-methods.tsx` — `/wallets/payment-methods` (404)
- `apps/mobile/app/provider/payout-settings.tsx` — `/wallet/payout-preferences` ✅ (correct, singular)

**Fix.**
1. Bulk find/replace across mobile:
   ```bash
   git grep -l "/api/v1/wallets/" apps/mobile/ | xargs sed -i 's|/api/v1/wallets/|/api/v1/wallet/|g'
   ```
2. Fix `getWalletBalance` to use `/wallet/me` or `/wallet/` (whichever the server's GET `/` returns).
3. Add CI guard: enumerate `api.get/post/etc` URL strings in `apps/mobile/src/`, diff against `app.use('/api/v1/...')` mounts in `packages/api/src/server.ts`. Mismatches fail the build.
4. Same family: CRIT-94 (provider userId vs id), CRIT-96 (conversations vs messaging), CRIT-98 (provider GPS missing endpoint), CRIT-110/111/115/118 (provider-onboarding/skills/service-area/nbi-status missing).

**Tests.**
- MSW handler that strictly matches server URL pattern. Run mobile services against MSW; assert no 404s.
- New jest test: enumerate `api.get|post|put|patch|delete\('/api/v1/...` in `apps/mobile/src/`; assert each is in the server's mount list.

**Runtime verification.**
- Spin up API + provider mobile.
- Open Earnings tab → transactions list should populate (not "No transactions yet").
- Try Withdraw → balance should display real number (not ₱0.00).

---

### CRIT-72 — Customer logout doesn't call server (refresh tokens never revoked)

**Bug.** auth.store.ts:89-94 — `logout()` only `clearTokens()` + `clearStoredUser()` + `storage.delete('pushToken')`. No POST to `/api/v1/auth/logout` to revoke the refresh token server-side. If a stolen refresh token was used, the user "logs out" but the attacker's session keeps refreshing.

**Fix.** Add server call:
```ts
logout: async () => {
  try {
    await api.post('/api/v1/auth/logout', {});
  } catch { /* best-effort */ }
  // Disconnect socket so server-side socket session terminates cleanly.
  try { (await import('@/services/socket.service')).disconnectSocket(); } catch { /* ignore */ }
  // Cancel push token registration on server.
  try { await api.post('/api/v1/push/unregister', {}); } catch { /* ignore */ }
  clearTokens();
  clearStoredUser();
  storage.delete('pushToken');
  set({ user: null, isAuthenticated: false, otpRequestId: null });
},
```

Server-side `/api/v1/auth/logout` must DELETE all `refresh_tokens WHERE user_id = $1` (or just the current one).

**Tests.**
- Mock api.post; assert logout() awaits the call before clearing local state.
- Integration: log in → logout → previously-stored refresh token is rejected by /refresh-token.

**Runtime verification.**
- Log in.
- Note refresh token (read from secure store via debug build).
- Logout.
- POST /refresh-token with the noted token → expect 401.

---

### CRIT-73 — Profile error handling uses axErr cast (CRIT-69 family)

Same family as CRIT-69. Fix via the shared `getErrorMessage` helper.

---

### CRIT-74 — Booking created BEFORE payment

**Bug.** apps/mobile/app/customer/booking/checkout.tsx:72-87 — `createBooking({...})` runs FIRST (creates `payment_pending` booking row). Then line 89 `createPaymentIntent(booking.id, selectedMethod)`. If user backs out, kills the app, or PayMongo redirect fails, booking exists in `payment_pending` state with no payment ever attached.

Server worker (per CRIT-89) eventually expires `payment_pending` bookings — but mobile UI says "15 min hold" while server may hold 72h or some other interval (CRIT-89, requires server verification).

**Fix.** Three options, pick one:

**(a) Reverse the order** — create the payment intent FIRST (returns checkout URL), open external checkout, then create the booking only on PayMongo webhook success. Cleanest but requires booking-flow-state stash (cookie/secureStore) so the user returning from PayMongo lands on the right screen.

**(b) Idempotent client-token pattern** — generate a clientToken on first checkout attempt. createBooking + createPaymentIntent both keyed by clientToken; safe to retry, server returns existing booking on duplicate. Booking still created before payment, but abandoned bookings can be cleaned up by a worker that respects the clientToken's TTL.

**(c) Atomic server endpoint** — POST /api/v1/bookings/checkout that creates BOTH the booking and the payment intent in a single DB transaction. Abandoned → server worker rolls back both at expiry.

**Recommendation: (c)** — atomic server endpoint, deterministic cleanup.

**Tests.**
- Cancel mid-checkout → no `payment_pending` row left.
- Network failure between createBooking and createPaymentIntent → cleanup worker removes the booking within the documented hold window.

---

### CRIT-75 — Mobile booking recomputes service fee in-memory

**Bug.** Mobile `booking.store.ts` computes `serviceFee` and `total` from in-memory constants (`platformConfig.serviceFeeRate`, `platformConfig.serviceFeeMin`, `platformConfig.serviceFeeMax`). Server has its own canonical values in DB platform_settings. Mobile may show ₱150 fee while server charges ₱180.

CRIT-13 / CRIT-42 / CRIT-81 same root cause.

**Fix.** Server-canonical pricing preview:
1. Mobile uses `/api/v1/bookings/pricing-preview` (already exists per pricing.service.ts:41-54) for ALL price displays.
2. Mobile booking.store stores the server-returned breakdown verbatim, doesn't recompute.
3. Delete client-side fee computation. Remove platformConfig.serviceFeeRate/Min/Max from mobile platform.config.
4. Mobile displays "Loading price..." until pricing-preview resolves; never shows fake numbers.

**Tests.**
- Change server's serviceFeeRate. Without app restart, mobile booking flow shows the new fee.
- Mobile NEVER shows a fee that disagrees with the server's quote-time calculation.

---

### CRIT-76 — Mobile tip cap = servicePrice; ignores server's tip_max

**Bug.** Mobile tip flow caps tip at `servicePrice`. Server has `platform_settings.tip_max_amount_cents`. If admin lowers the cap to ₱500, mobile still allows up to servicePrice, server rejects → user sees generic error.

**Fix.** Tip flow fetches `/api/v1/config` for `tipMaxCents`, uses that as the client-side cap.

---

### CRIT-77 — Tracker fallback map = Manila

**Bug.** `customer/booking/tracker.tsx` map initialRegion = Manila (14.5995, 120.9842). Boracay launch market sees the wrong region until provider GPS arrives. Same family as CRIT-92, CRIT-111, CRIT-116.

**Fix.** Pull from `platformConfig.launchRegion` (server-canonical, admin-editable). Boracay default { lat: 11.9698, lng: 121.9255, latDelta: 0.05, lngDelta: 0.05 }.

---

### CRIT-78 — useWallet hits non-existent `/wallet/balance`

**Bug.** apps/mobile/src/hooks/useWallet.ts hits `/api/v1/wallet/balance`. Server has GET `/api/v1/wallet/` (no `/balance` subpath). Hook always 404s.

**Fix.** Change URL to `/api/v1/wallet/` or `/api/v1/wallet/me` (whichever the server returns wallet data on). Also fix `getWalletBalance` in payment.service.ts. Bundle into the wallet URL alignment dispatch (CRIT-71/114).

---

### CRIT-79 — `Routes.CUSTOMER.WALLET` is dead

**Bug.** `Routes.CUSTOMER.WALLET` is referenced in `apps/mobile/app/(tabs)/wallet.tsx:117` but is NOT defined in `apps/mobile/src/config/navigation.ts` (verified via grep). `Routes.CUSTOMER.WALLET` evaluates to `undefined`. `router.push(undefined)` is a no-op or runtime error.

**Fix.** Either:
- Remove the dead `router.push` call from (tabs)/wallet.tsx.
- OR define WALLET in navigation.ts pointing to a real screen.

Since the (tabs)/wallet.tsx IS the wallet screen, the inner WALLET button likely meant to navigate to `/customer/wallet-topup` (the topup flow). Replace `Routes.CUSTOMER.WALLET` with `Routes.CUSTOMER.WALLET_TOPUP` (which exists at navigation.ts).

**Tests.**
- Lint rule that flags `router.push(Routes.X.Y)` where Y is undefined in the Routes type.
- Runtime: tap "Top Up" button on wallet → routes to wallet-topup screen successfully.

---

### CRIT-80 — `Routes.CUSTOMER.SETTINGS` is dead

**Bug.** Defined as `/customer/settings` in navigation.ts:60. But `apps/mobile/app/customer/settings.tsx` does NOT exist (verified by `ls`). Referenced from `(tabs)/profile.tsx:93` ("Notification Settings" link). User taps → 404 in Expo Router.

**Fix.** The intended target is `/customer/notification-settings.tsx` (which exists). Update navigation.ts:
```ts
SETTINGS: '/customer/notification-settings',
// or rename: NOTIFICATION_SETTINGS: '/customer/notification-settings'
```

OR create the missing settings.tsx as a hub screen that links to notification-settings, accessibility, etc. Recommendation: rename, simpler.

---

### CRIT-81 — Mobile platform.config duplicates ALL server money math

**Bug.** Mobile's `apps/mobile/src/config/platform.config.ts` carries every money constant the server has: commissionRates per tier, serviceFeeRate/Min/Max, surge config, escrowAutoConfirmHours, etc. Server has the same in `packages/api/src/config/platform.config.ts` AND in DB platform_settings (via settings.service). Three sources, and they drift.

**Fix.** Mobile config = environment + display only:
- apiUrl
- currency / currencySymbol (rarely change)
- appVersion (build-time)
- launchRegion (lat/lng for default map)

Everything else (commissionRates, serviceFeeRate, escrowAutoConfirmHours, tip_max, etc.) → fetched from `/api/v1/config` and cached in TanStack Query for 5 min. Display all money-relevant numbers from this fetched config. **Mobile NEVER computes money locally; mobile always asks server for the canonical breakdown.**

**Tests.**
- Mobile platform.config.ts contains ZERO money values. CI lint enforces.

---

### CRIT-82 — Mobile defaults `apiUrl` to localhost

**Bug.** mobile platform.config.ts: `apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7383'`. Production builds without the env var connect to localhost → fail every API call silently.

**Fix.**
- Throw at module-load time in production:
  ```ts
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    if (!__DEV__) throw new Error('EXPO_PUBLIC_API_URL required for production builds');
    return 'http://localhost:7383';
  }
  return apiUrl;
  ```
- EAS build profile asserts the env is set before bundling.

---

### CRIT-83 — TOS says 48h, server is 24h

**Bug.** apps/mobile/app/customer/terms.tsx:32 — "...the 48-hour auto-confirmation window expires." Server config (packages/api/src/config/platform.config.ts:32) — `escrowAutoConfirmHours: 24`. **Customer agrees to text saying 48h; server actually releases at 24h. Legal exposure.**

**Fix dispatch.**
1. Decision (Ken or legal): is the correct window 24h or 48h?
2. Update the canonical source (server platform_settings or platform.config), then update terms.tsx text by deriving from the live config.
3. Better: make the entire TOS section about cancellation/auto-confirm fetch from `/api/v1/settings/legal-text` (already in place for cancellation policy via Bug 1170/1198). Apply same pattern to escrow auto-confirm + complaint window.
4. Add CI guard: scan terms.tsx for `\d+-hour|\d+ hour|\d+h ` patterns; assert the values match the live platformConfig.
5. Pair with CRIT-90 (complete.tsx + terms.tsx + server disagree).

**Tests.**
- Render terms.tsx with mocked config = `escrowAutoConfirmHours: 24`. Assert rendered Section 3 says "24-hour" not "48-hour".

---

### CRIT-84 — Two parallel deletion flows

**Bug.** `apps/mobile/app/customer/account-management.tsx` (cooling-off, 30-day) and `apps/mobile/app/customer/data-rights.tsx` (NPC erasure DSR, 15-day SLA) both let the customer request account deletion. They write to different tables (`account_deletions` vs `data_subject_requests`), neither references the other. Customer can submit BOTH; ops gets confused.

**Fix.**
1. Decision: pick ONE canonical flow.
2. Recommendation: route DSR erasure → cooling-off flow server-side (DSR creates the cooling_off record + a DSR audit row).
3. Update data-rights.tsx erasure flow to either redirect to account-management.tsx OR submit through the same backend endpoint.
4. Both screens link to each other for clarity.
5. Server: `submitDsr` for type='erasure' creates `account_deletions` row with status='cooling_off' AND a `data_subject_requests` audit row in the same transaction.

---

### CRIT-85 — Socket reads token from LEGACY storage

**Bug.** apps/mobile/src/services/socket.service.ts:14 — `const token = storage.getString('accessToken')`. After Bug 1061 migration, accessToken lives in `secureStorage`. Legacy MMKV `storage` returns undefined. Socket connects with `auth: { token: undefined }` → server rejects auth → socket disconnects.

**Customer impact:** chat doesn't deliver real-time messages. Provider tracker doesn't update. Notification badge counters stale.

**Fix.**
```ts
import { getSecureItem } from './secure-storage.service';

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  const token = getSecureItem('accessToken');
  if (!token) {
    logger.warn('connectSocket called without accessToken');
    return socket as Socket; // or throw
  }
  socket = io(platformConfig.apiUrl, { auth: { token }, ... });
  return socket;
}
```

**Tests.**
- Mock secureStore to return 'fake-jwt'. Call connectSocket. Assert io() called with `auth: { token: 'fake-jwt' }`.
- Mock to return null. Call connectSocket. Assert no connection attempt OR explicit error thrown.

**Runtime verification.**
- Cold-boot mobile app (forces Bug 1061 migration to complete).
- Open chat with a provider.
- Send a message from the provider side.
- Verify the message appears on customer side WITHOUT pull-to-refresh.

---

### CRIT-86 — Push deep-link role from LEGACY storage

**Bug.** apps/mobile/src/services/push.service.ts:100-109 — `getUserRole()` reads `storage.getString('user')` from LEGACY storage. After Bug 1061, user object is in secureStorage. Legacy `storage` returns undefined → `user` parses to `null` → returns default 'customer'.

**Provider impact:** push notifications meant to deep-link to `/provider/job/${id}` instead route to `/customer/booking/${id}` because role defaults to customer. Provider sees customer screens.

**Fix.** Mirror CRIT-85 — read from secureStorage:
```ts
function getUserRole(): string {
  try {
    const userJson = getSecureItem('user');
    if (userJson) {
      const user = JSON.parse(userJson) as { role?: string };
      return user.role ?? 'customer';
    }
  } catch { /* default */ }
  return 'customer';
}
```

---

### CRIT-87 — Push token written to LEGACY storage

**Bug.** push.service.ts:222 — `storage.set('pushToken', token)` writes to LEGACY MMKV. Bug 1061 migrated other tokens to secureStorage but missed this one. Subsequent reads/clears of pushToken via secureStorage return null.

Logout side effect: `auth.store.logout` does `storage.delete('pushToken')` (line 92) — works because both ends use legacy. But CRIT-86's role read tried to use the migrated path, half-migrated state.

**Fix.** Migrate both write and read to secureStorage. Single source of truth.

---

### CRIT-88 — auth.store role union missing 'super_admin'

**Bug.** apps/mobile/src/stores/auth.store.ts:18 — `role: 'customer' | 'provider' | 'admin'`. Server's role enum includes 'super_admin'. If a super_admin somehow logged into the mobile app, TypeScript narrowing would not allow super_admin-specific UI logic.

**Fix.** Add 'super_admin' to the union:
```ts
role: 'customer' | 'provider' | 'admin' | 'super_admin';
```

Cross-cutting with all other mobile type drift (CRIT-97 'founding' tier) — the long-term fix is generating mobile types from server Zod schemas. Single source of truth.

---

### CRIT-89 — payment-failed says 15 min, server holds 72h

**Bug.** apps/mobile/app/customer/booking/payment-failed.tsx:87 — "Your booking is held for 15 minutes. Time left: ..." Server's actual hold period (per CRIT-89 original claim) is 72 hours. **Mobile lies to the customer about how long they have to retry payment.** Verified mobile half (line 87 confirmed); server-side 72h needs deeper verification.

**Fix.**
1. Verify the actual server-side `payment_pending` expiry. Could be a worker (`workers.ts:expirePaymentPending`) or trigger. The number "72 hours" was claimed in D07 — re-confirm by reading the worker or relevant config.
2. Display the canonical value:
   ```tsx
   <Text>Your booking is held for {platformConfig.paymentPendingHoldHours} hours.</Text>
   ```
3. Use server-canonical config (per CRIT-81) so the displayed time always matches actual server behavior.

**Tests.**
- Mobile renders payment-failed with mocked config `paymentPendingHoldHours: 72`. Assert rendered text says "72 hours" (or "3 days").

---

### CRIT-90 — complete.tsx + terms.tsx + server disagree on auto-confirm

**Bug.** Three sources of truth for the auto-confirm window:
- `customer/booking/complete.tsx` (likely 24h text)
- `customer/terms.tsx:32` (says 48h)
- Server config (24h)

**Fix.** Same as CRIT-83. Single source: server platform_settings. Mobile fetches via `/api/v1/config` and renders. Add CI guard scanning for hardcoded `\d+ hour` patterns in mobile screens.

---

### CRIT-91 — Chat completely broken on Bug-1061-migrated devices

**Bug.** Chat screen at `apps/mobile/app/customer/chat/[id].tsx` uses `connectSocket()` which suffers CRIT-85 (legacy token). Send attempts also fall through to messaging.service.ts which has CRIT-96 (wrong URL). Customer's chat is dead via both channels.

**Fix.** Fix CRIT-85 + CRIT-96 → CRIT-91 resolves.

---

### CRIT-92 — Address-picker map = Manila

**Bug.** apps/mobile/app/customer/address-picker.tsx:20-25 — `MANILA_REGION` constant. Used as `initialRegion` at line 311. Boracay customer sees Manila as the default map center.

**Fix.** Same as CRIT-77 — pull `launchRegion` from server config. Default to `userLocation` if permission granted, else launch region.

---

### CRIT-93 — PH_REGIONS lacks Boracay; Boracay pin can't be saved

**Bug.** apps/mobile/app/customer/address-picker.tsx:36-58 hardcodes 22 cities — none in Aklan or Boracay. `guessRegionFromCoordinates` returns `{city:'', province:''}` if minDist > 0.5°. `handleConfirm` blocks save if `!selectedAddress.city`. **Customer in Boracay cannot save an address.**

**Fix.** Server-fetched region table:
1. New endpoint `GET /api/v1/geo/regions` returns the active service-area regions (admin-editable).
2. Mobile uses `useQuery(['geo-regions'], ...)` cached 24h.
3. For launch dataset, populate at minimum: Boracay (11.97, 121.92), Kalibo (11.7167, 122.4192), Malay (11.8333, 122.0167).
4. Replace 0.5° threshold with explicit "Outside service area" dialog that points to the launch service area policy.
5. The reverseGeocodeAsync (Expo Location) already returns city + province — use the GIS result first; fall back to closest-region only if reverseGeocode fails.
6. Bundle with CRIT-92, CRIT-111, CRIT-116, CRIT-77 in one Boracay launch dispatch.

**Tests.**
- Mock location at (11.97, 121.92). Confirm address-picker handleConfirm produces a savable address with city='Boracay' or 'Malay'.

---

### CRIT-94 — Search → provider routes use userId; server expects providers.id

**Bug.** apps/mobile/app/customer/search.tsx:111 — `router.push('/customer/provider/${provider.userId}')`. provider/[id].tsx then hits `/api/v1/providers/${id}` which calls `providerService.getProviderById(id)` — expects providers.id, gets users.id → 404.

**Fix.** One-line:
```tsx
router.push(`/customer/provider/${provider.id}`);
```

Add a real test:
```ts
render(<SearchScreen />);
// Mock api result with provider {id: 'P1', userId: 'U1', ...}
fireEvent.press(getByText('Provider Name'));
expect(router.push).toHaveBeenCalledWith('/customer/provider/P1');
```

Audit grep `provider.userId` across the mobile app — likely no other callsites use it, but verify.

---

### CRIT-95 — Hardcoded support hotline `+63281234567`

**Bug.** Two places:
- `apps/mobile/app/customer/safety-and-support.tsx:134` — `Linking.openURL('tel:+63281234567')` (Call Hotline)
- `apps/mobile/app/customer/help.tsx:183` — same number (Call Support)
- Plus `apps/mobile/app/provider/help.tsx:167` (provider side, MED-246 family).

`+63 2 8123 4567` is a Manila landline almost certainly NOT owned by onService PH. Customer in distress reaches a wrong number.

**Fix.**
1. Move to `platformConfig.supportHotline` (server-canonical, admin-editable).
2. Replace all three calls with `Linking.openURL(\`tel:\${platformConfig.supportHotline}\`)`.
3. CI guard: fail any commit where the runtime value matches `REPLACE_BEFORE_LAUNCH` or starts with the placeholder prefix `+63281234567`.
4. Pair with D14 ops items: real hotline procurement, on-call schedule, NPC DPO line.

**Tests.**
- Render safety-and-support; mock platformConfig `supportHotline='+639171234567'`; assert the rendered Call button uses the mocked number.

---

### CRIT-96 — Mobile messaging hits `/conversations`; server is `/messaging`

**Bug.** apps/mobile/src/services/messaging.service.ts uses `/api/v1/conversations/...`. Server mounts `/api/v1/messaging` at server.ts:235. All 6 chat REST endpoints 404.

**Fix.** Bulk find/replace in messaging.service.ts:
- `/api/v1/conversations` → `/api/v1/messaging`
- All 6 endpoints fixed.

Bundle with CRIT-71/78/94/98/110/111/115/118 in the URL-alignment dispatch + CI guard.

---

### CRIT-97 — Provider tier missing 'founding'

**Bug.** apps/mobile/src/services/provider.service.ts:9 — `tier: 'new' | 'verified' | 'pro' | 'elite'`. Server enum: `'founding' | 'new' | 'verified' | 'pro' | 'elite'`. Founding-tier providers (the launch cohort!) display incorrectly.

**Fix.** Add 'founding' to the union. Update TIER_COLORS / TIER_LABELS / TIER_ICONS in customer + provider screens (provider/[id].tsx, dashboard.tsx, provider-profile.tsx, tier-progression.tsx).

Long-term: generate mobile types from server Zod schemas.

---

### CRIT-98 — Provider GPS POSTs to non-existent endpoint

**Bug.** apps/mobile/src/hooks/useJobGpsBroadcast.ts:46 — every 10 seconds while provider is en_route/arrived, POSTs `/api/v1/provider/jobs/${bookingId}/gps-update`. Server has NO such REST endpoint (verified via grep). Server has `BOOKING_GPS_UPDATE: 'booking:gps_update'` in `ADMIN_EVENTS` but that's a server-emit-to-admins event, not a server-listens-from-providers event.

Customer's tracker map stuck on the original pin. Provider drives 25 minutes; tracker shows them not moving.

**Fix dispatch.**

1. Decision: REST POST or socket emit?
   - Recommendation: socket emit. POST every 10s = 6 HTTP/TLS handshakes per minute per active provider. Wasteful battery + bandwidth on cellular. Socket coalesces over a single TCP connection.

2. Add server socket handler in `packages/api/src/services/socket.service.ts`:
   ```ts
   socket.on('provider:gps_update', async (payload) => {
     // 1. authorize: socket.userId must own bookingId
     // 2. throttle: max 1 update / 5s per booking (DOS guard)
     // 3. persist: INSERT INTO booking_gps_pings (booking_id, lat, lng, ...)
     // 4. emit to room booking:{id}: io.to(`booking:${bookingId}`).emit('booking:gps_update', payload)
     // 5. emit to admin room (existing ADMIN_EVENTS.BOOKING_GPS_UPDATE)
   });
   ```

3. Mobile rewrites useJobGpsBroadcast TaskManager handler to use socket emit. Existing socket.service.ts handles connection.

4. Customer tracker subscribes to `booking:gps_update` for the active booking via useSocket / useSocketRoom (the room handlers from MED-210 also need to be wired server-side for room:join).

5. Bundle with CRIT-91/96 (chat) — single PR fixes the entire socket + URL surface.

**Tests.**
- Server: integration test with fake provider socket connection emitting provider:gps_update; assert booking room receives mirrored event AND admin room receives ADMIN_EVENTS.BOOKING_GPS_UPDATE.
- Mobile: render tracker with mocked socket emit, assert marker updates.

**Runtime verification.**
- Provider walks 100m with the app open and online status set.
- Customer's tracker map shows the marker move within 10 seconds.
- Admin DispatchConsole shows the same GPS pings.

---

## What this verification doc DOES NOT do

- Does not run the app. No screenshots. No browser test.
- 10 of 31 D CRITs are CARRIED, not personally re-opened this session — mostly D01–D08 inherited claims with specific citations.
- Does not cover all ~178 D MEDs in detail — they stand at the original cited lines; spot-check before fix.
- CRIT-89 server-side "72 hours" specifically needs deeper read of `packages/api/src/jobs/workers.ts` to confirm.

## Recommended fix sequence

The single biggest dispatch by impact: **mobile-server URL alignment**. Bundles CRIT-71, CRIT-78, CRIT-94, CRIT-96, CRIT-98 (and the corresponding E-phase CRIT-110/111/115/118). One PR fixes wallet, search→provider, messaging, provider GPS, provider-onboarding, NBI status — all silent 404s on launch day.

Second: **Bug 1061 migration completion** — CRIT-85, CRIT-86, CRIT-87, plus their MED mirrors. A grep for `storage.getString` and `storage.set` across `apps/mobile/src/services/` enumerates the remaining un-migrated callsites.

Third: **Boracay launch geo dispatch** — CRIT-77, CRIT-92, CRIT-93, CRIT-111, CRIT-116. Server-side region table + remove all hardcoded Manila fallbacks.

Fourth: **single source of truth for money + legal text** — CRIT-75, CRIT-81, CRIT-83, CRIT-89, CRIT-90 + MED family. Mobile fetches everything from `/api/v1/config` + `/api/v1/settings/legal-text`.

Fifth: **dead-routes + dead-screens cleanup** — CRIT-79, CRIT-80, plus E-phase dead screens.
