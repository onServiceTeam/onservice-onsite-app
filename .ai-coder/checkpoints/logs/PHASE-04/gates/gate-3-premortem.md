# Pre-mortem — Phase 04 (Admin Dashboard)

Five hypothetical incidents with the most-likely root cause given Phase 04's
changes.

---

## Incident 1 — Dashboard returns "0 revenue" after enum rename

**Symptom**: A migration renames `wallet_transactions.type='commission'` to
`'platform_commission'`. The dashboard KPI card shows ₱0.00 revenue across all
ranges. No errors in logs.

**Root cause**: `getDashboardKpis` queries
`SUM(...) WHERE type IN ('commission','service_fee')`. The literal strings
silently miss every row.

**Mitigation**: future migrations to wallet_transactions enum values must
grep the codebase for the old literal first. Long-term: extract the literal
into a shared `WalletTransactionType` enum with type-checked usages.

---

## Incident 2 — Stale dashboard during DB outage

**Symptom**: Postgres goes down for 2 minutes. The admin dashboard returns
500 across every endpoint. Auto-refetch hammers the API every 30-60 seconds.

**Root cause**: `Promise.all` in `getDashboardKpis` and `getOperationalAlerts`
rejects on any single query failure. There is no fallback to last-known-good
data.

**Mitigation**: documented in HONESTY-CHECK Q1. A future phase can add
Redis-cached snapshots with a `stale-while-revalidate` policy so the dashboard
shows the last known values during outages.

---

## Incident 3 — Provider with millions of reviews makes alerts query slow

**Symptom**: The `/dashboard/alerts` endpoint takes 8+ seconds. Admin Refresh
button feels broken. UI eventually times out.

**Root cause**: `ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY created_at DESC)`
in the consecutive-1-star query scans every review row. With ~10K providers
and ~100 reviews each, the CTE materializes ~1M rows.

**Mitigation**: today's volumes make this fine. A future phase should add
an index on `reviews(provider_id, created_at DESC)` and consider a
materialized view refreshed every 5 minutes.

---

## Incident 4 — Range-string injection via misuse

**Symptom**: A new internal route accidentally calls
`adminAnalyticsService.getDashboardKpis(req.body.range)` without validation.
An attacker sends `range: "today; DROP TABLE users; --"`.

**Root cause**: The service trusts callers to pass a validated `DashboardRange`.
TypeScript catches direct calls but `req.body.range` is `any`-shaped at runtime.

**Mitigation**: documented in Pattern A. The current sole call site
(`admin.routes.ts`) calls `isDashboardRange()` first. A future regression test
should assert this guard for every new caller. Long-term: change
`getDashboardKpis` to accept `unknown` and validate internally.

---

## Incident 5 — Guarantee fund alert spam

**Symptom**: Admin sees "Guarantee fund below 30% of monthly burn" alert
flicker on/off every 30 seconds. The alert appears, then disappears, then
reappears as the dashboard auto-refetches.

**Root cause**: The 30-day burn calculation runs over a moving window. A
single large refund near the threshold can push `balance < burn*0.3`
intermittently as `NOW()` advances and old transactions roll out of the
window.

**Mitigation**: documented in HONESTY-CHECK Q1. A future phase can add
hysteresis: alert when `balance < burn*0.25`, clear when
`balance > burn*0.35`. For now, the alert URL deep-links to
`/financials/wallets` so the admin can confirm + dismiss manually.
