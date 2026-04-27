# Pre-mortem — Phase 03 (Runtime Config)

Five hypothetical incidents with the most-likely root cause given Phase 03's
changes.

---

## Incident 1 — DB outage causes commissions to drift

**Symptom**: Postgres goes down for ~10 minutes during peak hours. Bookings still
complete; ledger entries show service_fee = 2500 (the minimum) regardless of
service price.

**Root cause**: `settings.service.getSetting` falls back from Redis (likely also
unreachable if the same node hosts both) to `SETTING_DEFAULTS`. The default
`service_fee_rate=10` is correct, but if `service_fee_min=2500` and a small
booking is processed, the floor activates as expected. Drift only occurs if
the in-memory defaults diverge from the DB seeds.

**Mitigation**: keep `SETTING_DEFAULTS` (`settings.service.ts:18`) in lock-step
with migration 050 seeds. Add a CI assertion in a future phase.

---

## Incident 2 — Stale Redis after manual UPDATE in psql

**Symptom**: An on-call engineer hand-edits `platform_settings.value` via psql.
The new value is not visible to the API for ~60 seconds.

**Root cause**: `updateSetting` is the only path that calls `bustCache(key)`.
Direct SQL writes do NOT bust the cache.

**Mitigation**: document that manual SQL writes must be followed by
`POST /api/v1/admin/settings/cache/flush`. Future phase: pg_notify-driven
cache invalidation.

---

## Incident 3 — Validation bypass via bulk endpoint

**Symptom**: Admin uses the bulk `PUT /` endpoint to push 50 updates. One has
`value: '999'` for `service_fee_rate` (allowed range 0-100). The endpoint
rejects only the 999 update, but 49 succeed first.

**Root cause**: `bulkUpdateSettings` (`settings.service.ts:298`) iterates
sequentially without a transaction; the first failed validation stops
subsequent updates but leaves earlier ones committed.

**Mitigation**: documented as known limitation. Future phase: wrap the bulk
update in `db.transaction()` so all-or-nothing semantics hold.

---

## Incident 4 — Forgotten `await` on a future commission caller

**Symptom**: A new service is added in Phase 04 that calls
`commissionService.calculateCommission(price, tier)` without `await`. Ledger
entries silently record `NaN` amounts.

**Root cause**: TypeScript only catches the missing `await` if the result is
treated as a `CommissionBreakdown` directly (e.g. arithmetic on properties).
Spreading the result into an object hides the error at compile time.

**Mitigation**: the existing 4 callers all `await`. The mutation gate on
`commission.service.ts` will catch any caller that produces incorrect output
on real test fixtures.

---

## Incident 5 — Migration 050 runs in production (it shouldn't)

**Symptom**: Production deploy includes migration 050, which DROPs the
`platform_settings` table (CASCADE) and recreates it with seeds. Any
admin-tuned values are lost.

**Root cause**: 050 is intentionally destructive (acceptable in dev because no
production data existed). If a future deploy ever runs 050 against a database
that DOES have admin overrides, those overrides die.

**Mitigation**: `ON CONFLICT (key) DO NOTHING` in the seed protects against
overriding existing values, BUT only because the DROP CASCADE precedes the
re-create. The destructive DROP is the actual hazard. Future phases must be
additive (`ALTER TABLE`, not `DROP TABLE`). Documented in HONESTY-CHECK.
