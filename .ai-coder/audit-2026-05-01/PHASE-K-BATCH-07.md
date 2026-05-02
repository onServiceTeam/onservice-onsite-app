# Phase K Batch 7 — utils + remaining hooks (15 files, ~626 lines)

## Files fully read
- apps/mobile/src/utils/address.ts (35)
- apps/mobile/src/utils/cancellation-policy.ts (70)
- apps/mobile/src/utils/currency.ts (29)
- apps/mobile/src/utils/date.ts (68)
- apps/mobile/src/utils/distance.ts (17)
- apps/mobile/src/utils/haptics.ts (54)
- apps/mobile/src/utils/phone.ts (38)
- apps/mobile/src/utils/validation.ts (26)
- apps/mobile/src/hooks/useAppState.ts (56)
- apps/mobile/src/hooks/useBooking.ts (44)
- apps/mobile/src/hooks/useDebouncedValue.ts (22)
- apps/mobile/src/hooks/useFeatureFlags.ts (42)
- apps/mobile/src/hooks/useOffline.ts (49)
- apps/mobile/src/hooks/useStatusMutation.ts (57)
- apps/mobile/src/hooks/useWallet.ts (87)

## Findings

### CRIT-K11 — useWallet uses /api/v1/wallet/* (singular); payment.service uses /api/v1/wallets/* (plural). One is dead code.
**Where found:**
- apps/mobile/src/hooks/useWallet.ts:38-39 — `/api/v1/wallet/balance` and `/api/v1/wallet/transactions?pageSize=20`
- apps/mobile/src/hooks/useWallet.ts:52 — `/api/v1/wallet/top-up`
- apps/mobile/src/hooks/useWallet.ts:62 — `/api/v1/wallet/withdraw`
- apps/mobile/src/services/payment.service.ts:35 — `/api/v1/wallets` (plural)
- apps/mobile/src/services/payment.service.ts:48 — `/api/v1/wallets/top-up` (plural)
- apps/mobile/app/(tabs)/wallet.tsx:79-83 — `/api/v1/wallets/transactions` (plural)

**Understood:** Two separate code paths each call wallet endpoints, but with different URL conventions. Whichever doesn't match the server route (presumably one of these is a 404) returns failed queries. The (tabs)/wallet.tsx and (provider-tabs)/earnings.tsx screens use payment.service.ts's plural form via `getWalletBalance`. The useWallet hook uses singular and is presumably called by other screens (need to grep). At most one URL convention is the live one.

**Fix:** Phase N will confirm the canonical server path (likely plural `/api/v1/wallets/*` based on REST conventions and the wallets table in migration 005). Whichever is wrong: rewrite to match. Better — useWallet should be deleted (it duplicates payment.service.ts logic) or refactored to call payment.service functions directly.

### CRIT-K12 — useWallet expects snake_case fields, payment.service expects camelCase
**Where found:**
- apps/mobile/src/hooks/useWallet.ts:5-10 — `WalletBalance` interface uses `available_balance, pending_balance, wallet_type, created_at`
- apps/mobile/src/services/payment.service.ts:17-21 — `WalletBalance` uses `availableBalance, pendingBalance` (camelCase)

**Understood:** Even if they hit the same endpoint, the response shape mismatch means one of them parses garbage. Server likely returns one convention (Express + raw pg routes typically return snake_case from DB columns unless explicitly mapped). If server returns camelCase, useWallet returns 0/null for everything; if snake_case, payment.service returns 0/null.

The customer wallet tab (.tsx) shows balance via `getWalletBalance()` from payment.service. If it works, the server is camelCase, so useWallet is broken. If wallet tab shows ₱0 even with funds, the server is snake_case, so payment.service is broken.

**Fix:** Phase N confirms the server response shape. Then delete the duplicate hook OR rewrite to match. Add a Zod schema on the response to fail loudly on mismatch instead of silently displaying ₱0.

### MED-K23 — useOffline polls every 30s instead of using NetInfo events
**Where found:** apps/mobile/src/hooks/useOffline.ts:36-39
```ts
const interval = setInterval(() => {
  void checkConnectivity();
}, 30_000);
```
**Understood:** OfflineBanner.tsx already uses event-driven `NetInfo.addEventListener`. The useOffline hook polls every 30 seconds, draining battery and CPU even when network is stable. expo-network does NOT fire events on connectivity change (unlike NetInfo); switching to `@react-native-community/netinfo` (already a dep) would make this event-driven and cheaper.
**Fix:** Replace expo-network with @react-native-community/netinfo (already imported by OfflineBanner.tsx). Drop the 30s poll.

### MED-K16 — confirmation: PhoneInput regex is stricter than utils/phone validatePHPhone
**Where found:**
- apps/mobile/src/components/PhoneInput.tsx:16 — `PH_MOBILE_REGEX = /^(09|9)\d{9}$/` (does NOT accept +63 prefix)
- apps/mobile/src/utils/phone.ts:6 — `PH_PHONE_REGEX = /^(\+63|0)?9\d{9}$/` (DOES accept +63 prefix)

**Understood:** A user pasting "+639171234567" passes the screen's submit-time `validatePHPhone` (utils) but fails PhoneInput's inline `isValid` check, so the user sees a validation error message for what is actually a valid number. Confirms MED-K16 with concrete drift evidence.

### POSITIVE — utils/cancellation-policy.ts
- Bug 1170/1198 fix verified. Server-canonical fetch via `/api/v1/settings/cancellation-policy`.
- Two helpers: `policyToTermsText` (long, with disclaimer) + `policyToHelpAnswer` (short, FAQ).

### POSITIVE — utils/currency.ts
- Intl.NumberFormat with en-PH locale. Centavos as integers throughout. Round-trip `parsePHP` + `decimalToCentavos`.

### POSITIVE — utils/date.ts
- Hardcoded Asia/Manila timezone everywhere. formatBookingRef gives stable customer-facing OS-YYYY-XXXX ID.
- formatRelative handles future + past windows.

### POSITIVE — utils/distance.ts
- Km only, never miles (Bug pattern from earlier audits).

### POSITIVE — utils/haptics.ts
- 7 variants. Each try/caught. Platform check upfront. (Reduce-motion gating still missing — see MED-K18.)

### POSITIVE — utils/validation.ts
- Simple, readable. isValidAmount enforces integer (centavos discipline).

### POSITIVE — useAppState.ts
- 30s polling only while backgrounded (timer cleared on active). Used for the 15-min auto-offline pattern.

### POSITIVE — useBooking.ts
- Clean wrapper over Zustand store. isReadyForCheckout consolidates the gate condition.

### POSITIVE — useDebouncedValue.ts
- Standard debounce. Cleanup on unmount.

### POSITIVE — useFeatureFlags.ts
- Defaults to OFF for promoRedemptionEnabled + abTestingEnabled (correct fail-safe — Bug 44/45 pull). 5-min staleTime.

### POSITIVE — useStatusMutation.ts
- Wraps useMutation with onMutate impact + onSuccess/onError notification haptics. Forwards original onMutate/onSuccess/onError callbacks.
- (Same MED-K18: no reduceMotion gating.)

## Cumulative Phase K progress: 131 / ~140 files (~14,424 lines)
