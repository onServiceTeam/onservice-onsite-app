# Phase D Findings Part 2 — Customer Tabs + Booking Data Layer

Files added in this batch:
- `apps/mobile/app/(tabs)/_layout.tsx` (70)
- `apps/mobile/app/(tabs)/home.tsx` (831)
- `apps/mobile/app/(tabs)/bookings.tsx` (281)
- `apps/mobile/app/(tabs)/profile.tsx` (256)
- `apps/mobile/app/(tabs)/wallet.tsx` (245)
- `apps/mobile/src/services/booking.service.ts` (257)

**Phase D running total: ~2,940 lines fully read.**
**Audit grand total: ~22,614 lines fully read.**

Plus targeted Grep verification of the wallet URL bug (CRIT-71 below).

---

## CRITICAL bugs (continuing from CRIT-70)

### CRIT-71 — Mobile wallet endpoints use `/api/v1/wallets` (plural) — server mounts at `/api/v1/wallet` (singular). FIVE 404s.
**Files affected:**
- [apps/mobile/app/(tabs)/wallet.tsx:83](apps/mobile/app/(tabs)/wallet.tsx#L83) — `'/api/v1/wallets/transactions'` → 404
- [apps/mobile/src/services/payment.service.ts:48](apps/mobile/src/services/payment.service.ts#L48) — `'/api/v1/wallets/top-up'` → 404
- [apps/mobile/app/provider/withdraw.tsx:51](apps/mobile/app/provider/withdraw.tsx#L51) — `'/api/v1/wallets/withdraw'` → 404
- [apps/mobile/app/provider/payouts.tsx:63](apps/mobile/app/provider/payouts.tsx#L63) — `'/api/v1/wallets/payouts'` → 404
- [apps/mobile/app/(provider-tabs)/earnings.tsx:89](apps/mobile/app/(provider-tabs)/earnings.tsx#L89) — `'/api/v1/wallets/transactions'` → 404

**Server mount** ([packages/api/src/server.ts:173](packages/api/src/server.ts#L173)):
```ts
app.use('/api/v1/wallet', walletRoutes);
```

The CORRECT path is `/api/v1/wallet/...` (singular). Two files in the codebase use the correct path:
- [apps/mobile/src/hooks/useWallet.ts:38-62](apps/mobile/src/hooks/useWallet.ts#L38) — uses `/api/v1/wallet/...` ✓
- [apps/mobile/app/provider/payout-settings.tsx:48,64](apps/mobile/app/provider/payout-settings.tsx#L48) — uses `/api/v1/wallet/...` ✓

But the five files above use `/api/v1/wallets/...` (plural) → all return 404.

**Effective consequences:**
1. **Customer wallet tab:** Transaction list fails to load. The "loading transactions" spinner spins until query times out. UI shows "No transactions yet" empty state (because `transactionsQuery.data` is undefined → defaults to `[]`).
2. **Customer wallet top-up:** Tapping "+ Top Up" routes to `wallet-topup.tsx`, which uses `payment.service.ts:topUp()` → POST /api/v1/wallets/top-up → 404. **Top-up is broken for every customer.**
3. **Provider withdraw:** Provider cannot withdraw funds. POST /api/v1/wallets/withdraw → 404.
4. **Provider payouts list:** Provider can't see their payout history. GET /api/v1/wallets/payouts → 404.
5. **Provider earnings tab:** Transaction history fails. GET /api/v1/wallets/transactions → 404.

This is **launch-blocking**. Half of the wallet/payments mobile UX is non-functional.

How did this slip through? The earlier (now-correct) hook file `useWallet.ts` uses singular. The newer screens (Phase 14 era?) were written using the plural form, possibly due to a copy-paste from a different REST convention. No integration test caught it because tests likely mock the API or run against a server that has both routes mounted.

**Fix dispatch:**
```
1. Search-replace across apps/mobile/:
   /api/v1/wallets/  →  /api/v1/wallet/
2. Files to fix (5 occurrences):
   - apps/mobile/app/(tabs)/wallet.tsx:83
   - apps/mobile/src/services/payment.service.ts:48
   - apps/mobile/app/provider/withdraw.tsx:51
   - apps/mobile/app/provider/payouts.tsx:63
   - apps/mobile/app/(provider-tabs)/earnings.tsx:89
3. Add ESLint rule (custom or grep-based CI check) that flags any string literal matching /api/v1/wallets/ — fail the build.
4. Add integration test that POSTs each mobile-callable wallet endpoint with a valid token and asserts NOT 404. Catches drift on either side.
5. Verify in Phase F (admin) that the admin web client doesn't have the same drift.
6. Test plan after fix:
   - Open customer wallet tab → transactions list loads.
   - Customer top-up flow completes.
   - Provider withdraw flow completes.
   - Provider payouts tab loads.
   - Provider earnings tab loads transactions.
```

### CRIT-72 — Customer logout doesn't call server (refresh tokens never invalidated)
**File:** [apps/mobile/src/stores/auth.store.ts:89-94](apps/mobile/src/stores/auth.store.ts#L89)
```ts
logout: () => {
  clearTokens();
  clearStoredUser();
  storage.delete('pushToken');
  set({ user: null, isAuthenticated: false, otpRequestId: null });
},
```
Just clears local storage. **No POST /api/v1/auth/logout call.** Refresh tokens stay alive in `refresh_tokens` table for 30 days (per `platformConfig.jwtRefreshExpiresIn`).

Combined with CRIT-22 (no JWT revocation):
- User taps "Log Out" → local cleared, server has no clue.
- If refresh token was previously stolen via XSS (mobile less likely than web, but possible) or device compromise, the attacker can keep refreshing forever.
- Multi-device scenario: log out from phone A, phone B's tokens still work. Log out from "all devices" doesn't exist.

This compounds the refresh-token replay detection gap (CRIT-53).

**Fix dispatch:**
```
1. In auth.store.ts:logout, before clearTokens():
   const refreshToken = getRefreshToken();
   if (refreshToken) {
     try {
       await api.post('/api/v1/auth/logout', { refreshToken });
     } catch {
       // best-effort; clear local even if server call fails
     }
   }
2. Make logout async; update profile.tsx callsite (line 54-58) to await it.
3. Add a "Log out all devices" button that calls a new POST /api/v1/auth/logout-all endpoint (server-side: DELETE all refresh_tokens for user_id).
4. Test: log out → server-side refresh_tokens row deleted → subsequent refresh-token call returns 401.
```

### CRIT-73 — Profile error handling uses axios-shaped error → users see generic fallback
**File:** [apps/mobile/app/(tabs)/profile.tsx:78-79](apps/mobile/app/(tabs)/profile.tsx#L78)
```ts
try { ... } catch {
  Alert.alert('Error', 'Failed to update profile. Please try again.');
}
```
Same pattern as CRIT-69 — server's specific error (e.g., "Email already in use" or validation messages) NEVER reaches the user. Same fix dispatch applies.

---

## MEDIUM bugs

### MED-123 — Home screen "location selector" is non-functional
**File:** [apps/mobile/app/(tabs)/home.tsx:186-194](apps/mobile/app/(tabs)/home.tsx#L186)
```tsx
<TouchableOpacity ...>
  <Text style={styles.locationLabel}>Current Location</Text>
  <Text style={styles.locationValue} numberOfLines={1}>
    Select your address ▾
  </Text>
</TouchableOpacity>
```
Hardcoded "Select your address ▾". After the user picks an address (via /customer/address-picker), the home screen never reads or displays the saved address. The label is permanent. Customer thinks they haven't set an address.

**Fix:** subscribe to a stored "default address" (via `useAddressStore` or similar). Display the selected address. If none selected, show "Select your address ▾".

### MED-124 — Bookings screen has FilterModal but no trigger to open it
**File:** [apps/mobile/app/(tabs)/bookings.tsx:80-82, 196-225](apps/mobile/app/(tabs)/bookings.tsx#L196)
`advancedFiltersVisible` state declared, FilterModal mounted, but no UI element sets `setAdvancedFiltersVisible(true)`. Modal can never open. **Dead UI** — the date/sort filters are unreachable.

**Fix:** add a filter icon button in the title row that calls `setAdvancedFiltersVisible(true)`. Consume `advancedFilters` in the fetchBookings call.

### MED-125 — Bookings screen `advancedFilters` state never read
**File:** [apps/mobile/app/(tabs)/bookings.tsx:81](apps/mobile/app/(tabs)/bookings.tsx#L81)
Even if the modal opened, the resulting `advancedFilters` state isn't passed to the API call (line 61-73 only reads `statusFilter`). Date range and sort aren't applied to the fetch.

### MED-126 — Home screen makes 6 parallel useQuery calls on every mount
**File:** [apps/mobile/app/(tabs)/home.tsx:106-143](apps/mobile/app/(tabs)/home.tsx#L106)
6 separate fetch endpoints: categories, activeBookings, recentBookings, promotions, sukiProviders, unreadNotifications. Each open of home tab fires all 6. On a slow connection (rural PH 3G), home takes 5-10s to fully load.

Consider:
- Server-side `/home/bundle` endpoint that returns all 6 in one round-trip.
- Or React Query's `useQueries` with prefetch on app start.
- Or reduce the count: do unread notification + active booking in parallel; lazy-load suki + promos when scrolled into view.

### MED-127 — Profile email field NOT editable in UI even though server supports it
**File:** [apps/mobile/app/(tabs)/profile.tsx:122-148](apps/mobile/app/(tabs)/profile.tsx#L122)
Edit form shows firstName, lastName, phone (readonly with "in development" alert). No email field. Server accepts email update via `updateProfileSchema`. Inconsistent.

**Decide:**
- (a) Add email field with verification flow (per CRIT-62 requirement).
- (b) Document that email is admin-managed only; server should reject email in /me PATCH.

### MED-128 — Wallet top-up button routes to Routes.CUSTOMER.WALLET (likely wallet-topup, but worth verifying)
**File:** [apps/mobile/app/(tabs)/wallet.tsx:117](apps/mobile/app/(tabs)/wallet.tsx#L117)
```ts
onPress={() => router.push(Routes.CUSTOMER.WALLET)}
```
Need to verify `Routes.CUSTOMER.WALLET` resolves to `/customer/wallet-topup`. If it's the wallet tab itself, tapping "Top Up" loops back to where the user already is. Read `apps/mobile/src/config/navigation.ts` to verify. (Possible MED-128 → upgrade to CRIT if the route is wrong.)

### MED-129 — Wallet refresh hits a non-existent transactions endpoint silently
**File:** [apps/mobile/app/(tabs)/wallet.tsx:91-94](apps/mobile/app/(tabs)/wallet.tsx#L91)
Pulling-to-refresh calls `transactionsQuery.refetch()` → 404 (per CRIT-71) → React Query swallows the error, refresh spinner stops, UI stays empty. User experiences silent failure. Once CRIT-71 is fixed, this becomes moot. Until then, wallet UX is dead.

### MED-130 — Profile refresh handler swallows errors silently
**File:** [apps/mobile/app/(tabs)/profile.tsx:31-46](apps/mobile/app/(tabs)/profile.tsx#L31)
```ts
} catch {
  // Silently fail on refresh
}
```
If /me returns an error (token expired right at refresh, server down, etc.), user has no signal. At least log to Sentry.

### MED-131 — `getActiveBookings` and `getRecentBookings` use `status: 'active'` and `'completed'` (server enum mismatch?)
**File:** [apps/mobile/src/services/booking.service.ts:71-83](apps/mobile/src/services/booking.service.ts#L71)
Server's `listBookings` (booking.service.ts:331) recognizes `status` query param values 'active', 'completed', 'cancelled' as group filters. So this works. **OK.** But fragile — couples mobile to server's group taxonomy.

---

## LOW / INFO

- **6 of the 5 customer tab files** correctly handle React Query loading + error states with retry buttons (home, bookings, wallet have explicit error UIs).
- **(tabs)/_layout.tsx** is clean and minimal.
- **home.tsx Bug 889 / D04 SiguradoShield pull** is correctly applied — no insurance UI, replaced with "How onService works" trust panel.
- **profile.tsx Bug 920** SiguradoShield row removed; "Account & Data" replaces it.
- **wallet.tsx** TRANSACTION_ICONS map covers all 9 wallet_transactions.type values. Good.
- **booking.service.ts is the canonical mobile-side data layer** for bookings. Correctly migrated to D05/Bug 175+176+261 schema (server resolves prices server-side).
- **Profile screen Avatar component (R5-complete)** + PhoneInput consistently used.

---

## What's left in Phase D

- Customer booking flow screens (~3,500 lines): checkout, configure, form, review, tracker, [id], change-order, quotes, tip, dispute, payment-failed, complete, photos, make-recurring, job-request
- Customer wallet/payment/account (~1,500 lines): wallet-topup, payment-methods, account-management, data-rights, terms
- Other customer screens (~3,000 lines): provider/[id], addresses, address-picker, chat, search, suki-pros, recurring, safety, help, notifications, etc.
- Mobile shared services + components (~7,000 lines): payment.service, push.service, recurring.service, navigation config, stores, components

Continuing in next batches.
