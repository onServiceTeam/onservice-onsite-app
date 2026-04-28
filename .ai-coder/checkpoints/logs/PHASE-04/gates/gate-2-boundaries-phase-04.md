# Boundaries & Risk Surface — Phase 04 (Admin Dashboard)

Patterns introduced or modified by Phase 04, and the behavioral edges callers
can hit.

---

## Pattern A — Range-string SQL interpolation, type-narrowed at the boundary

`getDashboardKpis(range)` and the helpers `rangeStartSql(range)` /
`previousRangeSql(range)` produce raw SQL fragments interpolated into queries
without parameterization (`${startSql}` lands inside a template string).

- This is **safe** because `range` is the union literal type
  `'today'|'7d'|'30d'|'90d'|'ytd'`. The TS compiler rejects any other value
  AND the route handler validates via `isDashboardRange()` before calling
  the service.
- Boundary: never expose `getDashboardKpis` to a caller that bypasses the
  type guard. If a future endpoint (e.g. webhook) starts forwarding a raw
  query-string into the service, validation MUST be re-asserted there.

---

## Pattern B — Numeric SQL-paramaters via parameterized queries

`getRevenueTrend`, `getBookingVolumeByCategory`, `getCustomerAcquisitionFunnel`
use parameterized `$1::int` placeholders for `days`. These values are run
through `clampDays(value, 1, 365)` before reaching the DB.

- Boundary: NaN / Infinity / non-finite inputs collapse to the `min` (1).
- Negative inputs collapse to `min` (1). Inputs > 365 collapse to `max` (365).
- This protects against `generate_series` returning an unbounded number of
  rows on accidental input.

---

## Pattern C — Promise.all fan-out per endpoint

`getDashboardKpis` runs 4 queries in parallel; `getOperationalAlerts` runs 7.
A failure in any one rejects the whole `Promise.all`, causing the endpoint to
500.

- Boundary: this is **all-or-nothing**. The dashboard renders nothing if
  one query fails. Acceptable today because the admin user can hit Refresh,
  and the 30-60-second auto-refetch will recover.
- Risk: a slow query (e.g. the 3-consecutive-1-star window function on a
  database with millions of reviews) blocks the whole alerts endpoint.
  Today the data volume is small. A future phase should add per-query
  timeouts or move to settled-promise aggregation.

---

## Pattern D — Read-only analytics service (NOT sacred file)

`admin-analytics.service.ts` only reads. It does NOT call `db.transaction`,
does NOT modify wallets, does NOT touch escrow/commission/payout/dispute
mutation paths. The `verify-money-conservation` and mutation gates intentionally
do not run against this service for new code (mutation gate uses a per-phase
delta; this file IS in the delta but is not in the sacred-file allowlist).

- Boundary: if a future phase ever adds a write to this service (e.g. caching
  a dashboard snapshot to a `dashboard_cache` table), the file must be
  reviewed for transactional + conservation requirements.

---

## Pattern E — Frontend KpiCard back-compat surface

`KpiCard` now accepts `trendPct` in addition to the existing `change` /
`changeType` props. When `change` is provided, it wins; `trendPct` is rendered
only when `change` is absent.

- Boundary: existing call sites that pass `change="+10%"` continue to work
  without modification. New call sites (this phase: DashboardPage) supply
  `trendPct` directly so the color/sign logic is centralized.

---

## Pattern F — Dashboard auto-refetch cadence

| Query              | Interval | Rationale                                                  |
|--------------------|----------|------------------------------------------------------------|
| kpis               | 60s      | Fast-changing top-line metrics                             |
| revenue-trend      | 60s      | Smooth chart even on light traffic                          |
| booking-volume     | 60s      | Same                                                       |
| acquisition-funnel | 300s     | Funnel is days-scale; expensive to compute, refresh slower |
| alerts             | 30s      | Operational urgency — admin reaction time                  |
| cities             | 60s      | Mid-frequency; tiles are not time-critical                 |

- Boundary: 6 admin tabs open = 6× auto-fetch load on the API. With 60-second
  intervals and a small admin team this is negligible (<1 RPS sustained).

---

## Risk Surface

1. **Database schema drift** — queries reference `wallet_transactions.type` literals
   `'commission'|'service_fee'|'payment'`. If a migration ever renames these
   enum values, every dashboard endpoint silently returns 0. Mitigated by
   the fact that those literals are also used by the wallet/escrow services
   and would break first.
2. **`audit_log` webhook-failure heuristic** — the alert query uses
   `action ILIKE '%webhook%fail%'` because no `webhook_events` table exists
   yet. This is a fallback; if a future phase introduces `webhook_events`,
   this query should switch to a real source.
3. **Range-string interpolation** — see Pattern A. Type-narrowed today.
4. **Wallet keys** — `wallets WHERE type='platform_escrow' AND user_id IS NULL`
   etc. assume the singleton-per-type contract. If duplicates ever exist, the
   subquery returns the first match. Mitigated by a UNIQUE index on
   `(type, user_id)` (verified in migrations).
5. **N+1 false-positives** — the gate-5-n-plus-1 scan flags `rows.rows.map(...)`
   patterns in this file. They are **not** N+1 — they are pure in-memory
   transforms with no further DB calls. Documented here for future review.
