# Phase L Batch 1 — admin core (App + main + auth.store + config) (5 files, ~222 lines)

## Files fully read
- apps/admin/src/App.tsx (87)
- apps/admin/src/main.tsx (49)
- apps/admin/src/stores/auth.store.ts (66)
- apps/admin/src/config/admin.config.ts (10)
- apps/admin/src/hooks/useFeatureFlags.ts — DEFERRED to next batch

## Findings

### MED-L01 — No 404 catch-all route in App.tsx
**Where found:** apps/admin/src/App.tsx:52-83
**Understood:** All 28 admin routes are explicitly declared. There is no `<Route path="*">` catch-all. A typo in the URL (e.g., `/customer` instead of `/customers`, or `/booking` instead of `/bookings`) renders a blank screen with no error indication. Admins debugging a stale link have no way to know the URL is wrong.
**Fix:** Add `<Route path="*" element={<NotFoundPage />} />` inside `<Route element={<AdminLayout />}>`. The NotFound page should show "Page not found" + a "Back to dashboard" link.

### POSITIVE — App.tsx
- Sentry.ErrorBoundary wraps the entire route tree with a fallback message.
- All page components are React.lazy() — code-split per route, smaller initial bundle.
- AdminLayout wraps all authenticated routes — single auth gate point.

### POSITIVE — main.tsx
- Dev-only `@axe-core/react` import surfaces accessibility violations in browser console (tree-shaken from production via `import.meta.env.DEV`).
- Sentry init guarded on `VITE_SENTRY_DSN` env var presence.
- React Query staleTime 30s + retry 1 + refetchOnWindowFocus false. Admin-appropriate.
- StrictMode + BrowserRouter + Toaster (sonner) all top-level. Clean.

### POSITIVE — auth.store.ts (Bug 1251 fix verified)
- HttpOnly cookies, never localStorage. hydrate() runs migration to wipe legacy `admin_token`/`admin_refresh`/`admin_user` keys from old localStorage.
- /api/v1/auth/me checks role is 'admin' or 'super_admin' before authenticating. Customer/provider users with valid tokens can NOT log in to admin.
- logout() does best-effort POST then clears local state regardless.

### POSITIVE — admin.config.ts
- Trivial config: defaultPageSize, maxPageSize, defaults for service area radius and min providers.

## Cumulative Phase L progress: 4 / ~36 files (~212 lines)
