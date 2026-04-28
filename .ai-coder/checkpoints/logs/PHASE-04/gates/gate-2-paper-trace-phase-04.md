# Paper-trace — Phase 04 (Admin Dashboard)

Each trace walks a runtime path step-by-step from input to side effect, citing
file/line so the reasoning is reproducible.

---

## Trace 1 — `GET /api/v1/admin/dashboard/kpis?range=30d` cold call

1. Express dispatch hits `routes/admin.routes.ts` `router.get('/dashboard/kpis', authMiddleware, ...)`.
2. `authMiddleware` validates JWT and attaches `req.user`. `requireAdmin(req)` enforces role IN ('admin','super_admin').
3. Handler reads `req.query['range']`. `adminAnalyticsService.isDashboardRange(rawRange)` (`admin-analytics.service.ts`) confirms the value is one of `today|7d|30d|90d|ytd`. Otherwise `createAppError('Invalid range...', 400)` is thrown into `next(error)`.
4. `getDashboardKpis('30d')` (`admin-analytics.service.ts`) computes `startSql = NOW() - INTERVAL '30 days'` and `prev = { start: NOW() - INTERVAL '60 days', end: NOW() - INTERVAL '30 days' }`.
5. `Promise.all([revRow, countsRow, walletsRow, burnRow])` issues 4 SQL queries in parallel.
6. `pctChange(current, previous)` computes `((c-p)/p)*100` rounded to 1dp; returns 100 when `previous<=0` and `current>0`, 0 otherwise.
7. Runway: `monthlyBurn>0 ? round(guarantee/monthlyBurn,1) : 99` — capped sentinel.
8. Response shape `{ success: true, data: DashboardKpis }` returned to caller.

---

## Trace 2 — `GET /dashboard/revenue-trend?days=999`

1. Handler parses `Number(req.query['days'] ?? 30) === 999`.
2. `getRevenueTrend(999)` calls `clampDays(999, 1, 365)` → returns `365`.
3. SQL CTE: `series` `generate_series` produces 365 days; LEFT JOIN `gmv` (sum of `wallet_transactions WHERE type='payment'`) and `rev` (sum of `wallet_transactions WHERE type IN ('commission','service_fee')`) per day.
4. Each `rows.rows.map(...)` coerces `gmv`/`revenue` strings to `Number`.
5. Frontend renders 365 points in `LineChart`.

---

## Trace 3 — `GET /dashboard/booking-volume?days=7`

1. `clampDays(7,1,365) → 7`.
2. SQL `LEFT JOIN service_categories c ON c.id = b.category_id` to gracefully handle bookings whose category is null (`COALESCE(c.name,'Uncategorized')`).
3. `GROUP BY c.name ORDER BY COUNT(b.id) DESC LIMIT 12`.
4. `BarChart` renders top 12 categories.

---

## Trace 4 — `GET /dashboard/acquisition-funnel?days=30`

1. CTE `registered_customers` selects `users WHERE role='customer' AND created_at >= NOW() - 30 days`.
2. CTE `bookings_by_customer` joins `bookings` to `registered_customers` (only counting bookings made AFTER signup).
3. Final SELECT returns 3 counts: registered, ≥1 booking (firstBooking), ≥2 bookings (repeatBooking).
4. Frontend computes percentages relative to `registered` and renders three colored progress bars.

---

## Trace 5 — `GET /dashboard/alerts` with 3 consecutive 1-star reviews

1. 7 `Promise.all` queries run in parallel.
2. Query #1 uses a window function: `ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY created_at DESC)`. CTE `latest_three` filters `rn<=3` and asserts `BOOL_AND(rating=1)` (every one of the 3 most-recent reviews is exactly 1 star).
3. For each provider returned, an alert is pushed with `severity='danger'`, `action_url='/providers/<id>'`.
4. After all 7 producers, `alerts.sort((a,b)=>b.created_at.getTime()-a.created_at.getTime())` orders by recency desc.
5. `created_at` is serialized to ISO string for the response.
6. Frontend `AlertFeed` renders the sorted list with severity-mapped icon colors.

---

## Trace 6 — `GET /dashboard/alerts` guarantee fund threshold

1. Query #7 returns `{ balance: '100', burn: '1000' }`.
2. Service computes `balance(100) < burn(1000) * 0.3 (= 300)` → TRUE.
3. Alert pushed: `type='guarantee_fund_low'`, `severity='danger'`, `action_url='/financials/wallets'`, peso amounts formatted in description (`balance/100`).
4. If `burn === 0`, no alert is emitted (prevents division-by-zero / spurious alerts on cold systems).

---

## Trace 7 — `GET /dashboard/cities`

1. SQL selects `service_areas WHERE status IN ('active','soft_launch','recruiting','planned')`.
2. Subquery COALESCE counts today's bookings per area via `provider_service_areas` join.
3. `ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'soft_launch' THEN 1 WHEN 'recruiting' THEN 2 ELSE 3 END, name`.
4. LIMIT 24 to keep the tile grid bounded.
5. Frontend renders `Card` tiles with name, status, providers count, today bookings.

---

## Trace 8 — Frontend cold mount of `DashboardPage`

1. `useState<DateRange>('today')` initializes range.
2. 6 `useQuery` hooks fire in parallel: kpis (60s refetch), revenueTrend (60s), bookingVolume (60s), funnel (300s), alerts (30s), cities (60s).
3. While `kpis.isLoading`, returns `<LoadingState label="Loading dashboard..." />`.
4. On `kpis.isError`, returns `<ErrorState ... action={Retry button calling kpis.refetch()} />`.
5. On success, renders header → 8 KPI grid → 3 chart row → AlertFeed (2/3 width) + QuickActions (1/3) → 3 wallet cards → Cities tile grid.
6. `RefreshCw` button calls `refetch()` on all 6 queries.
7. Range select change triggers re-fetch of `kpis` only (other queries are independent of range).

---

## Trace 9 — KpiCard `trendPct` rendering

1. `KpiCard` receives `trendPct={k.revenueTrendPct}` (e.g. `12.3`, `-5.7`, `0`).
2. `trendLabel = trendPct > 0 ? '+12.3%' : '12.3%'.toFixed(1)+'%'` (negative naturally retains `-`).
3. `trendColor` = emerald (positive), red (negative), slate (zero).
4. Rendered in the top-right of the card. If `change` prop is also supplied, `change` wins (back-compat).
