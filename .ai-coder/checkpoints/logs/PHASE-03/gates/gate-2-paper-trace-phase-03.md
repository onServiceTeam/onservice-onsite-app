# Paper-trace — Phase 03 (Runtime Config)

Each trace walks a runtime path step-by-step from input to side effect, citing
file/line so the reasoning is reproducible.

---

## Trace 1 — `getSetting('service_fee_rate')` cold-cache fallback chain

1. Caller `commission.service.ts:33` invokes `settingsService.getSettingPercent('service_fee_rate')`.
2. `getSettingPercent` (`settings.service.ts:159`) calls `getSetting(key)`.
3. `getSetting` (`settings.service.ts:118`) attempts `redis.get('settings:service_fee_rate')`.
4. Redis MISS (returns `null`) → caught path runs `db.query(SELECT value FROM platform_settings WHERE key = $1 AND is_active = TRUE)`.
5. DB returns `[{ value: '10' }]`. The string `'10'` is written to Redis with TTL=60.
6. Return value `'10'` flows back to `getSettingPercent`, which returns `0.10`.
7. `commission.service.ts` multiplies `servicePrice × 0.10` to compute `serviceFeeAmount`.

If both Redis and DB miss, step 4's `result.rows.length === 0` falls through to
`SETTING_DEFAULTS['service_fee_rate'] = '10'` (`settings.service.ts:144`).

If even the in-memory map lacks the key, `createAppError('Setting "X" not found.', 404)`
is thrown (`settings.service.ts:148`).

---

## Trace 2 — Admin updates `service_fee_rate` from 10 to 12

1. UI: `SystemSettingsPage.tsx` mutation calls `PUT /api/v1/admin/settings/service_fee_rate { value: '12', reason: 'tuning' }`.
2. Express dispatch hits `settings.routes.ts:91` → guards `authMiddleware` + `rbacMiddleware('admin','super_admin')`.
3. Handler calls `settings.service.updateSetting('service_fee_rate', '12', userId, 'tuning', req.ip, ua)`.
4. `updateSetting` (`settings.service.ts:243`) `SELECT * FROM platform_settings WHERE key = $1` to fetch existing row.
5. `validateSettingValue` (`settings.service.ts:212`) confirms `12` is numeric, integer/range OK.
6. `UPDATE platform_settings SET value=$1, updated_by=$2, updated_at=NOW() WHERE key=$3 RETURNING *`.
7. `INSERT INTO platform_settings_audit (...)` writes prior + new value, reason, IP, UA.
8. `bustCache(key)` deletes `settings:service_fee_rate` and `settings:__all__` from Redis.
9. `logger.info('Platform setting updated', {...})` records the change (sensitive values redacted).
10. Next call to `getSetting('service_fee_rate')` re-warms cache from DB with the new value `'12'`.

---

## Trace 3 — `commission.service.calculateCommission(50000, 'pro')`

1. `await getCommissionRate('pro')` → `getSettingPercent('commission_rate_pro')` → `0.11`.
2. `commissionAmount = round(50000 × 0.11) = 5500`.
3. `await getSettingPercent('service_fee_rate')` → `0.10` → tentative fee `5000`.
4. `await getSettingNumber('service_fee_min')` → `2500`. `await getSettingNumber('service_fee_max')` → `50000`. `serviceFeeAmount` clamped → `5000`.
5. `await getSettingPercent('guarantee_fund_rate')` → `0.015`. `guaranteeFundContribution = round(5000 × 0.015) = 75`.
6. `providerReceives = 50000 − 5500 = 44500`. `platformRetains = 5500 + 5000 = 10500`.
7. Conservation: `providerReceives + platformRetains = 55000 = servicePrice + serviceFeeAmount`. ✓

---

## Trace 4 — `calculateCancellationRefund(100000, 1.5h, false, false)`

1. Hours-until-scheduled = 1.5. Skip no-show, skip arrived branches.
2. `1 ≤ 1.5 < 2` → `getSettingNumber('cancel_refund_1_to_2h')` → `90`.
3. `customerRefundPercent = 90 / 100 = 0.90`.
4. `customerRefundAmount = round(100000 × 0.90) = 90000`.
5. `providerCompensationAmount = 100000 − 90000 = 10000`.
6. Conservation: `90000 + 10000 = 100000`. ✓

This is a **behavioral change** vs Phase 02 (which returned 80% for the 1-2h
band). The new schedule mirrors `RUNTIME-CONFIG-SYSTEM-SPEC.md PART 7`.

---

## Trace 5 — Mobile cold-start `fetchPlatformConfig()`

1. `apps/mobile/app/_layout.tsx:RootLayout.useEffect` runs `hydrate()` then `void fetchPlatformConfig()`.
2. `config.service.ts:fetchPlatformConfig` issues `axios.get(\`${apiUrl}/api/v1/config\`, { timeout: 5000 })`.
3. Server route `server.ts: app.get('/api/v1/config')` calls `settingsService.getClientConfig()`.
4. `getClientConfig` (`settings.service.ts:380`) reads ~14 settings via `getSettingNumber`/`getSettingInteger`/`getSettingPercent`. Each follows trace 1's fallback chain.
5. Response shape `{ success: true, data: {...} }` is merged over `platformConfig` defaults; mutated `cachedConfig` is stored in module scope.
6. Errors are silently swallowed — `cachedConfig` remains the last good state (or hardcoded defaults on first run).
7. Other services calling `import { platformConfig }` continue to work unchanged this phase; mobile screens migrate to `getConfig()` in a later phase (see HONESTY-CHECK).

---

## Trace 6 — Settings routes mount order matters

1. `server.ts` mounts `app.use('/api/v1/admin/settings', settingsRoutes)` BEFORE `app.use('/api/v1/admin', adminRoutes)`.
2. Inside `settings.routes.ts`, route order matters too: `POST /cache/flush` is registered BEFORE `GET /:category`, otherwise Express treats `cache` as a `:category` param.
3. Old `admin.routes.ts: GET /settings` and `PUT /settings/:key` handlers were removed in this phase; their replacements live entirely under `settingsRoutes`.

---

## Trace 7 — `rate-limit.middleware.ts` periodic refresh

1. Module load: `currentWindow = platformConfig.rateLimitWindowMs`, `currentMax = platformConfig.rateLimitMaxRequests` (hardcoded fallback).
2. `void refreshRateLimits()` immediately schedules a settings-backed refresh.
3. `setInterval(refreshRateLimits, 60_000).unref()` keeps the values in sync.
4. **Known limitation:** `rateLimit({ windowMs: currentWindow, max: currentMax })` is constructed once and reads the values at construction. The 60s refresh updates the module variables but does not propagate into the live limiter. Bouncing the API process picks up new limits. Documented in HONESTY-CHECK.

---

## Trace 8 — Admin SystemSettingsPage CRUD round-trip

1. Initial mount → `useQuery(['admin-settings-all'])` → `GET /api/v1/admin/settings` → `{ categories, settings: {category: Setting[]} }`.
2. Click sidebar category → `setActiveCategory(c.category)`. The cached `settings` map filters in-memory; no extra round-trip.
3. Click Pencil → `startEdit(s)` opens inline input + reason field.
4. Click Save → `updateMutation.mutate({ key, value, reason })` → `PUT /api/v1/admin/settings/:key`.
5. On success → banner `Saved "<key>"`, mutation `onSuccess` invalidates `['admin-settings-all']`, query refetches.
6. Click Reset → `resetMutation.mutate(key)` → `POST /api/v1/admin/settings/:key/reset`. Disabled when `isDefault`.
7. Click History → `setHistoryKey(key)` → `useQuery(['admin-settings-history', key])` → `GET /api/v1/admin/settings/:key/history?limit=50` → renders inline list.
8. Click Flush cache → `POST /api/v1/admin/settings/cache/flush` → invalidates the same query key.

---

## Trace 9 — Migration 050 destructive drop+seed

1. Phase 02 left a simple `platform_settings (key, value, description, ...)` table from migration 038.
2. Migration 050 starts with `DROP TABLE platform_settings_audit, platform_settings CASCADE;` — **destructive but safe** at this point because no production data was loaded. Drop is documented in HONESTY-CHECK.
3. New schema (`id uuidv7`, `category`, `key UNIQUE`, `value`, `default_value`, `value_type`, `min_value/max_value/allowed_values`, `is_sensitive`, …) is created.
4. Seed `INSERT ... ON CONFLICT (key) DO NOTHING` populates ~60 settings across 9 categories with the values listed in PHASE-DOC step 3.
5. Migration 051 adds `platform_settings_audit` (FK to `platform_settings.id ON DELETE CASCADE`).
