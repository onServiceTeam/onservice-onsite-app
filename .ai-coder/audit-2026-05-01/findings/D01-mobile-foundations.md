# Phase D Findings Part 1 — Mobile Foundations + Auth Screens

Files read in full this batch:
- `apps/mobile/src/services/api.ts` (251) — HTTP client wrapper
- `apps/mobile/src/services/secure-storage.ts` (164) — encrypted MMKV (Bug 1061 fix)
- `apps/mobile/app/_layout.tsx` (119) — root layout, boot sequence
- `apps/mobile/app/index.tsx` (86) — splash screen / initial routing
- `apps/mobile/app/onboarding.tsx` (206) — 3-slide intro carousel
- `apps/mobile/app/auth/_layout.tsx` (13)
- `apps/mobile/app/auth/login.tsx` (121)
- `apps/mobile/app/auth/otp-verify.tsx` (143)
- `apps/mobile/app/auth/register.tsx` (149)

**Phase D running total: ~1,252 lines fully read.**
**Audit grand total: ~20,926 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-67)

### CRIT-68 — Mobile API client refresh-token has no mutex (parallel 401s burn token)
**File:** [apps/mobile/src/services/api.ts:174-214](apps/mobile/src/services/api.ts#L174)
```ts
async function refreshOnce(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  ...
  storeTokens(data.accessToken, data.refreshToken ?? refreshToken);
  return data.accessToken;
}

async function request<T>(...) {
  if (err.status === 401 && !isRetry) {
    const newToken = await refreshOnce();
    if (newToken) return await request<T>(url, { ...init, _bearerOverride: newToken }, true);
    clearTokens();
    ...
  }
}
```
Mobile clients commonly fire many requests in parallel (home screen mounts → 5 widgets each fetch). When the access token expires:
1. All 5 requests get 401 simultaneously.
2. All 5 call `refreshOnce` in parallel.
3. First request hits server, server DELETES old refresh token (auth.service.ts:330 verified in C02), returns new pair.
4. Requests 2-5 hit the server with the SAME old refresh token — server says 401 (token not found in DB).
5. All 5 requests then `clearTokens()` and the user is logged out — **even though the first refresh succeeded and stored new tokens**.

The race between `storeTokens` (line 184) and the subsequent reads doesn't help because the parallel requests all started their refresh BEFORE that store completed.

**Fix dispatch:**
```
1. Add a single-flight refresh promise:
   let pendingRefresh: Promise<string | null> | null = null;
   async function refreshOnce(): Promise<string | null> {
     if (pendingRefresh) return pendingRefresh;
     pendingRefresh = (async () => {
       try {
         // existing refresh logic
       } finally {
         pendingRefresh = null;
       }
     })();
     return pendingRefresh;
   }
2. Test: simulate 5 concurrent 401 responses, assert only 1 actual refresh request to /auth/refresh-token, all 5 retries succeed with the new token.
3. Pair with the server-side CRIT-53 fix (refresh-token replay detection) — once both land, parallel refreshes converge cleanly.
```

### CRIT-69 — Mobile auth screens display generic fallback error instead of server message
**Files:**
- [apps/mobile/app/auth/login.tsx:37-40](apps/mobile/app/auth/login.tsx#L37)
- [apps/mobile/app/auth/otp-verify.tsx:58-60](apps/mobile/app/auth/otp-verify.tsx#L58)
- [apps/mobile/app/auth/register.tsx:49-51](apps/mobile/app/auth/register.tsx#L49)

```ts
const axErr = err as { response?: { data?: { error?: { message?: string } } } };
const msg = axErr?.response?.data?.error?.message;
Alert.alert('Error', msg ?? 'Failed to send verification code. Please try again.');
```
The error shape is **axios-style** (`err.response.data.error.message`). But `api.ts` is **fetch-based** (Bug 1271 fix) and throws `ApiError` with `err.body.error.message`. So `axErr.response` is always undefined → users always see the generic fallback regardless of what the server actually said.

Specific server errors that NEVER reach the user:
- "Too many attempts. Please try again later." (lockout)
- "Maximum attempts exceeded. Please request a new code." (OTP exhausted)
- "Invalid code. 1 attempt remaining." (specific count)
- "Please wait 60 seconds before requesting a new code." (cooldown)

Users are stuck retrying with no clue about state.

**Fix dispatch:**
```
1. Build a helper:
   function extractErrorMessage(err: unknown, fallback: string): string {
     if (err instanceof ApiError && err.body?.error?.message) return err.body.error.message;
     if (err instanceof Error) return err.message;
     return fallback;
   }
2. Replace the `axErr` pattern in:
   - apps/mobile/app/auth/login.tsx:37-40
   - apps/mobile/app/auth/otp-verify.tsx:58-60
   - apps/mobile/app/auth/register.tsx:49-51
   - any other screen with this pattern (Grep for 'axErr.response?.data?.error?.message')
3. Test: server returns `{ success: false, error: { message: 'Too many attempts.' } }`, login screen shows that exact message, not the fallback.
```

### CRIT-70 — Mobile register flow can leave user with empty profile if register call fails after verifyOtp
**File:** [apps/mobile/app/auth/otp-verify.tsx:43-46](apps/mobile/app/auth/otp-verify.tsx#L43)
```ts
if (params.mode === 'register' && params.firstName && params.lastName) {
  await verifyOtp(params.phone, otp);          // creates user (CRIT-52)
  await register(params.phone, params.firstName, params.lastName);  // sets names
  router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT);
}
```
`verifyOtp` is the call that triggers server-side `verifyOtp` → which AUTO-CREATES user with empty names (CRIT-52). The follow-up `register(phone, firstName, lastName)` is supposed to update the names.

**If `register` fails** (network blip, server error, validation failure): user exists with empty names + valid JWT + verified flag. They can use the app. They get "Hello !" greetings forever.

This is the mobile manifestation of the server-side CRIT-52. Once CRIT-52 is fixed (server requires explicit registration step), this becomes moot.

**Interim fix:**
```
1. In otp-verify.tsx, wrap both calls in try/finally:
   try {
     await verifyOtp(phone, otp);
     await register(phone, firstName, lastName);
   } catch (err) {
     // If register fails AFTER verifyOtp, log the user out so they can retry from scratch.
     await useAuthStore.getState().logout();
     throw err;
   }
2. Long-term: implement CRIT-52 server fix.
```

---

## MEDIUM bugs

### MED-115 — Mobile API client doesn't combine caller signal with timeout signal
**File:** [apps/mobile/src/services/api.ts:135-145](apps/mobile/src/services/api.ts#L135)
```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
...
res = await fetch(finalUrl, {
  ...init,
  signal: init.signal ?? controller.signal,  // ← caller wins
});
```
If a caller passes their own AbortSignal (e.g., React Query cancel), the 15-second timeout NEVER fires. Stuck requests hang the React Query loading state forever.

**Fix:** combine both signals via `AbortSignal.any([init.signal, controller.signal].filter(Boolean))` (Node 20+, available in React Native ≥0.74).

### MED-116 — Mobile API client doesn't set Accept header
**File:** [apps/mobile/src/services/api.ts:121-123](apps/mobile/src/services/api.ts#L121)
Server might respond with `text/html` for unhandled paths. Without `Accept: application/json`, parsing fails silently. Set it.

### MED-117 — refreshOnce reuses old refresh token if server doesn't return a new one
**File:** [apps/mobile/src/services/api.ts:184](apps/mobile/src/services/api.ts#L184)
```ts
storeTokens(data.accessToken, data.refreshToken ?? refreshToken);
```
Server-side `refreshAccessToken` (auth.service.ts:330) DELETES the old refresh token. If the response is malformed (only accessToken, missing refreshToken), client stores the OLD-and-now-invalid refresh token. Next refresh attempt fails.

**Fix:** require new refresh token in response — if missing, throw and force re-login.

### MED-118 — _layout.tsx falls through silently if secure-storage init fails
**File:** [apps/mobile/app/_layout.tsx:65-78](apps/mobile/app/_layout.tsx#L65)
On secure-storage failure (corrupted keychain, biometric disabled mid-install), Sentry captures but app continues to logged-out state. User can't log in (writes will fail). Should at least show an error screen with "Restart device" guidance.

### MED-119 — _layout.tsx fetchPlatformConfig is fire-and-forget
**File:** [apps/mobile/app/_layout.tsx:77](apps/mobile/app/_layout.tsx#L77)
```ts
void fetchPlatformConfig();
```
Same pattern as CRIT-49 (server /config silent fallback). If config fetch fails, mobile uses hardcoded defaults silently. Money math (commission rates, fees) could drift.

### MED-120 — index.tsx hardcoded 1.5s splash regardless of boot speed
**File:** [apps/mobile/app/index.tsx:19](apps/mobile/app/index.tsx#L19)
Even on a fast device with cached config, user waits 1.5s. Should navigate as soon as auth/config ready.

### MED-121 — Login/register screens have no consent checkbox for Terms / Privacy Policy
**File:** [apps/mobile/app/auth/login.tsx:90-92](apps/mobile/app/auth/login.tsx#L90), register.tsx:120-122
```ts
<Text style={styles.legal}>
  By continuing, you agree to our Terms of Service and Privacy Policy.
</Text>
```
NPC RA 10173 §11 requires unambiguous consent. Static text below the button is not unambiguous — user can submit without reading or clicking. Add an explicit checkbox + linkable Terms/Privacy that opens a modal/web view, with consent timestamp recorded server-side.

### MED-122 — Onboarding "Get Started" doesn't capture consent timestamp
**File:** [apps/mobile/app/onboarding.tsx:85-88](apps/mobile/app/onboarding.tsx#L85)
```ts
const completeOnboarding = (): void => {
  storage.set('hasOnboarded', true);
  router.replace(Routes.AUTH.LOGIN);
};
```
Just sets a local flag. No server-side record. If user clears app data, onboarding repeats; consent is "fresh" each time without server visibility.

---

## LOW / INFO

- **secure-storage.ts is well-architected** (Bug 1061 fix). Per-device encryption key in OS Keychain via `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Strong randomness via crypto.getRandomValues. Init-once, sync-after pattern keeps callers simple.
- **api.ts** correctly migrated from axios to native fetch (Bug 1271 / Article 7.1). The 15s timeout, automatic 401 retry, and refresh-token integration are clean. Just needs the mutex (CRIT-68) and the unified-error-shape (CRIT-69).
- **_layout.tsx boot sequence** correctly orders: secure-storage init → legacy migration → auth hydrate → config fetch. Boot loader for the brief async phase. Sentry init before any other imports.
- **Onboarding (Bug 860 / D04 SiguradoShield pull)** correctly replaced insurance language with escrow-only trust claim. Documented in code comment.
- **PhoneInput component** used consistently (Phase 14 R5-complete). Replaces inline phone field.
- **OTP verify auto-submits on 6 digits** — good UX.
- **Resend cooldown** correctly uses `platformConfig.otpCooldownSeconds`.

---

## What's left in Phase D

- (tabs)/_layout.tsx + 4 customer tab screens (~1,683 lines)
- Customer booking flow (~3,500 lines) — checkout, configure, form, review, tracker, [id], change-order, quotes, tip, dispute, payment-failed, complete, photos, make-recurring, job-request
- Wallet + payment + account (~1,500 lines)
- Other customer screens (chat, addresses, search, suki, etc.) (~3,000 lines)
- Mobile shared services + components + hooks remaining (~7,000 lines)

Continuing.
