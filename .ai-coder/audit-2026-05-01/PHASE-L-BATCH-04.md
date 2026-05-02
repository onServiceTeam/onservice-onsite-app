# Phase L Batch 4 — admin configs (8 files, ~277 lines)

## Files fully read
- apps/admin/vitest.setup.ts (122)
- apps/admin/vite.config.ts (22)
- apps/admin/vitest.config.ts (32)
- apps/admin/playwright.config.ts (16)
- apps/admin/src/vite-env.d.ts (15)
- apps/admin/package.json (55)
- apps/admin/vercel.json (17)
- apps/admin/tsconfig.json (18)

## Findings

### MED-L04 — vitest config swallows async errors that should fail tests
**Where found:** apps/admin/vitest.config.ts:14-26
```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./vitest.setup.ts'],
  include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  // ... comment about real null-check bugs ...
  dangerouslyIgnoreUnhandledErrors: true,
},
```
**Understood:** This flag silences unhandled async errors. The comment justifies it because pages that mount cleanly but trigger async errors during data resolution have null-check bugs that are documented per-test as it.todo. Side effect: real new async bugs in CI runs don't surface as test failures — only the explicit `expect()` assertions do. Async crashes from data fetching, useEffect, or any post-mount work fail silently. CI green doesn't mean "no bugs", it means "no synchronous expect failures."

**Fix:** Remove `dangerouslyIgnoreUnhandledErrors: true`. Convert the it.todo placeholders to explicit `it.skip()` with a TODO comment if the page legitimately can't render in jsdom. Or wrap problematic page mounts in `expect().rejects.toThrow()` to assert the known-broken behavior. Either way: don't blanket-silence async errors at the suite level.

### MED-L05 — playwright baseURL fallback doesn't match vite dev port
**Where found:** apps/admin/playwright.config.ts:7 + apps/admin/vite.config.ts:14
```ts
// playwright.config.ts:
baseURL: process.env.STAGING_ADMIN_URL ?? "http://localhost:5173",
// vite.config.ts:
server: { port: 7382, ... }
```
**Understood:** When `STAGING_ADMIN_URL` env is not set, Playwright tries to connect to `http://localhost:5173` but the admin dev server runs on port `7382` per vite.config.ts. Local Playwright runs without the env var fail with "ECONNREFUSED" and produce confusing "site couldn't be reached" errors. The 5173 default is Vite's old default; the team moved off it but Playwright wasn't updated.
**Fix:** Change playwright.config.ts:7 to `process.env.STAGING_ADMIN_URL ?? "http://localhost:7382"`.

### POSITIVE — vitest.setup.ts
- Comprehensive mocks: api, auth-store, react-router-dom, Sentry, recharts, react-leaflet.
- Stubs `globalThis.ResizeObserver` for components depending on it.
- Stubbed `useAuthStore` provides authenticated super_admin by default. Tests can override.

### POSITIVE — vite.config.ts
- React + Tailwind plugins. `@/*` path alias. Dev proxy `/api` → `http://localhost:7381` (api package).

### POSITIVE — vitest.config.ts
- jsdom environment, globals enabled, setupFiles wired.

### POSITIVE — package.json
- React 19, Tailwind 4, Vite 6, vitest 4, TypeScript 6 — bleeding-edge stack.
- shadcn/ui v4 with Radix primitives. React Hook Form + Zod for forms.
- @axe-core/react dev-only for accessibility.
- socket.io-client for real-time. recharts for analytics. leaflet for maps.

### POSITIVE — vercel.json (strong production CSP)
- script-src locked down to self + sentry-cdn + hcaptcha. img-src whitelists S3 buckets explicitly. connect-src whitelists api.onservice.ph + sentry + hcaptcha.
- X-Frame-Options DENY. nosniff. Referrer-Policy strict-origin-when-cross-origin.
- Permissions-Policy disables camera/mic/geolocation entirely (admin doesn't need them).
- frame-ancestors 'none' — clickjacking prevention.

### POSITIVE — tsconfig.json
- Strict mode. Extends workspace root. ES2024 target. bundler moduleResolution.

## Cumulative Phase L progress: 42 / 42 files (~1,993 lines) — **PHASE L COMPLETE**
