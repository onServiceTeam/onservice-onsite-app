# Phase D Findings Part 4 — Wallet/Payment Chain + Navigation Routes

Files added in this batch:
- `apps/mobile/app/customer/wallet-topup.tsx` (256)
- `apps/mobile/app/customer/payment-methods.tsx` (157)
- `apps/mobile/src/services/payment.service.ts` (53)
- `apps/mobile/src/hooks/useWallet.ts` (86)
- `apps/mobile/src/config/navigation.ts` (174)
- `apps/mobile/src/config/platform.config.ts` (82)

Plus targeted Grep verifications:
- `useWallet` usage (DEAD CODE — only referenced in test file)
- `Routes.CUSTOMER.{WALLET,SETTINGS,PROFILE,HOME}` usage (CONFIRMED dead routes still being used)
- Server `wallet.routes.ts` actual endpoints (verifying CRIT-71 expansion + new D-USEW-01)

**Phase D running total: ~7,064 lines fully read.**
**Audit grand total: ~26,738 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-77)

### CRIT-71 EXPANDS — wallet URL mismatch hits TWO MORE endpoints
**Updated affected files (now 7 broken endpoints, was 5):**
- `apps/mobile/app/(tabs)/wallet.tsx:83` — `/api/v1/wallets/transactions` → 404 (already in CRIT-71)
- `apps/mobile/src/services/payment.service.ts:35` — `/api/v1/wallets` → 404 (**NEW**)
- `apps/mobile/src/services/payment.service.ts:48` — `/api/v1/wallets/top-up` → 404 (already, but confirmed used by wallet-topup)
- `apps/mobile/app/provider/withdraw.tsx:51` — `/api/v1/wallets/withdraw` → 404
- `apps/mobile/app/provider/payouts.tsx:63` — `/api/v1/wallets/payouts` → 404
- `apps/mobile/app/(provider-tabs)/earnings.tsx:89` — `/api/v1/wallets/transactions` → 404

**NEW concretely broken in this audit:**
- **payment.service.ts:35 `getWalletBalance`** — every screen that reads wallet balance via this helper sees "---" because the GET 404s. Used by:
  - `app/(tabs)/wallet.tsx:70-74` — wallet tab balance card never loads
  - `app/customer/wallet-topup.tsx:36-40` — top-up screen "Current Balance" header never loads
- **payment.service.ts:48 `topUpWallet`** — tap "Add ₱X to Wallet" → POST 404 → mutation throws → error toast → top-up never completes

Confirmed via direct file reads — **the entire customer wallet experience is non-functional on launch unless this is fixed.**

The fix dispatch from CRIT-71 still applies: search-replace `/api/v1/wallets/` → `/api/v1/wallet/` in all 5 of those files. Add `/api/v1/wallets` → `/api/v1/wallet` for payment.service.ts:35.

### CRIT-78 — useWallet hook hits a non-existent server endpoint (`/api/v1/wallet/balance`)
**File:** [apps/mobile/src/hooks/useWallet.ts:38](apps/mobile/src/hooks/useWallet.ts#L38)
```ts
api.get<ApiResponse<WalletBalance>>('/api/v1/wallet/balance'),
```

Server-side `wallet.routes.ts` (verified via grep) exposes:
- `GET /` — wallet root (returns balance via formatWallet)
- `GET /transactions` — list transactions
- `POST /top-up`
- `POST /withdraw`
- `GET /payouts`
- `GET /payout-preferences`
- `PUT /payout-preferences`

**There is NO `/wallet/balance` route.** The hook would 404 if used.

Mitigation: Grep confirms `useWallet` is only referenced in `apps/mobile/src/hooks/useWallet.ts` itself (no consumer screens). **Dead code.**

But: a future engineer wiring it up would face an undocumented 404. Either delete the hook or fix the path:

**Fix dispatch:**
```
1. Decide: delete useWallet.ts entirely (dead code), OR
2. Fix line 38 to `'/api/v1/wallet'` (matches server root route).
3. Add a CI check that pulls every api.get/post URL and asserts a matching route exists in server.ts mounted routers. (Same idea as CRIT-71 fix dispatch — a typed API client / OpenAPI codegen.)
4. If keeping the hook: write a smoke test that mounts useWallet, asserts queryFn returns data when called against a running server.
```

### CRIT-79 — `Routes.CUSTOMER.WALLET` is a dead route — wallet "Top Up" button takes user nowhere
**Files:**
- [apps/mobile/src/config/navigation.ts:58](apps/mobile/src/config/navigation.ts#L58) — defines `WALLET: '/customer/wallet'`
- [apps/mobile/app/(tabs)/wallet.tsx:117](apps/mobile/app/(tabs)/wallet.tsx#L117) — uses `router.push(Routes.CUSTOMER.WALLET)` for the "+ Top Up" button

`/customer/wallet` is **not a real screen.** The actual top-up screen is at `/customer/wallet-topup`. So tapping "+ Top Up" in the wallet tab navigates to a 404 / "screen not found" route, depending on how Expo Router handles missing screens.

Combined with CRIT-71 (top-up endpoint also broken), **the customer top-up flow is doubly broken**:
1. Top Up button → wrong route → screen never opens.
2. Even if it opened, the topUpWallet API call would 404.

**Fix dispatch:**
```
1. Add `WALLET_TOPUP: '/customer/wallet-topup'` to navigation.ts CUSTOMER block (this constant is missing entirely).
2. Update wallet.tsx:117 to use `Routes.CUSTOMER.WALLET_TOPUP`.
3. Decide what `Routes.CUSTOMER.WALLET` should mean — currently dead. Either delete it or point it at a future "Wallet hub" screen.
4. Test: tap Top Up in wallet tab → arrives at /customer/wallet-topup with the topup form rendered.
```

### CRIT-80 — `Routes.CUSTOMER.SETTINGS` is a dead route — "Notification Settings" link broken
**Files:**
- [apps/mobile/src/config/navigation.ts:60](apps/mobile/src/config/navigation.ts#L60) — defines `SETTINGS: '/customer/settings'`
- [apps/mobile/app/(tabs)/profile.tsx:93](apps/mobile/app/(tabs)/profile.tsx#L93) — uses `router.push(Routes.CUSTOMER.SETTINGS)` for "Notification Settings"

`/customer/settings` is not a real screen. The actual notification-settings screen is at `/customer/notification-settings`. Profile menu's "Notification Settings" row leads to a 404.

**Fix:** add `NOTIFICATION_SETTINGS: '/customer/notification-settings'` to nav and update profile.tsx:93.

### CRIT-81 — Mobile platform.config.ts duplicates ALL the server's money math constants
**File:** [apps/mobile/src/config/platform.config.ts:17-27, 35-36, 76](apps/mobile/src/config/platform.config.ts#L17)
```ts
commissionRates: { new: 0.15, verified: 0.13, pro: 0.11, elite: 0.09 },
serviceFeeRate: 0.10,
guaranteeFundRate: 0.015,
minimumServiceFee: 2500,
maximumServiceFee: 50000,
escrowAutoConfirmHours: 24,
escrowDisputeWindowHours: 48,
vatRate: 0.12,
```

This is the same drift pattern as CRIT-13 (server) and CRIT-42 (invoice service) and CRIT-75 (mobile booking flow). **The mobile copy is a third source of truth for fee math** — currently matches but will drift the moment ops tunes the server's `service_fee_rate` setting.

Confirms the cross-cutting issue identified in earlier handoffs: the platform has FOUR places where fee/commission constants live (server platform.config, server settings.service defaults, mobile platform.config, mobile booking flow code). Need ONE source of truth.

**Fix:** delete all money math constants from mobile platform.config.ts. Mobile fetches via `/api/v1/config` (server's getClientConfig at server.ts:217-232 already returns these). Mobile uses the server-canonical values, never local constants.

### CRIT-82 — Mobile defaults `apiUrl` to localhost — production builds without env break silently
**File:** [apps/mobile/src/config/platform.config.ts:9](apps/mobile/src/config/platform.config.ts#L9)
```ts
apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:7381',
```

If a release build forgets to set `EXPO_PUBLIC_API_URL`, the app points to `localhost:7381`. Every API call fails (no server on the customer's phone). User gets stuck at splash.

There's no startup check — the app starts, fetches `/config` against localhost, fails, falls through to hardcoded defaults (per CRIT-49), shows the home screen with no data.

**Fix dispatch:**
```
1. Build-time guard in app.config.ts (Expo) or eas.json: refuse to build a non-development binary if EXPO_PUBLIC_API_URL doesn't match a known production/staging URL pattern.
2. Runtime guard at app boot: if __DEV__ === false AND apiUrl includes 'localhost' OR '127.0.0.1', show a "Build configuration error" screen with "Please reinstall from the App Store / Play Store" guidance.
3. Test: build a release binary without env set, observe the boot guard.
```

---

## MEDIUM bugs

### MED-142 — wallet-topup uses platformConfig.minTopUp/maxTopUp; server uses different naming
**File:** [apps/mobile/app/customer/wallet-topup.tsx:80, 142](apps/mobile/app/customer/wallet-topup.tsx#L80)
```ts
const isValid = activeAmount >= platformConfig.minTopUp;  // mobile naming
```
Mobile defines `minTopUp` / `maxTopUp` (line 63-64 of mobile platform.config.ts). Server defines `minimumTopUpAmount` / `maximumTopUpAmount` (server platform.config.ts). Naming inconsistency — fine because they're separate codebases, but they're enforcing the same business rule with different names. If server raises minimum to ₱200, mobile's local guard still passes ₱100 → user gets a 400 from server with a message they don't see (per CRIT-69 fetch-error mismatch).

**Fix:** mobile should fetch limits via /config (which already exposes minimumPaymentAmount + minimumWithdrawalAmount, but NOT minTopUp). Add `minimumTopUpAmount` and `maximumTopUpAmount` to server's getClientConfig response. Mobile uses returned values, falls back to constants only on /config failure.

### MED-143 — wallet-topup top-up flow opens checkoutUrl via Linking.openURL — same orphan-payment risk as CRIT-74
**File:** [apps/mobile/app/customer/wallet-topup.tsx:48-72](apps/mobile/app/customer/wallet-topup.tsx#L48)
On success, the top-up creates a payment intent + opens PayMongo URL via `Linking.openURL`. If user closes the PayMongo browser without paying, the topUpId is created on the server (via webhook flow `topup_${userId}_${timestamp}` per B05/MED-43) but no money lands in the wallet. There's no "retry top-up" affordance — user comes back to the wallet tab and sees no change. They tap Top Up again → creates a new payment intent → another orphan if they abandon.

**Fix:** same dispatch shape as CRIT-74. Server should track pending top-ups; mobile should display them as "Top-up in progress — complete payment" with a retry link.

### MED-144 — payment-methods screen is read-only marketing copy, not actual payment method management
**File:** [apps/mobile/app/customer/payment-methods.tsx](apps/mobile/app/customer/payment-methods.tsx)
The screen shows the 5 available payment methods as informational cards. **There's no save-card functionality.** Customer can't pre-add cards, can't see which method they used last, can't set a default. PayMongo handles card details transactionally. This is a defensible product choice for v1.0 (PCI scope reduction) but the screen is misleadingly titled "Payment Methods" — implies management. Consider renaming to "How payments work" or adding an "Available at checkout" header.

### MED-145 — Mobile platform.config has cancellation policy comment but no other "DB-backed" warnings for VAT / commission
**File:** [apps/mobile/src/config/platform.config.ts:29-33](apps/mobile/src/config/platform.config.ts#L29)
The cancellation policy section explicitly says "values now live on the server in cancellation_policies (admin-editable)... never reintroduce literal tier values here." But VAT, commission rates, service fee — same problem (CRIT-81) — have no equivalent warning. Easy for a future engineer to think the constants here are canonical. Add the same anti-drift comment block above commissionRates / serviceFeeRate.

### MED-146 — `Routes` constants include 20+ screens that don't exist
**File:** [apps/mobile/src/config/navigation.ts](apps/mobile/src/config/navigation.ts)
Audit of CUSTOMER routes vs actual files:
- `HOME: '/customer/home'` — no file (uses (tabs)/home)
- `WALLET: '/customer/wallet'` — no file (CRIT-79)
- `SETTINGS: '/customer/settings'` — no file (CRIT-80)
- `PROFILE: '/customer/profile'` — no file (uses (tabs)/profile)
- `SUBCATEGORY: '/customer/subcategory/[id]'` — no file
- `BOOKING_HISTORY: '/customer/bookings'` — no file (uses (tabs)/bookings)
- `PROVIDER_LIST: '/customer/providers'` — no file
- `BUSINESS_*` (8 routes) — no files visible in customer/ tree
- `SERVICE_AREAS`, `WAITLIST`, `SLOT_WAITLIST`, `REBOOKING` — no files
- `DATA_PRIVACY`, `DATA_EXPORT`, `ACCOUNT_DELETION` — no files (data-rights.tsx exists, account-management.tsx exists, but Routes constants don't point to them)
- `SECURITY_SETTINGS`, `DEVICE_MANAGEMENT`, `ACCESSIBILITY_SETTINGS` — no files
- `EMAIL_VERIFICATION` — no file
- `ADD_ADDRESS`, `ADD_PAYMENT` — no files
- `PROMOTIONS`, `SUPPORT` — no files

Most are "planned but not built" constants. Risk: future engineer pushes a `router.push(Routes.CUSTOMER.BUSINESS_DETAIL)` and gets a runtime 404.

**Fix:**
- Delete unused Routes constants. If a screen doesn't exist yet, the constant shouldn't either.
- OR: add a build-time check that every Route constant points to a file that exists in `apps/mobile/app/`.

### MED-147 — wallet-topup top-up button shows "Add ₱X to Wallet" — but if URL is broken, customer has no idea why nothing happens
**File:** [apps/mobile/app/customer/wallet-topup.tsx:73-77](apps/mobile/app/customer/wallet-topup.tsx#L73)
The error handler shows "Could not process top-up." Once CRIT-69 (mobile error shape) is fixed, this could surface the actual server message. Until then, customer sees a generic error and doesn't know if it's their balance, the network, the server, or a 404.

---

## LOW / INFO

- **wallet-topup.tsx** has a clean UX: 6 quick-amount presets, custom input, payment method selection, balance card. UI is fine — it's the API call underneath that's broken.
- **payment-methods.tsx** is intentionally informational. Escrow + PayMongo trust copy is consistent.
- **navigation.ts** Bug 1185 fix (single source of truth for routes) is a good architectural pattern, but the dead-routes (CRIT-79, CRIT-80, MED-146) erode the value.
- **buildRoute helper** at navigation.ts:161-174 throws on missing params — defensive, good.
- **Mobile platform.config has the SiguradoShield removal comment** documented (lines 52-58). Consistent with server-side D04 work.
- **Cancellation policy correctly removed from mobile platform.config** (lines 29-33). Server-canonical via /api/v1/settings/cancellation-policy.

---

## What's left in Phase D

- Account management + data rights + terms (3 screens, ~1,103 lines) — NPC compliance
- Smaller booking-flow screens (5 files, ~1,058 lines)
- Other customer screens (provider profile, addresses, chat, search, suki, recurring, etc.) (~3,000 lines)
- Mobile shared services + components (push, recurring, booking-photo, socket, catalog, review, tip, auth-migration, config) (~1,500 lines)
- Mobile stores (auth, booking, pricing) (~370 lines)

Continuing.
