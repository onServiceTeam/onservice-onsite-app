# Phase D Findings Part 6 — Mobile Stores + Shared Services

Files added in this batch:
- `apps/mobile/src/stores/auth.store.ts` (100)
- `apps/mobile/src/stores/booking.store.ts` (154)
- `apps/mobile/src/stores/pricing.store.ts` (115)
- `apps/mobile/src/services/auth-migration.ts` (90)
- `apps/mobile/src/services/config.service.ts` (99)
- `apps/mobile/src/services/socket.service.ts` (51)
- `apps/mobile/src/services/push.service.ts` (235)

**Phase D running total: ~8,911 lines fully read.**
**Audit grand total: ~28,585 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-84)

### CRIT-85 — Socket connection reads token from LEGACY storage; broken after Bug 1061 migration
**File:** [apps/mobile/src/services/socket.service.ts:14](apps/mobile/src/services/socket.service.ts#L14)
```ts
export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  const token = storage.getString('accessToken');  // ← legacy unencrypted MMKV
  socket = io(platformConfig.apiUrl, {
    auth: { token },
    ...
  });
  return socket;
}
```

Tokens were moved from the legacy `storage` (unencrypted MMKV id `'onservice-auth'`) to the new `secure-storage` (encrypted MMKV id `'onservice-auth-secure'`) per Bug 1061 fix. The auth-migration.ts script (verified line 50-58) MIGRATES then DELETES the legacy `accessToken` after first boot.

After the migration runs:
- `storage.getString('accessToken')` returns `undefined`.
- Socket connects with `auth: { token: undefined }`.
- Server's socket-service rejects unauthenticated connections (or treats as anonymous, depending on socket-server middleware).

**Effective consequences:**
- Real-time booking tracker (D03 / tracker.tsx:54-71) socket events never fire.
- Chat (`/customer/chat/[id]`) — typing indicators, real-time messages — broken.
- Provider live job updates — broken.

This is a Bug 1061 fix that didn't get propagated to socket.service.ts.

**Fix dispatch:**
```
1. In socket.service.ts, replace:
   import { storage } from './api';
   const token = storage.getString('accessToken');
   With:
   import { getAccessToken } from './secure-storage';
   const token = getAccessToken();
2. Verify socket reconnect on token refresh — when api.ts:refreshOnce stores new tokens, the open socket's auth is stale. Need to:
   - On 401-from-socket, force socket reconnect.
   - OR: socket-service exposes a refreshAuth() method called from api.ts after every successful refresh.
3. Test: log in → verify socket connects → simulate token migration → verify socket still works (because new fix uses secure-storage).
```

### CRIT-86 — Push notification deep links read role from LEGACY storage; providers always routed as customers
**File:** [apps/mobile/src/services/push.service.ts:100-109](apps/mobile/src/services/push.service.ts#L100)
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

Same Bug 1061 propagation gap as CRIT-85. After auth-migration deletes `'user'` from legacy storage, `storage.getString('user')` returns `undefined` → catch falls through → returns `'customer'` default.

The deep-link resolver (line 113-178) uses this role for almost every notification type:
- `new_message` notification: provider should go to `/provider/chat/${id}`. With buggy role lookup, goes to `/customer/chat/${id}` → wrong screen.
- `provider_assigned`, `booking_confirmed`, `auto_confirmed`: same — provider goes to customer screens.
- `payment_released`: provider should go to `/(provider-tabs)/earnings`. Routes to `/(tabs)/wallet` (customer wallet).
- `dispute_update`: provider goes to `/customer/booking/${id}` instead of `/provider/job/${id}`.

**Effective consequences:**
- Every push notification on a provider device opens the WRONG screen.
- Provider experience is completely broken from notifications.
- Customer experience: works (default = customer = correct).

**Fix dispatch:**
```
1. In push.service.ts:100-109, replace:
   const userJson = storage.getString('user');
   With:
   import { getStoredUser } from './secure-storage';
   const userJson = getStoredUser();
2. Better: read role from useAuthStore.getState().user?.role (which hydrates from secure-storage at boot).
3. Test:
   - Log in as provider, send a push notification of each type, verify deep links route to /provider/* paths.
   - Log in as customer, verify links route to /customer/* and /(tabs)/* paths.
```

### CRIT-87 — Push token saved in storage; ALSO migrated to secure store but `storage.set('pushToken')` writes to legacy
**File:** [apps/mobile/src/services/push.service.ts:222](apps/mobile/src/services/push.service.ts#L222) + [auth-migration.ts:31](apps/mobile/src/services/auth-migration.ts#L31)
```ts
storage.set('pushToken', token);   // push.service.ts — writes to legacy
```
Push token isn't sensitive PII, so writing to legacy storage is OK. **But** auth-migration.ts only migrates `['accessToken', 'refreshToken', 'user']` — not `pushToken`. So pushToken correctly stays in legacy storage.

Then auth.store.ts:logout (line 92) calls `storage.delete('pushToken')` to clear push token on logout. **Inconsistent storage — pushToken lives in legacy storage, while tokens live in secure storage.**

This isn't a CRITICAL on its own — but combined with the broken role-lookup (CRIT-86), demonstrates that the Bug 1061 migration was incomplete. Not all "use legacy storage" sites were audited and migrated.

**Fix dispatch:**
```
1. Audit ALL `storage.getString(...)` and `storage.set(...)` callsites in apps/mobile/src/. Decide for each: is this PII/sensitive (move to secure-storage) or not (acceptable in legacy)?
2. Add ESLint rule that flags `storage.getString('user')`, `storage.getString('accessToken')`, `storage.getString('refreshToken')` as deprecated — must use secure-storage helpers.
3. Confirmed broken sites (this audit):
   - socket.service.ts:14 → CRIT-85
   - push.service.ts:102 → CRIT-86
4. Other sites to grep + verify in next session.
```

### CRIT-88 — Mobile auth.store.ts type omits 'super_admin' role
**File:** [apps/mobile/src/stores/auth.store.ts:18](apps/mobile/src/stores/auth.store.ts#L18)
```ts
role: 'customer' | 'provider' | 'admin';
```
Server's user roles (auth.middleware.ts:8): `'customer' | 'provider' | 'admin' | 'super_admin'`.

If a super_admin downloads the customer/provider mobile app (rare but possible during ops debugging), the auth flow:
1. POST /verify-otp → server returns user with `role: 'super_admin'`.
2. Mobile parses, type-checks fail at runtime (or silently casts).
3. Splash screen routing (index.tsx:21) — `if (user?.role === 'provider')` → false, defaults to customer tab.
4. UI gates that check `user.role === 'admin'` (none in mobile) — never satisfied.

Probably not a customer-facing issue (super_admins use admin web), but the type drift is a code smell. Either:
- Reject super_admin login on mobile (server-side guard).
- Update mobile type to include super_admin and route to a "Use admin web" screen.

---

## MEDIUM bugs

### MED-155 — booking.store.ts uses platformConfig directly for fee math (CRIT-75 confirmed)
**File:** [apps/mobile/src/stores/booking.store.ts:73-76](apps/mobile/src/stores/booking.store.ts#L73)
```ts
function computeFee(price: number): number {
  const fee = Math.round(price * platformConfig.serviceFeeRate);
  return Math.max(platformConfig.minimumServiceFee, Math.min(platformConfig.maximumServiceFee, fee));
}
```
Confirms CRIT-75 (D03) at the data-layer. Even though `config.service.ts` exists to fetch server-canonical config, the booking store doesn't use it. **Architectural gap.** Once CRIT-75 fix lands (fetch /pricing-preview), this `computeFee` should be deleted entirely.

### MED-156 — pricing.store.ts shared loading/error state across 5 fetchers (race conditions)
**File:** [apps/mobile/src/stores/pricing.store.ts:35-36](apps/mobile/src/stores/pricing.store.ts#L35)
Single `isLoading` + `error` state shared by all 5 fetcher actions (pricing preview, holidays, rebooking, history, slot waitlist). If two fetchers fire concurrently:
- First sets isLoading=true.
- First completes successfully, sets isLoading=false.
- Second was concurrent, completes, ALSO sets isLoading=false.
- If first fails AFTER second succeeds, error state from first stale-overwrites second's success state.

**Fix:** per-action loading/error state. Consider using TanStack Query (already in the project) instead of Zustand for these read operations.

### MED-157 — config.service.ts fetches but never re-fetches on app foreground / token refresh
**File:** [apps/mobile/src/services/config.service.ts:48-83](apps/mobile/src/services/config.service.ts#L48)
Called once at boot (per `_layout.tsx`). If admin tunes settings while customer's app is open, customer sees stale config until app restart. Should re-fetch on:
- App foreground (AppState change → 'active').
- After successful login (config might be user-tier-dependent).
- On a 5-min interval (background).

Combined with CRIT-75, this means even when /pricing-preview integration lands, the OTHER config consumers (currency, otp settings, escrow window display) stay stale.

### MED-158 — Socket reconnection has no auth refresh
**File:** [apps/mobile/src/services/socket.service.ts:11-24](apps/mobile/src/services/socket.service.ts#L11)
`reconnection: true, reconnectionAttempts: 10`. Socket reconnects on disconnect, but uses the SAME (potentially expired) token. If the access token expires while socket is reconnecting, all 10 attempts fail with auth errors. User gets no real-time updates.

**Fix:** wrap socket auth in a function that returns the current token at connect time:
```ts
socket = io(platformConfig.apiUrl, {
  auth: (cb) => cb({ token: getAccessToken() }),
  ...
});
```

### MED-159 — push.service.ts dynamic require of expo-notifications swallows errors silently
**File:** [apps/mobile/src/services/push.service.ts:35-44](apps/mobile/src/services/push.service.ts#L35)
```ts
try {
  Notifications = require('expo-notifications') as PushNotificationsModule;
  Device = require('expo-device') as DeviceModule;
  ...
} catch {
  // Packages not installed — push will be unavailable
}
```
If expo-notifications is included in package.json (it is, per Expo Router app), this should never fail. The defensive catch makes the code robust to test environments but hides real misconfiguration in production. Add at least a `console.warn`/`logger` invocation.

### MED-160 — push.service deep-link resolver doesn't handle every notification type the server can send
**File:** [apps/mobile/src/services/push.service.ts:113-178](apps/mobile/src/services/push.service.ts#L113)
Switch statement covers ~12 notification types. Server's notification.service (read in B05 area) likely sends more (tier_upgrade, suki, payment, referral, etc.). For unhandled types, falls through to `bookingId ? booking detail : null`. Notifications with no bookingId (e.g., tier upgrade, referral bonus) get NO deep link — tapping does nothing.

### MED-161 — auth.store.ts register() relies on token from previous step
**File:** [apps/mobile/src/stores/auth.store.ts:80-87](apps/mobile/src/stores/auth.store.ts#L80)
```ts
register: async (_phone: string, firstName: string, lastName: string) => {
  const token = getAccessToken();
  if (!token) throw new Error('Must verify OTP before completing registration.');
  const res = await api.patch('/api/v1/auth/me', { firstName, lastName });
  ...
}
```
Confirms CRIT-70 (D01) — register depends on prior verifyOtp having completed. If verifyOtp succeeded but token storage somehow failed (very unlikely), register throws confusing message.

### MED-162 — auth-migration.ts marks complete even if migration partially failed
**File:** [apps/mobile/src/services/auth-migration.ts:74-77](apps/mobile/src/services/auth-migration.ts#L74)
```ts
// Mark migration complete. Even if no keys were migrated (clean
// install or already-cleared session), set the flag so future boots
// skip this work.
setSecureItem(MIGRATION_FLAG_KEY, 'true');
```
If the for-loop encountered failures (line 64-69 caught + recorded), the migration is marked complete anyway. Subsequent boots skip and don't retry the failed keys.

For the case where ALL keys failed (unlikely but possible): user is logged out (no tokens copied to secure store, but flag is set). They re-login fresh — works.

For PARTIAL failure: e.g., accessToken migrated, refreshToken failed → user has access token but no refresh → first 401 forces re-login. Acceptable.

But the `result.failures` array is returned to the caller (_layout.tsx:65-68) and SWALLOWED — captured to Sentry but no UI surface. Consider showing a "Please re-login" prompt if failures.length > 0.

### MED-163 — config.service merge omits cancellation policy + branding
**File:** [apps/mobile/src/services/config.service.ts:22-78](apps/mobile/src/services/config.service.ts#L22)
Server's getClientConfig (verified in B05) returns `featureFlags`, `branding`, `escrowAutoConfirmHours`, etc. Mobile's RemoteConfigResponse interface only declares ~14 fields, omitting `featureFlags`, `branding`, and `cancellationPolicy` shape. These get dropped silently — not merged into cachedConfig.

Customer mobile UI never sees feature flags (D13/Bug 44+45 work) or branding (Bug 1324 work) even if server has them.

---

## LOW / INFO

- **auth-migration.ts is well-documented.** Idempotent flag, clear error reporting. Bug 1061 component done correctly.
- **config.service.ts has a 5s timeout on /config fetch.** Good defensive default.
- **socket.service.ts is minimal/clean.** The CRIT-85 fix is a one-liner.
- **push.service.ts deep-link resolver covers most key notification types.** Comprehensive switch — just needs role-lookup fix (CRIT-86) and a few missing types (MED-160).
- **booking.store.ts setSubcategory resets dependent fields** (line 110-119) — clean state reset on subcategory change.
- **auth.store has no `setPhone` or `setEmail` mutators** — values only set via verifyOtp/register/setUser. Single-write pattern.

---

## What's left in Phase D

- Smaller booking-flow screens (5 files, ~1,058 lines)
- Other customer screens (provider/[id], addresses, chat, search, suki, recurring, etc.) (~3,000 lines)
- Mobile shared services remaining (recurring, booking-photo, catalog, review, tip, plus pricing/rebooking/slot-waitlist services that pricing.store consumes) (~700 lines)
- Mobile components (PhoneInput, Avatar, FilterChips, FilterModal, ConfirmModal, OTPInput, etc.) (~2,500 lines)

Continuing.
