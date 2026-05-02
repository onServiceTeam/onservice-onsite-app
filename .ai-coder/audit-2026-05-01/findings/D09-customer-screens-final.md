# Phase D Findings Part 9 — Final batch of customer screens

Files added in this batch (full reads unless noted):
- `apps/mobile/app/customer/address-picker.tsx` (449)
- `apps/mobile/app/customer/search.tsx` (348)
- `apps/mobile/app/customer/suki-pros.tsx` (316)
- `apps/mobile/app/customer/safety-and-support.tsx` (324)
- `apps/mobile/app/customer/help.tsx` (265)
- `apps/mobile/app/customer/notification-settings.tsx` (264)
- `apps/mobile/app/customer/notifications.tsx` (200)
- `apps/mobile/app/customer/recurring/index.tsx` (212)
- `apps/mobile/app/customer/recurring/[id].tsx` (386)
- `apps/mobile/app/customer/category/[id].tsx` (156)
- `apps/mobile/app/customer/referral.tsx` (247)
- `apps/mobile/app/customer/_layout.tsx` (38)

**Phase D running total: ~14,124 lines fully read.**
**Audit grand total: ~33,798 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-91)

### CRIT-92 — Address-picker map initialRegion is Manila — wrong for a Boracay launch
**File:** [apps/mobile/app/customer/address-picker.tsx:20-25, 311](apps/mobile/app/customer/address-picker.tsx#L20)
```ts
const MANILA_REGION: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};
// ...
<MapView initialRegion={MANILA_REGION} ...>
```

**Per CLAUDE.md, the platform launches in Boracay** (Aklan, ~11.97°N, 121.92°E — 290 km south of Manila). Customer opens the address-picker → the map opens centered on Manila. They have to manually pan ~3° south to find their actual location. On a slow connection or small screen, many customers will give up.

Worse: when paired with **CRIT-93** (PH_REGIONS doesn't include Boracay), even a successful pan doesn't yield a savable address.

**Fix dispatch:**
```
1. Replace MANILA_REGION with a launch-region constant derived from
   platformConfig.launchRegion (new field). Boracay default:
   { latitude: 11.9698, longitude: 121.9255, latitudeDelta: 0.05, longitudeDelta: 0.05 }.
2. On mount, read the user's last saved address (if any) and center on it.
   If no saved address but lastKnownLocation is available (already used
   line 312 region={selectedAddress?.latitude ? ... : userLocation}),
   center on userLocation first; fall back to launchRegion only if no permission.
3. Test: open address-picker on a fresh install with no permission → map
   should center on Boracay, not Manila.
```

### CRIT-93 — PH_REGIONS hardcoded list does NOT include Boracay; saving a Boracay pin is blocked
**File:** [apps/mobile/app/customer/address-picker.tsx:36-58, 60-77, 162-181](apps/mobile/app/customer/address-picker.tsx#L36)
```ts
const PH_REGIONS: { lat: number; lng: number; city: string; province: string }[] = [
  { lat: 14.5995, lng: 120.9842, city: 'Manila', province: 'Metro Manila' },
  { lat: 14.6760, lng: 121.0437, city: 'Quezon City', province: 'Metro Manila' },
  // ... 22 cities, NONE in Aklan / Boracay
];

function guessRegionFromCoordinates(lat: number, lng: number) {
  let closest = PH_REGIONS[0]!;
  let minDist = Infinity;
  for (const r of PH_REGIONS) { /* ... */ }
  if (minDist > 0.5) return { city: '', province: '' };  // ← Boracay falls into this branch
  return { city: closest.city, province: closest.province };
}
```

Then [address-picker.tsx:handleConfirm]:
```ts
if (!selectedAddress?.city) {
  Alert.alert('Cannot save', 'Please select a city.');
  return;
}
```

**Customer experience for the entire launch market:**
1. Customer in Boracay opens address-picker.
2. Pans the map to their house in Boracay.
3. Coordinates are valid; reverse-geocode returns lat/lng.
4. `guessRegionFromCoordinates` returns `{city:'', province:''}` (Boracay is too far from any of the 22 hardcoded cities — minDist > 0.5).
5. Customer taps Confirm → "Cannot save. Please select a city."
6. **Customer cannot create a service address. Cannot book.**

This blocks the entire launch.

**Fix dispatch:**
```
1. Replace the 22-row hardcoded PH_REGIONS literal with a server-fetched
   region table (new endpoint /api/v1/geo/regions, cached in TanStack Query
   for 24h). Source the data from the existing service area config so
   admin can extend to new cities post-launch without an app update.
2. For the launch dataset, add at minimum:
   - { lat: 11.9698, lng: 121.9255, city: 'Boracay', province: 'Aklan' }
   - { lat: 11.7167, lng: 122.4192, city: 'Kalibo', province: 'Aklan' }
   - { lat: 11.8333, lng: 122.0167, city: 'Malay', province: 'Aklan' }
   plus the 22 existing rows for any future expansion.
3. Replace the 0.5-degree threshold (~55 km) with an explicit "outside
   service area" message that points to the launch service-area
   policy. Don't silently clear city/province.
4. The reverse-geocode call (Expo Location.reverseGeocodeAsync) actually
   already returns city + province — use the GIS result first, fall
   back to closest-region only if the API fails. The current code
   ignores reverseGeocodeAsync output entirely.
5. Test: simulate location at 11.97, 121.92 → Confirm button must
   produce a savable address with city='Boracay' or city='Malay'.
```

### CRIT-94 — Search → provider profile uses `provider.userId` but the route expects `provider.id`
**Files:**
- [apps/mobile/app/customer/search.tsx:111](apps/mobile/app/customer/search.tsx#L111) — `router.push('/customer/provider/${provider.userId}')`
- [apps/mobile/app/customer/provider/[id].tsx:75-81](apps/mobile/app/customer/provider/[id].tsx#L75) — passes `id` directly to `getProviderProfile(id)`
- [apps/mobile/src/services/provider.service.ts:73-74](apps/mobile/src/services/provider.service.ts#L73) — `GET /api/v1/providers/${id}`
- [packages/api/src/routes/provider.routes.ts:92-99](packages/api/src/routes/provider.routes.ts#L92) — handler calls `providerService.getProviderById(providerId)` — server expects the **providers table id**, not users.id

The mobile `ProviderResult` type (search.tsx:26-35) carries both `id` (provider id) and `userId` (auth user id). Search routes with `userId`. `provider/[id].tsx` then calls the server with that user id. Server looks up `providers WHERE id = $1` → 0 rows → 404.

**Customer experience:** every tap on a search-result provider card 404s. Customer cannot reach provider profiles via search. Booking from a search result is impossible.

This was likely missed because deep links from booking lists, suki list, and chat all use `provider.id` directly — search is the only entry point that picked the wrong field. Likely introduced during R5-complete (the FilterModal/debounce work on this file references R5 in the comments).

**Fix dispatch:**
```
1. Change search.tsx:111 from
       router.push(`/customer/provider/${provider.userId}`)
   to
       router.push(`/customer/provider/${provider.id}`)
2. Add a real test: render search.tsx with mocked api response that
   returns a provider {id: 'P1', userId: 'U1', ...}; assert the
   router.push call argument is '/customer/provider/P1', not
   '/customer/provider/U1'.
3. Audit other navigation callsites that mention provider.userId vs
   provider.id (grep for "provider/${" across the app). If any other
   screen has the same bug, fix in the same dispatch.
4. Consider deleting the userId field from the ProviderResult type —
   client doesn't need it. Smaller surface, fewer footguns.
```

### CRIT-95 — Customer support hotline is a placeholder (`+63281234567`) on TWO screens
**Files:**
- [apps/mobile/app/customer/safety-and-support.tsx:134](apps/mobile/app/customer/safety-and-support.tsx#L134) — `Linking.openURL('tel:+63281234567')` (immediate emergency action — "Call Hotline" button on the Safety & Support screen)
- [apps/mobile/app/customer/help.tsx:183](apps/mobile/app/customer/help.tsx#L183) — `onPress={() => Linking.openURL('tel:+63281234567')}` (Help screen "Call Support" button)

`+63 2 8123 4567` is a Manila landline number that is almost certainly not owned by onService PH. **A real customer in distress (assault, stolen items, provider not showing up) taps "Call Hotline" → reaches a wrong number / unrelated business.**

This is a launch-blocking trust + safety failure, on top of being unprofessional.

**Fix dispatch:**
```
1. Decision (Ken): what is the real launch hotline?
   - 24/7 monitored line (recommended for a marketplace at launch).
   - Office hours line + after-hours email/SMS rotation.
   - Tied to a real human ops process, documented in launch runbook.
2. Move the number to platformConfig.supportHotline (server-canonical,
   admin-editable per the standing instruction in MEMORY.md).
3. Replace BOTH hardcoded calls with platformConfig.supportHotline.
   Add a fallback string only for CI ("REPLACE_BEFORE_LAUNCH") and
   add a CI guard that fails any commit where the runtime value
   matches REPLACE_BEFORE_LAUNCH or starts with the placeholder
   prefix +63281234567.
4. Pair with D14 ops items for hotline rotation + on-call schedule.
5. Test: render safety-and-support and help screens, mock platformConfig
   to set supportHotline='+639171234567', assert the rendered Call
   button uses the mocked number.
```

---

## MEDIUM bugs

### MED-178 — address-picker uses naive substring search instead of geocoding
**File:** [apps/mobile/app/customer/address-picker.tsx:144-159](apps/mobile/app/customer/address-picker.tsx#L144)
The "search this area" text input filters PH_REGIONS by `city.includes(query)` rather than calling Expo Location.geocodeAsync (which reverse-geocodes a place name to coords). User cannot search for "barangay X" or for landmarks. Combined with CRIT-93's missing Boracay row, search for "Boracay" returns zero results.

### MED-179 — Saved-address fallback uses Manila coords if customer's address has no lat/lng
**File:** [apps/mobile/app/customer/address-picker.tsx:115-119](apps/mobile/app/customer/address-picker.tsx#L115) (approx)
When loading a saved address that lacks `latitude`/`longitude` (legacy/text-only addresses — see MED-176 in D08), the picker re-centers on Manila instead of warning the user. Should display "Coordinates missing — please re-pin."

### MED-180 — Address-picker can save raw lat/lng as the address string
**File:** [apps/mobile/app/customer/address-picker.tsx:166-181](apps/mobile/app/customer/address-picker.tsx#L166)
If `reverseGeocodeAsync` fails (offline, throttled), the fallback constructs the address from coordinates only ("11.9698, 121.9255"). Provider seeing an arrival page with raw lat/lng instead of a street name + landmark is bad UX. Should at least format as "Pinned location near Boracay" until customer adds a street name.

### MED-181 — search.tsx FilterModal is dead UI: no trigger ever calls `setFilterModalVisible(true)`
**File:** [apps/mobile/app/customer/search.tsx:63, 227-258](apps/mobile/app/customer/search.tsx#L63)
```ts
const [filterModalVisible, setFilterModalVisible] = useState(false);
// ...
<FilterModal visible={filterModalVisible} ... onClose={() => setFilterModalVisible(false)} />
```
`setFilterModalVisible(true)` is never called anywhere in the file. There's no Filter button, no chip, no header icon. The modal exists in code but cannot be opened.

This was the centerpiece of the F#5 (R5-complete) "wired all 11 D11/D12 components into 3+ screens" remediation closeout (commit 8274ef3). The component is technically "imported and rendered" — but the wiring is incomplete. **Re-classifies as a partial F#5 failure.**

**Fix dispatch:**
```
1. Add a Filter button to the search header (line ~210-225 region).
   onPress={() => setFilterModalVisible(true)}.
2. Add a real DOM-render test that finds the Filter button, fires
   onPress, asserts FilterModal.visible becomes true. (Per the
   F#7 audit lesson — render + assert, not import-only.)
3. Audit the other 10 components from the R5-complete dispatch for
   the same pattern. If any other "wired" component lacks a real
   open-trigger, fix the same way.
```

### MED-182 — suki-pros redemption requires multiple of 500; server only requires multiple of 100
**Files:**
- [apps/mobile/app/customer/suki-pros.tsx](apps/mobile/app/customer/suki-pros.tsx) — guard `pts < platformConfig.sukiMinRedeemPoints || pts % platformConfig.sukiMinRedeemPoints !== 0`
- Mobile `platformConfig.sukiMinRedeemPoints = 500`
- Server B02 audit: `sukiMinRedeemPoints = 100` per platform_settings

Customer with 350 points: server allows 100/200/300 redemptions; mobile blocks all of them. Customer with 600 points: server allows 100/200/300/400/500/600; mobile only allows 500.

Cross-cutting: confirms CRIT-81 (mobile platform.config.ts duplicates server values, drifts).

### MED-183 — safety-and-support claims a masked-number Call button exists on each booking — no Call button is rendered on booking/[id]
**File:** [apps/mobile/app/customer/safety-and-support.tsx](apps/mobile/app/customer/safety-and-support.tsx)
Help text says: "From your booking screen, tap the masked phone icon to call your provider through our privacy-protected gateway." But [apps/mobile/app/customer/booking/[id].tsx](apps/mobile/app/customer/booking/[id].tsx) does NOT render a Call button (it has Chat, Cancel, Tip — no Call). Either ship the masked-call feature or revise the safety help text. Honest UX matters.

### MED-184 — help.tsx FAQ "How do I delete my account?" tells customer to email support — but in-app delete flows exist
**File:** [apps/mobile/app/customer/help.tsx](apps/mobile/app/customer/help.tsx)
FAQ answer points to `support@onservice.ph` for deletion. But account-management.tsx (cooling-off flow) and data-rights.tsx (NPC erasure flow) both implement in-app deletion. The FAQ is stale; should link to `/customer/account-management` directly.

### MED-185 — notification-settings `disableOptional` button overwrites user's manual disables
**File:** [apps/mobile/app/customer/notification-settings.tsx](apps/mobile/app/customer/notification-settings.tsx)
```ts
const disableOptional = useCallback(() => {
  const updated: NotificationPrefs = { ...prefs };
  for (const item of PREF_ITEMS) updated[item.key] = ESSENTIAL_KEYS.has(item.key);
  setPrefs(updated);
  setDirty(true);
}, [prefs]);
```
Sets ALL essentials to true (re-enables paymentAlerts/bookingUpdates/system) AND ALL optionals to false. If the customer had already disabled `bookingUpdates` (they're allowed to — Switch is enabled), tapping "Essentials Only" silently re-enables it. Should preserve user's existing disables for the essentials and only flip optionals to false.

### MED-186 — notification-settings missing NPC §28 marketing-consent disclosure
**File:** [apps/mobile/app/customer/notification-settings.tsx](apps/mobile/app/customer/notification-settings.tsx)
Per NPC RA 10173 §28 (the same act invoked in data-rights.tsx and terms.tsx), marketing communications require explicit, separately-recorded consent. The promotional/marketing toggle (if present in PREF_ITEMS) needs accompanying text: "By enabling this you consent to onService PH sending promotional messages per NPC RA 10173 §28. You can withdraw at any time." Without this, a regulator audit could flag the promotional toggle as non-compliant.

### MED-187 — notification-settings essential `paymentAlerts` toggleable via the Switch
**File:** [apps/mobile/app/customer/notification-settings.tsx](apps/mobile/app/customer/notification-settings.tsx)
`ESSENTIAL_KEYS` is enforced only by the `disableOptional` button. The per-item Switch lets customer turn off paymentAlerts/bookingUpdates/system individually. Customer who disables paymentAlerts then misses an autodebit failure → escrow auto-confirms 24h later (CRIT-83/90) → money path silently broken. Add `disabled={ESSENTIAL_KEYS.has(item.key)}` to the Switch with a tooltip.

### MED-188 — notifications.tsx deep-link only handles `bookingId`; suki/payment/dispute/referral notifications tap-to-nothing
**File:** [apps/mobile/app/customer/notifications.tsx](apps/mobile/app/customer/notifications.tsx)
```ts
if (notifData?.bookingId) router.push(`/customer/booking/${notifData.bookingId}`);
```
A push notification for "You earned 200 suki points" or "Refund processed" or "Dispute response from provider" carries different data shapes (sukiTransactionId, walletTxId, disputeId) — none routed. Customer taps the notification → marks as read → no navigation. Misses the call-to-action.

### MED-189 — _layout `name="safety"` doesn't match file `safety-and-support.tsx`
**File:** [apps/mobile/app/customer/_layout.tsx:29](apps/mobile/app/customer/_layout.tsx#L29)
```ts
<Stack.Screen name="safety" />
```
The file is `safety-and-support.tsx`. Expo Router silently ignores Stack.Screen declarations whose name doesn't match a file route. Effects:
- Any per-screen options that should be applied to safety-and-support.tsx (header, animation override, presentation) are silently dropped.
- safety-and-support.tsx is not in the layout list at all — also missing: notification-settings, recurring/[id], recurring/index, payment-methods, address-picker (declared but flagged as modal — that's correct).

Clean up: rename to `name="safety-and-support"` and add the missing screen declarations. Not customer-breaking today (parent screenOptions handle defaults), but a CI snapshot test should verify the layout file lists every file in `app/customer/`.

---

## LOW / INFO

- **address-picker is GPS-aware** (Location.requestForegroundPermissionsAsync, Location.getCurrentPositionAsync). Permission-denied path falls back to manual pin — good.
- **search.tsx debounced query input** (300ms via useDebouncedValue) is correct.
- **suki-pros tier visualization** is comprehensive (5 tiers, progress bar, points-to-next-tier).
- **safety-and-support D04 SiguradoShield-pull comment header** at top of file is exemplary — clear "this replaces safety.tsx; do NOT reintroduce insurance copy".
- **help.tsx Bug 1170/1198 fix** — cancellation policy fetched live from server in the FAQ "What's your cancellation policy?" answer.
- **notifications.tsx mark-as-read on tap** — clean implementation with optimistic update.
- **recurring/index.tsx + recurring/[id].tsx** — the most polished pair of screens in this batch. Pause/resume/cancel/skip mutations all use specific err.message extraction (better than the axErr cast pattern). Use this as a template for fixing the CRIT-69 family.
- **category/[id].tsx** — clean: routes to job-request if `quoteRequired`, else booking/configure. Server-side `quoteRequired` flag drives the branch.
- **referral.tsx referral bonus** read from server (referral.bonusAmount) with `platformConfig.referralBonusAmount` fallback. Note the fallback is the 5th money-math source in the codebase (per CRIT-81 family). Should be derived only from server.
- **referral.tsx uses Share API for both share and copy** — no Expo Clipboard import. Means "Copy Code" opens the system share sheet rather than just copying. Minor UX choice; either acceptable.
- **All 12 screens use ScreenContainer + StyleSheet pattern** — consistent.

---

## Phase D status

Phase D customer-screen reads are **complete** with this batch. Remaining for Phase D:
- Mobile services bulk (~1,266 lines): recurring, booking-photo, catalog, review, tip, pricing, rebooking, slot-waitlist, messaging, upload, data-management, compliance, address, provider.
- Mobile components (~2,500 lines): PhoneInput, Avatar, FilterChips, FilterModal, ConfirmModal, StatusBadge, PulsingDot, PaginationLoader, icons/index, ui/Button, ui/Toast, ui/SuccessAnimation, ui/OptimizedList, plus other ui primitives.
- Mobile hooks + utils (~500 lines): useImagePicker, useJobGpsBroadcast, phone, currency, date, cancellation-policy, business, provider-api, provider-tools.

Continuing into D10 next.

---

## Updated headline counts after D09

| Severity | Total | New in D09 |
|---|---:|---:|
| **CRITICAL** | **95 (1 invalidated → 94 real)** | **+4 (CRIT-92, 93, 94, 95)** |
| **MEDIUM** | **189** | **+12 (MED-178–189)** |
