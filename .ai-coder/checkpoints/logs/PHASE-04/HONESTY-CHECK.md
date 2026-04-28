# HONESTY-CHECK — Phase 04 (Admin Dashboard)

This document is the AI coder's good-faith disclosure of every shortcut,
limitation, deferral, and uncertainty introduced in Phase 04. Reviewers
should consider it the authoritative list of "things that are NOT what they
appear to be" before merging.

---

## Q1 — Did you take any shortcuts that the orchestrator would want to know about?

**Yes.** The most material:

1. **Webhook-failure alert uses an `audit_log` text-pattern fallback.** The
   spec calls for "PayMongo webhook failures last hour", but no
   `webhook_events` table exists yet. The implementation queries
   `audit_log WHERE action ILIKE '%webhook%fail%'` which will return rows
   only if some other code path explicitly logs failures with a matching
   action string. As of this phase, nothing in the codebase writes such
   audit entries — so the alert will always be empty until a future phase
   ships the actual webhook event sink. Documented in
   `gate-2-boundaries-phase-04.md` Risk Surface item 2.

2. **Range-string SQL interpolation is type-narrowed but not parameterized.**
   `rangeStartSql(range)` returns raw SQL fragments interpolated with
   `${...}`. This is safe because `DashboardRange` is a TypeScript union
   literal AND `isDashboardRange()` validates at the route boundary. But it
   is a footgun for future callers — see `gate-3-future-bugs.md`.

3. **No fallback for partial Promise.all failure.** A single failing query
   in `getDashboardKpis` (4 queries) or `getOperationalAlerts` (7 queries)
   rejects the whole endpoint. Today's UX: dashboard shows ErrorState; admin
   hits Refresh; auto-refetch eventually recovers.

4. **`/dashboard` legacy endpoint left in place.** The pre-existing
   `GET /api/v1/admin/dashboard` (calling the old `adminService.getDashboardKpis()`)
   was not removed because no audit was performed of every consumer. The new
   endpoints live alongside it under `/dashboard/kpis`, `/dashboard/alerts`,
   etc. A future phase can remove the legacy handler once consumers are
   confirmed migrated.

5. **No live-reload of city / category lists.** The dashboard refetches every
   60s. If a service area is created mid-session, it appears on the next
   refetch — not via push. Acceptable for ops use.

6. **Guarantee fund alert can flicker.** If balance hovers near `burn*0.3`,
   small wallet movements can flip the alert state every refetch. Hysteresis
   is deferred — see `gate-3-premortem.md` Incident 5.

---

## Q2 — Are there any tests you skipped, faked, or weakened?

**No.** All 35 new tests in
`packages/api/__tests__/admin-analytics-dashboard.test.ts` mock `db.query`
directly (NOT the service-under-test) so the real branching, math, and
severity-mapping code runs. The full API suite still passes
**25/25 suites, 513/513 tests**.

The tests do NOT cover:

- The exact SQL text — that is a property of the database, not the JS code,
  and is verified end-to-end by a future integration phase against a real
  Postgres.
- Concurrent refetch semantics in React Query — those are properties of the
  library, not the dashboard component logic.
- Visual layout / responsive breakpoints — covered by the verify-master visual
  gate (screenshots).

No tests were skipped, weakened, or marked `.skip`. The mutation gate's per-phase
delta does NOT include `admin-analytics.service.ts` because it is not in the
sacred-file allowlist (read-only analytics, no money mutations) — TD-005's
"touched a sacred file = write tests" mandate does not apply, but the tests
were written anyway per the active sub-directive **"A. Write the tests. No
deferral."**

---

## Q3 — Did anyone (sub-agent, copy-paste, prior conversation) help in a way that obscures authorship?

**No.** All code in this phase was written or refactored directly by the
primary AI coder agent in this conversation, working from
`.ai-coder/phases/PHASE-04-admin-dashboard.md`. No sub-agent delegation. The
phase-doc structure (paper-trace, boundaries, premortem, future-bugs,
honesty-check, evidence-manifest, INDEX, BASELINE-DEBT) follows the templates
established in Phase 03's `logs/PHASE-03/` directory.

---

## Q4 — What is the single most likely way this phase introduces a regression?

A future caller of `adminAnalyticsService.getDashboardKpis(range)` skips the
`isDashboardRange()` validation by using a TypeScript `as DashboardRange`
cast on a user-controlled string. At runtime `rangeStartSql(range)` falls
through every `switch` case and returns `undefined`. The SQL fails (best
case) or — if a future refactor adds a `default:` branch returning a benign
fragment — silently leaks long-tail historical data into a new dashboard.
Detection + containment in `gate-3-future-bugs.md`.

---

## Self-attestation

I have read the four questions above and answered each one truthfully to the
best of my knowledge. The known limitations have been called out in
`gate-2-boundaries-phase-04.md`, `gate-3-premortem.md`, and the
`Deferred to later phases` section of `EVIDENCE-MANIFEST.md`.

I attest the above is true.
