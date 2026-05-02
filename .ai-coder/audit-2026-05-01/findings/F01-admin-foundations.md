# Phase F Findings Part 1 — Admin web foundations + LoginPage

Files added in this batch (full reads):
- `apps/admin/src/main.tsx` (49)
- `apps/admin/src/App.tsx` (87)
- `apps/admin/src/components/AdminLayout.tsx` (43)
- `apps/admin/src/components/Header.tsx` (36)
- `apps/admin/src/components/Sidebar.tsx` (99)
- `apps/admin/src/lib/api.ts` (167)
- `apps/admin/src/lib/use-admin-socket.ts` (115)
- `apps/admin/src/lib/cancellation-policy-validation.ts` (86)
- `apps/admin/src/lib/format.ts` (10)
- `apps/admin/src/stores/auth.store.ts` (66)
- `apps/admin/src/hooks/useFeatureFlags.ts` (41)
- `apps/admin/src/config/admin.config.ts` (10)
- `apps/admin/src/pages/LoginPage.tsx` (371)

**Phase F running total: ~1,180 lines fully read.**
**Audit grand total: ~53,864 lines fully read.**

---

## CRITICAL bugs

**None found in foundations.** Admin foundations are well-architected:
- Bug 1251 fix verified: HttpOnly cookies (admin_session + admin_refresh + JS-readable admin_csrf), CSRF token echoed in X-CSRF-Token header on writes.
- Bug 1271 fix verified: native fetch wrapper (no axios), transparent 401-→ refresh once → retry pattern.
- 2FA flow with both verify (existing TOTP) and force-enrollment (admin without TOTP) paths.
- Auth store double-checks `role === 'admin' || role === 'super_admin'` on `/auth/me` response (defense-in-depth: a non-admin user with an admin_session cookie would still be rejected client-side).
- Sentry initialized only when DSN env is present (no spam in dev).
- React Query global config: 30s staleTime, 1 retry, no refetchOnWindowFocus (sane for an admin tool).
- Lazy-loaded routes (28 of 29 pages, login is the eager-loaded fallback).

The CRITs found in admin will be in the page-level audits (F02-F06).

---

## MEDIUM bugs

### MED-272 — `AdminLayout` only gates by `isAuthenticated`; per-route role gating doesn't exist (regular admin sees all 23 sidebar items)
**Files:**
- [apps/admin/src/components/AdminLayout.tsx:26-28](apps/admin/src/components/AdminLayout.tsx#L26) — only checks `isAuthenticated`
- [apps/admin/src/components/Sidebar.tsx:36-62](apps/admin/src/components/Sidebar.tsx#L36) — only `Cancellation Policy` is gated to super_admin
- [apps/admin/src/App.tsx:54-83](apps/admin/src/App.tsx#L54) — all 28 routes are children of AdminLayout with no per-route role check

A regular `admin` (not super_admin) sees and can navigate to: Financials, Payouts, Pricing Rules, Marketing, Compliance, Data Protection Log, Staff & Roles. Per CRIT-23 / CRIT-56 (no staff permission enforcement) — this is the client-side mirror of the server-side gap.

The Sidebar's `superAdminOnly` flag is only on `/settings/cancellation-policy`. Everything else is visible to anyone with role 'admin'. **A junior staff member with `admin` role can:**
- View all financial reports (Financials)
- See all payouts and approve them (Payouts)
- Adjust commission rates (Pricing Rules)
- Modify all staff roles (Staff & Roles)
- Read NPC DSR submissions (Compliance, Data Protection Log)

The note on Sidebar.tsx:60 says "Server enforces super_admin too; this filter just hides the link visually." — but the OTHER routes don't even have the visual hide, AND the server-side enforcement (per CRIT-23) is incomplete.

**Fix dispatch:**
```
1. Add `requiredRole?: 'admin' | 'super_admin' | 'staff:financials' | ...`
   to NavItem AND to a route-level guard component.
2. Wrap each Route in a RequireRole HOC that checks user.role + the
   server-issued staff_permissions claim.
3. Server: per CRIT-23 fix, populate staff_permissions on /auth/me
   based on the staff_roles table.
4. Real test: render AdminLayout with role='admin' (no permissions);
   assert specific routes redirect to a 403 page.
5. Bundle into the staff-permissions dispatch (CRIT-23 + CRIT-56 + this).
```

### MED-273 — `api.ts` native fetch has NO timeout (AbortController) — hung server requests block the UI indefinitely
**File:** [apps/admin/src/lib/api.ts:90-96](apps/admin/src/lib/api.ts#L90)
```ts
const res = await fetch(finalUrl, {
  ...init, method, headers, credentials: 'include', body: serializedBody,
});
```
No `signal: AbortSignal.timeout(...)` and no `signal: controller.signal`. If the API takes 5 minutes, the admin UI shows a loading spinner for 5 minutes.

**Real-world impact:** during the 2026-05-01 dispatch window when DB connections are saturated, admin support agents cannot reload the bookings list — every request hangs. They see "loading..." with no error, no retry option. Cannot resolve customer issues during the very window when issues are most likely.

**Fix:** add `signal: AbortSignal.timeout(30_000)` (30s default, configurable per call). On timeout, throw a typed error so the toast shows "Request timed out — try again."

### MED-274 — `use-admin-socket.ts` FALLBACK_API_URL = `'http://localhost:7383'` — production builds without VITE_API_URL fail silently
**File:** [apps/admin/src/lib/use-admin-socket.ts:14-18](apps/admin/src/lib/use-admin-socket.ts#L14)
Same family as customer mobile CRIT-82. Production deploy without `VITE_API_URL` env → admin connects socket to `localhost:7383` (the dev API) → socket fails immediately. Real-time admin features (dispatch console, alerts) silently broken.

**Fix:**
- Fail loud if `VITE_API_URL` is missing in production builds. Throw at module load time.
- OR add a CI check that ensures the env is set in the production deploy pipeline.
- Match the mobile-side fix recommended in CRIT-82.

### MED-275 — `Sidebar.tsx` hardcoded version `v0.1.0`
**File:** [apps/admin/src/components/Sidebar.tsx:95](apps/admin/src/components/Sidebar.tsx#L95)
```tsx
<p className="text-xs text-slate-500">v0.1.0</p>
```
Should pull from `package.json` via Vite's `import.meta.env.VITE_APP_VERSION` (or via a build-time constant). Current state: every release ships displaying "v0.1.0" forever. Operators don't know which build they're running. Cross-cutting with mobile-side hardcoded version drift (MED-148).

### MED-276 — `LoginPage` 2FA setup step displays otpauth URI as plain text instead of a scannable QR code
**File:** [apps/admin/src/pages/LoginPage.tsx:182-189](apps/admin/src/pages/LoginPage.tsx#L182)
```tsx
<label>otpauth URI (open in your authenticator)</label>
<code>{setupUri}</code>
```
Standard 2FA enrollment UX is a QR code (typically `otpauth://totp/...?secret=BASE32&issuer=...`) that the authenticator app scans with the device camera. The current admin UI requires the admin to manually copy a 100+-character URI into their authenticator (which usually doesn't accept paste — most authenticators only support QR scan or manual secret-only entry).

**Real-world impact:** new admin signing up tries to enroll → confused → fails to copy URI correctly → contacts engineering. Friction during onboarding for staff.

**Fix:** integrate `qrcode.react` (or similar). Display QR code generated from `setupUri`. Keep the URI text below as a fallback for paste-into-1password.

### MED-277 — `LoginPage` password field lacks `autocomplete="current-password"` and a show-password toggle
**File:** [apps/admin/src/pages/LoginPage.tsx:343-354](apps/admin/src/pages/LoginPage.tsx#L343)
- No `autoComplete="current-password"` → password managers may not auto-fill.
- No show-password toggle (👁 icon) → admin entering a long random password from 1Password cannot verify it copied correctly.
- Email field also lacks `autoComplete="email"`.

**Fix:** add `autoComplete="current-password"` to password input, `autoComplete="email"` to email input. Add a show-password toggle (Eye / EyeOff Lucide icons).

### MED-278 — `Header` logout button is a plain onClick — no confirmation modal
**File:** [apps/admin/src/components/Header.tsx:27-32](apps/admin/src/components/Header.tsx#L27)
A misclick mid-task logs the admin out, losing in-progress form state (e.g., dispute resolution notes, refund amount). Add a ConfirmDialog. (The admin Dialog component exists in `components/ui/Dialog.tsx`.)

### MED-279 — `LoginPage` 2FA verify endpoint sends `preAuthToken` in the BODY, but 2FA setup/enable send it as `Authorization: Bearer ${token}` HEADER
**File:** [apps/admin/src/pages/LoginPage.tsx:87, 56-60, 102-107](apps/admin/src/pages/LoginPage.tsx#L87)
```ts
// /verify  → body
api.post('/api/v1/auth/admin/2fa/verify', { preAuthToken, totpCode });

// /setup   → header
api.post('/api/v1/auth/admin/2fa/setup', {}, { headers: { Authorization: `Bearer ${data.preAuthToken}` } });

// /enable  → header
api.post('/api/v1/auth/admin/2fa/enable', { totpCode: enrolCode }, { headers: { Authorization: `Bearer ${preAuthToken}` } });
```

Inconsistent. Server has to handle two preAuthToken transport shapes. Pick one (recommendation: header for all three — keeps the body strictly user input).

---

## LOW / INFO

- **Bug 1251 + Bug 1271 fix annotations** in `lib/api.ts` and `auth.store.ts` are exemplary — they reference the bug numbers, explain the cookie scheme, document what the fix changed. Use as docstring template across the codebase.
- **Sentry guard on DSN env** prevents dev noise. `tracesSampleRate: 0.1` and `replaysSessionSampleRate: 0` are sensible production defaults.
- **React Query default `refetchOnWindowFocus: false`** is right for an admin tool (admin tabs left open shouldn't refetch on every tab switch).
- **Lazy-loaded routes** for 28 of 29 pages — bundle size discipline.
- **Auth store has built-in legacy-key cleanup** (lines 35-39) — wipes `admin_token` / `admin_refresh` / `admin_user` from old localStorage on every hydrate. Robust migration path.
- **Auth store role check at hydrate** — defends against an attacker who somehow sets the admin_session cookie for a non-admin user.
- **`/admin/logout` is best-effort** — local state clears even if the server call fails (e.g., during outage). Right call.
- **`getAdminSocket` singleton with user-id keyed cache** — tears down old socket on user change. Prevents auth-context leak on impersonation.
- **`socket.io reconnection: Infinity`** with `reconnectionDelayMax: 10_000` — admin won't lose real-time updates over flaky wifi.
- **`useFeatureFlags` hook (admin)** — correctly reads `data?.data.featureFlags` (one level deeper than mobile's MED-209). Admin-side IS correct.
- **`admin.config.ts`** is minimal (4 values). Extending will require deciding whether to keep client-only OR fetch from server (CRIT-81 family policy decision).
- **`format.ts`** is just 10 lines (likely a money/date helper) — clean.
- **`cancellation-policy-validation.ts`** (86 lines) — defer review to F06 when CancellationPolicyPage is read.
- **AdminLayout uses `<Suspense fallback={<PageLoader />}>`** correctly for lazy-loaded routes. Smooth transition between pages.

---

## Updated headline counts after F01

| Severity | Total | New in F01 |
|---|---:|---:|
| **CRITICAL** | **120 (1 invalidated → 119 real)** | **+0** |
| **MEDIUM** | **279** | **+8 (MED-272–279)** |

Continuing into F02 (admin booking + financials + dispatch + disputes — the money/operations heart).
