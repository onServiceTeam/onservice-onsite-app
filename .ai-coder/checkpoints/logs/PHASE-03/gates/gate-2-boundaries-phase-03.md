# Boundaries & Risk Surface — Phase 03 (Runtime Config)

Patterns intentionally introduced (or modified) by Phase 03, and the
behavioral edges callers can hit.

---

## Pattern A — Sync→Async signature change for money helpers

`commission.service.calculateCommission` and `calculateCancellationRefund` are
now `async`. Every call site MUST `await` them.

- Refactored call sites: `escrow.service.ts:80-90` (releaseEscrow), `escrow.service.ts:216` (releasePartialEscrow), `escrow.service.ts:348` (handleCancellation), 4 test files.
- Boundary: a missed `await` would silently use a `Promise<CommissionBreakdown>` as a `CommissionBreakdown`, surfacing as `NaN` for every numeric field. The TypeScript compiler catches this for any direct numeric arithmetic but not for object spreads. `npm run typecheck` is green; the entire test suite (332 tests) is green.

---

## Pattern B — Schema migration drop+recreate

`migrations/050_platform_settings_rich_schema.sql` drops the previous
`platform_settings_audit` and `platform_settings` tables (CASCADE) before
re-creating the rich schema.

- Boundary: this is **destructive**. Acceptable today because Phase 02 only
  exercised the simple key/value table in dev and no production data exists.
  Going forward, schema changes must be additive.
- Re-runnability: seeds use `ON CONFLICT (key) DO NOTHING`, so re-running
  migration 050 does not blow away admin-tuned values, only ensures the
  baseline rows exist.

---

## Pattern C — Three-tier read fallback (Redis → DB → in-memory defaults)

Every business read flows through `getSetting(key)`.

- If Redis is **down**, settings.service silently swallows the error (logged at
  `warn`) and reads from DB.
- If DB is **down**, the in-memory `SETTING_DEFAULTS` map is the last line of
  defense. Fees, commissions, and cancellation logic continue to work with
  the values shipped at deploy time.
- Edge: an unknown key with no fallback throws a 404 `AppError`. Callers must
  not invent keys at runtime.

---

## Pattern D — Settings page <-> API contract

`SystemSettingsPage.tsx` consumes the Phase 03 `formatSetting()` JSON shape:
`{ id, category, key, label, valueType, value, defaultValue, isDefault, ... }`.
Sensitive values are rendered as `••••••` server-side; the UI never has access
to the cleartext.

- Boundary: any change to `formatSetting` field names is a **breaking** API
  change. The page reads `category`, `value`, `defaultValue`, `isDefault`,
  `description`, `unit`, `minValue`, `maxValue` directly.

---

## Pattern E — `rate-limit` periodic refresh

The middleware reads `rate_limit_window_ms` and `rate_limit_max_requests` once
at module load (with `platformConfig` fallback) and again every 60s in a
`setInterval` (`unref()` keeps Node from being held open).

- Boundary: **express-rate-limit** binds its options at construction time. The
  refresh updates `currentWindow`/`currentMax` module vars but does NOT
  propagate into the live limiter. Process restart applies new values.
  Documented as a deferred fix in HONESTY-CHECK.

---

## Pattern F — Public client config surface

`GET /api/v1/config` is **public** (no auth). It exposes only the values needed
by clients: app version, currency, escrow timers, OTP knobs, coverage caps,
quote expiry, service-radius. Sensitive values are excluded by virtue of not
being in `getClientConfig()`'s allowlist.

- Boundary: adding a new public-readable setting requires updating
  `getClientConfig()` AND being explicit about non-sensitivity.

---

## Risk Surface

1. **Forgotten `await`** on commission/cancellation helpers → `NaN` propagates into
   ledger entries. Mitigated by typecheck + 332 passing tests + mutation gate
   on money services.
2. **Cache poisoning** — Redis returning the wrong value type. Mitigated by
   `getSetting` storing the raw string and downstream `Number(...)` coercion.
   Cache TTL is 60s; manual flush is a single click.
3. **Audit-log churn** — every PUT writes an audit row; bulk update of 50 keys
   writes 50 rows. Index `idx_settings_audit_key` keeps history lookup fast.
4. **Migration order** — migration 050 (destructive) MUST run before any seed
   relying on the new schema, and 051 MUST run after 050 (FK to
   `platform_settings.id`). Filenames preserve order.
5. **Public `/api/v1/config` exposure** — guarantees no secret keys leak.
   Allowlist is hand-curated.
