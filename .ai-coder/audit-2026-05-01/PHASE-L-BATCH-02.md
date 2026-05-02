# Phase L Batch 2 — admin layout + lib + hook (8 files, ~597 lines)

## Files fully read
- apps/admin/src/components/AdminLayout.tsx (43)
- apps/admin/src/components/Header.tsx (36)
- apps/admin/src/components/Sidebar.tsx (99)
- apps/admin/src/lib/api.ts (167)
- apps/admin/src/lib/format.ts (10)
- apps/admin/src/lib/use-admin-socket.ts (115)
- apps/admin/src/lib/cancellation-policy-validation.ts (86)
- apps/admin/src/hooks/useFeatureFlags.ts (41)

## Findings

### MED-L02 — admin api.ts has correct getErrorMessage helper; mobile api.ts doesn't export an equivalent
**Where found:** apps/admin/src/lib/api.ts:163-167
```ts
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const axish = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return axish?.response?.data?.error?.message ?? axish?.message ?? 'An unexpected error occurred.';
}
```
**Understood:** Admin handles both ApiError (the wrapper's own throw shape) AND axios-shape (for any axios calls left over). This works correctly — server messages display. Mobile api.ts (apps/mobile/src/services/api.ts) defines the same `ApiError` class but never exports a matching helper. Result: every mobile screen manually parses `axErr?.response?.data?.error?.message` (axios shape only), misses `ApiError.message` (the new shape that's actually thrown), and falls back to generic text. Same root cause as MED-K04 — the fix lives here.

**Fix:** Add the same `getErrorMessage` helper to apps/mobile/src/services/api.ts and rewrite all 8+ mobile screens to use it. Eliminates MED-K04 family.

### MED-L03 — admin + mobile useFeatureFlags expect different response shapes for the same endpoint
**Where found:**
- apps/admin/src/hooks/useFeatureFlags.ts:33-38 — expects `data.data.featureFlags` (double-nested)
- apps/mobile/src/hooks/useFeatureFlags.ts:30-39 — expects `data.featureFlags` (single-nested)

**Understood:** Both call `GET /api/v1/config`. They each parse the response differently. Either:
- (a) The server returns `{ success: true, data: { featureFlags: {...} } }` — admin's reading is correct (the `.data` extracts the envelope's data field, then `.featureFlags`), mobile is broken (returns undefined → defaults to OFF, hides v1.0-pulled features but also any other flags).
- (b) The server returns flat `{ featureFlags: {...} }` — mobile is correct, admin gets undefined → defaults to OFF.

**Fix:** Phase N reading of `/api/v1/config` route confirms the canonical shape. Update whichever is wrong. Add a Zod schema on the response so future drift is caught at parse time.

### POSITIVE — AdminLayout.tsx
- Auth gate at layout level. isLoading shows spinner; not authenticated → Navigate to /login.
- Outlet wrapped in Suspense with PageLoader for lazy-loaded routes.

### POSITIVE — Header.tsx
- Logout button. Shows admin role.

### POSITIVE — Sidebar.tsx
- 23 nav items. `superAdminOnly` filter on the cancellation-policy editor.
- Comment confirms "Server enforces super_admin too" (defense in depth).

### POSITIVE — api.ts (Bug 1271 + 1251 fixes verified)
- Native fetch wrapper. CSRF token from `admin_csrf` cookie included on all non-safe methods.
- credentials: 'include' for cookie auth.
- One-retry refresh on 401, redirects to /login on refresh fail.
- getErrorMessage helper handles both error shapes (mobile's lacking equivalent — see MED-L02).

### POSITIVE — format.ts
- Trivial PHP formatter, en-PH locale.

### POSITIVE — use-admin-socket.ts (Bug 1251 fix verified)
- Singleton socket. Re-creates when user.id changes (impersonation safety).
- withCredentials: true — relies on admin_session cookie, not localStorage tokens.
- reconnectionAttempts: Infinity but reconnectionDelayMax: 10s caps retry rate.

### POSITIVE — cancellation-policy-validation.ts (Bug 1170-admin-ui)
- Real validation logic (not stub): refund+fee=100, top tier max=null, monotonic min_hours_before, boundary equality, bottom tier covers post-scheduled.
- previewOutcome computes refund/fee for a given hours-before-scheduled.

### POSITIVE — useFeatureFlags.ts (admin)
- Defaults OFF for both flags. 5-min staleTime.

## Cumulative Phase L progress: 12 / ~36 files (~809 lines)
