# Phase D Findings Part 12 — Hooks + utils + lib (Phase D close)

Files added in this batch (full reads):

**Hooks:**
- `apps/mobile/src/hooks/useImagePicker.ts` (198)
- `apps/mobile/src/hooks/useJobGpsBroadcast.ts` (119)
- `apps/mobile/src/hooks/useSocket.ts` (64)
- `apps/mobile/src/hooks/useSocketRoom.ts` (53)
- `apps/mobile/src/hooks/useStatusMutation.ts` (56)
- `apps/mobile/src/hooks/useAccessibility.ts` (40)
- `apps/mobile/src/hooks/useAppState.ts` (56)
- `apps/mobile/src/hooks/useAuth.ts` (47)
- `apps/mobile/src/hooks/useBooking.ts` (44)
- `apps/mobile/src/hooks/useDebouncedValue.ts` (22)
- `apps/mobile/src/hooks/useFeatureFlags.ts` (42)
- `apps/mobile/src/hooks/useLocation.ts` (90)
- `apps/mobile/src/hooks/useOffline.ts` (48)
- `apps/mobile/src/hooks/useWallet.ts` (86) — re-confirmed CRIT-78 family

**Utils:**
- `apps/mobile/src/utils/address.ts` (35)
- `apps/mobile/src/utils/cancellation-policy.ts` (70)
- `apps/mobile/src/utils/currency.ts` (29)
- `apps/mobile/src/utils/date.ts` (68)
- `apps/mobile/src/utils/distance.ts` (17)
- `apps/mobile/src/utils/haptics.ts` (53)
- `apps/mobile/src/utils/phone.ts` (38)
- `apps/mobile/src/utils/validation.ts` (26)

**Lib:**
- `apps/mobile/src/lib/i18n.ts` (88)
- `apps/mobile/src/lib/logger.ts` (68)

Plus targeted Grep verifications:
- `BOOKING_GPS_UPDATE` on server (admin-emit only — no provider-ingest endpoint exists)
- `room:join` / `room:leave` on server (NOT handled — only `join:conversation` etc. handled)
- `useSocketRoom` callers (NONE — dead hook)
- `/api/v1/config` server response shape (returns `{success, data: {...}}` — useFeatureFlags reads wrong layer)

**Phase D running total: ~18,979 lines fully read.**
**Audit grand total: ~38,653 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-97)

### CRIT-98 — Provider GPS broadcasts go to a NON-EXISTENT REST endpoint; customer tracker never updates
**Files:**
- [apps/mobile/src/hooks/useJobGpsBroadcast.ts:46-53](apps/mobile/src/hooks/useJobGpsBroadcast.ts#L46) — POSTs to `/api/v1/provider/jobs/${bookingId}/gps-update`
- [packages/api/src/services/socket.service.ts:206](packages/api/src/services/socket.service.ts#L206) — `BOOKING_GPS_UPDATE: 'booking:gps_update'` is in `ADMIN_EVENTS` (server EMITS to admins; no listener for provider GPS in)
- Server has NO REST endpoint matching `/provider/jobs/:id/gps-update`. Verified: `grep gps-update packages/api/src/routes/` → 0 results.

```ts
// useJobGpsBroadcast.ts:46-53 (per-10-second background callback while
// provider is provider_en_route or provider_arrived):
await api.post(`/api/v1/provider/jobs/${bookingId}/gps-update`, {
  lat: last.coords.latitude,
  lng: last.coords.longitude,
  accuracy: last.coords.accuracy,
  speed: last.coords.speed,
  heading: last.coords.heading,
  timestamp: last.timestamp,
});
```

**Customer experience:**
- Customer is on the `/customer/booking/tracker` screen waiting for the provider.
- Provider has location-sharing on; their device dutifully captures GPS every 10s.
- Provider's POST 404s every time. Battery drained, no data sent.
- Customer's tracker map shows the provider stuck at the originally-broadcast pin (the address they entered for the booking, NOT the provider's actual location).
- Provider arrives in 25 minutes. Customer's tracker shows them not moving for the entire trip.
- Customer assumes the provider is a no-show, tries to call/chat — chat is also broken (CRIT-91/96), call button doesn't exist (MED-183). Books another provider. Now two providers show up.

This is launch-blocking. Live tracking is one of the headline features.

**Root cause:** Phase 14 D12 implemented the *provider-side* GPS lifecycle (the hook + the TaskManager + the foreground service notification), and Phase 14 D11 added the *admin-side* socket emit (server pushes GPS updates to admins for fleet visibility). But nobody wired the **server-side ingest endpoint** that converts the provider's GPS posts into a server-emitted socket event for the customer's tracker. The hook was tested in isolation; integration with server was assumed.

**Fix dispatch:**
```
1. Decision: REST POST or socket emit for provider GPS?
   - Recommendation: socket emit. POST every 10s adds 6 HTTP/TLS handshakes
     per minute per active provider — wasteful battery + bandwidth on a
     mobile cellular link. Socket.io coalesces over a single TCP connection.
2. Add server socket handler:
   socket.on('provider:gps_update', async (payload) => {
     // 1. authorise: verify socket.userId is the provider for payload.bookingId
     // 2. throttle: max 1 update / 5s per booking (DOS guard)
     // 3. persist: INSERT INTO booking_gps_pings (booking_id, lat, lng, ...)
     // 4. emit to room booking:{id}:
     //      io.to(`booking:${bookingId}`).emit('booking:gps_update', payload)
     // 5. emit to admin room (existing ADMIN_EVENTS.BOOKING_GPS_UPDATE)
   });
3. Mobile: rewrite useJobGpsBroadcast TaskManager handler to use the
   socket. The socket service already exists (services/socket.service.ts);
   import its emit helper.
4. Customer tracker screen: subscribe to `booking:gps_update` for the
   active booking via useSocket / useSocketRoom. Update marker on each
   payload.
5. Tests:
   - Server: integration test that posts a fake provider socket connection,
     emits provider:gps_update, asserts the booking room receives the
     mirrored event AND the admin room receives ADMIN_EVENTS.BOOKING_GPS_UPDATE.
   - Mobile: render tracker, simulate socket emit, assert the marker
     position updates.
6. Also fix CRIT-91 / CRIT-96 in the same dispatch since they're all socket
   path issues. The launch needs ONE PR that lands chat REST routes,
   socket auth migration, and the GPS path together.
7. Add a CI guard: enumerate all api.post calls under apps/mobile/, verify
   each URL has a matching server route (via the URL-alignment guard
   recommended in CRIT-96 fix). This catches the pattern across the codebase.
```

---

## MEDIUM bugs

### MED-208 — useImagePicker leaves orphaned S3 objects when user removes an already-uploaded photo
**File:** [apps/mobile/src/hooks/useImagePicker.ts:141-144](apps/mobile/src/hooks/useImagePicker.ts#L141)
```ts
const removeImage = useCallback((index: number) => {
  setLocalUris((prev) => prev.filter((_, i) => i !== index));
  setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
}, []);
```

If user uploads photo A → S3 keeps it. User taps remove on A → local state forgets it but the S3 object stays. Over time, abandoned uploads accumulate and cost money + complicate user data exports (NPC right of access). 

Should call `DELETE /api/v1/uploads/${uploadedFile.id}` for the corresponding entry when removing an uploaded file, OR rely on a server-side cleanup worker that prunes uploads not referenced by a booking after 24h.

### MED-209 — useFeatureFlags reads the wrong response layer; all flags always default to OFF
**File:** [apps/mobile/src/hooks/useFeatureFlags.ts:30-39](apps/mobile/src/hooks/useFeatureFlags.ts#L30)
```ts
const { data } = useQuery<ClientConfigResponse['data']>({
  queryKey: ['client-config'],
  queryFn: async () => {
    const res = await api.get<ClientConfigResponse['data']>('/api/v1/config');
    return res.data;   // ← this is the AXIOS body, not the API "data" payload
  },
  ...
});
return data?.featureFlags ?? DEFAULT_FLAGS;
```

Server response (verified at [packages/api/src/server.ts:217-232](packages/api/src/server.ts#L217)):
```js
res.json({ success: true, data: <client config object> });
```

Axios returns this as `res.data = {success: true, data: {appVersion, featureFlags, ...}}`. The queryFn returns `res.data` (the wrapper), so `data` in the hook is `{success, data: {...}}`. Then `data?.featureFlags` looks at the wrapper level and finds `undefined` → falls back to DEFAULT_FLAGS = all OFF.

**Currently masked:** v1.0 features (Bug 44 / 45 — promo redemption, A/B testing) are intentionally OFF. The bug "happens" to align with the desired behavior. **But the moment v1.1 enables a feature flag in the admin panel, the mobile app will silently NOT honor it.** This is a time-bomb.

**Fix:** change `return res.data` to `return res.data.data`. Add a real test that mocks the server response shape and asserts `useFeatureFlags()` returns the parsed flags.

### MED-210 — useSocketRoom emits `room:join` / `room:leave` events the server doesn't handle, and the hook itself is dead code
**Files:**
- [apps/mobile/src/hooks/useSocketRoom.ts:34, 44](apps/mobile/src/hooks/useSocketRoom.ts#L34) — `socket.emit('room:join'/'room:leave', ...)`
- [packages/api/src/services/socket.service.ts:83-165](packages/api/src/services/socket.service.ts#L83) — server only listens for `join:conversation`, `leave:conversation`, `send:message`, `mark:read`, `typing:start`, `typing:stop`, `disconnect`. NO `room:join` / `room:leave` handler.
- Grep `useSocketRoom` across `apps/mobile/` → 0 callers (only the file itself).

The hook's docstring promises generic-room subscription for booking-detail live updates, home area updates, search slot availability. None of those screens use it; the server doesn't listen for the events anyway.

Either:
- Delete the dead hook (and the docstring claim).
- OR wire it: add server handlers, audit booking-detail / home / search to use the hook. This is the right path for v1.1 if real-time updates are roadmapped.

For v1.0: delete it. Dead code is a footgun for the next dev who tries to use it.

### MED-211 — Two competing offline-detection mechanisms (`useOffline` polling vs `OfflineBanner` event listener)
**Files:**
- [apps/mobile/src/hooks/useOffline.ts:13-22](apps/mobile/src/hooks/useOffline.ts#L13) — uses `expo-network.getNetworkStateAsync()`, polls every 30s
- [apps/mobile/src/components/ui/OfflineBanner.tsx:13-19](apps/mobile/src/components/ui/OfflineBanner.tsx#L13) — uses `@react-native-community/netinfo` event listener

The polling approach drains battery (forces a wakeup every 30s while the app is foregrounded) and lags behind the event listener by up to 30s. Two libraries doing the same job — one is dead weight.

Pick one. Recommendation: keep the netinfo eventListener (more efficient, immediate updates), drop expo-network. Update useOffline to subscribe via the same NetInfo helper.

### MED-212 — Phone normalization is duplicated in 2 files with subtly different regexes
**Files:**
- [apps/mobile/src/components/PhoneInput.tsx:16, 18-24](apps/mobile/src/components/PhoneInput.tsx#L16) — regex `/^(09|9)\d{9}$/`, function `normalizePhilippineMobile`
- [apps/mobile/src/utils/phone.ts:6, 32-38](apps/mobile/src/utils/phone.ts#L6) — regex `/^(\+63|0)?9\d{9}$/`, function `normalizePHPhone`

The utils version accepts `+639XXXXXXXXX` (13 chars). PhoneInput's does not. Login form (uses PhoneInput) rejects what the rest of the app accepts. A user pasting their phone with `+63` prefix into the login form sees "invalid" — but the same number works elsewhere.

Consolidate: import PhoneInput's `normalizePhilippineMobile` from `utils/phone.ts`, delete the duplicate. Match the more permissive regex everywhere.

### MED-213 — `i18n.setLocale` stores `currentLocale` but `i18n.t()` always reads from EN
**File:** [apps/mobile/src/lib/i18n.ts:60-86](apps/mobile/src/lib/i18n.ts#L60)
```ts
let currentLocale: Locale = 'en';
// ...
t(key, params) {
  let str = EN[key] ?? key;   // ← always EN
  ...
},
setLocale(locale) {
  currentLocale = locale;     // ← sets it but t() never reads it
  ...
}
```

Documented v1.1 limitation per the file's docstring. Not customer-breaking today (no localization advertised in v1.0). Flag for v1.1+ work.

---

## LOW / INFO

- **useSocket** lifecycle is correct: connects on auth, cleans up listeners on unmount. Good.
- **useStatusMutation** wraps useMutation with haptic feedback hooks (mutate/success/error). Used by all provider job-execution buttons. Strong abstraction.
- **useAccessibility** swaps to high-contrast palette + applies font scaling. Wired through to all screens via store.
- **useAppState** clears `backgroundMs` on `active`, increments via setInterval(30s) while in `background`. Pattern matches Bug 1203 (auto-off after 15 min).
- **useLocation** has a `promptOpenSettings` path that handles iOS `app-settings:` URL — correct affordance.
- **useDebouncedValue** is a clean classic. 22 lines.
- **useImagePicker** image compression via expo-image-manipulator (loaded defensively); resizes to max 1920px AND compresses to 0.75 JPEG. Defaults are sensible.
- **useJobGpsBroadcast** TaskManager registration at MODULE level (not inside the hook) is correct — survives the JS bridge being torn down on background. Documented in the comment.
- **useFeatureFlags** does fall back to DEFAULT_FLAGS gracefully — but for the wrong reason (MED-209). Net effect on v1.0 is "as-intended", but only by luck.
- **utils/currency.ts** — `formatPHP` with Intl.NumberFormat + `centavosToDecimal` + `decimalToCentavos`. Good rounding via `Math.round`.
- **utils/date.ts** uses `'Asia/Manila'` timezone consistently — correct for the launch market. `formatBookingRef` produces `OS-2026-XXXX` style refs from booking ids. Clean.
- **utils/distance.ts** uses km universally (per spec — never miles). Good.
- **utils/haptics.ts** wraps every Haptics.* call in try/catch — defensive against device-without-Taptic-Engine.
- **utils/cancellation-policy.ts** — fetches from `/api/v1/settings/cancellation-policy`, derives BOTH terms-screen body AND help-screen FAQ. Eliminates the four-place drift Bug 1170 was about. Clean implementation.
- **utils/validation.ts** — basic email + name + OTP + amount validators. Re-exports `validatePHPhone` from phone.ts.
- **lib/logger.ts** routes to Sentry breadcrumbs in prod, console in __DEV__. Correctly avoids `console.*` in production paths (Phase 14 Finding #8).
- **lib/i18n.ts** — 40+ keys catalogued for auth, bookings, common, payment, account, provider. Provider section includes `provider.tier.founding` — confirms the 'founding' tier exists in the design (CRIT-97 in D10).

---

## Phase D status

**Phase D is now COMPLETE.** All ~18,979 lines of customer mobile code (foundations, screens, services, components, hooks, utils, lib) read in full across D01–D12.

Next: write `PHASE-D-SUMMARY-AND-HANDOFF.md` consolidating the 12 findings docs, updating the running totals + pickup pointer for Phase E (provider mobile).

---

## Updated headline counts after D12

| Severity | Total | New in D12 |
|---|---:|---:|
| **CRITICAL** | **98 (1 invalidated → 97 real)** | **+1 (CRIT-98)** |
| **MEDIUM** | **213** | **+6 (MED-208–213)** |
