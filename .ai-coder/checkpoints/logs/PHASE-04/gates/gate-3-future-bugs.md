# Most-likely 2-week future bug — Phase 04

## The bug

A second engineer ships a Phase 05 feature that adds a new admin endpoint
forwarding the URL `range` parameter into a different analytics function:

```ts
router.get('/financial-summary', authMiddleware, async (req, res, next) => {
  // forgot adminAnalyticsService.isDashboardRange(req.query.range)
  const data = await adminAnalyticsService.getDashboardKpis(req.query.range as DashboardRange);
  res.json({ success: true, data });
});
```

An admin (or, worse, a misconfigured proxy) requests
`/financial-summary?range=foo`. The TypeScript `as DashboardRange` cast is
honored, but at runtime `rangeStartSql('foo')` enters the `switch` block, hits
no case, and returns `undefined`. The SQL becomes
`...WHERE created_at >= undefined`, which Postgres rejects with a generic
error and the endpoint 500s. (Best case.) Worst case, a future refactor adds
a `default:` branch returning a benign-looking SQL fragment that silently
includes every row ever — leaking long-tail historical numbers into the new
"financial summary" page.

## Why this is the most likely bug

- Phase 04 documented the type-narrowing-at-the-boundary pattern in
  `gate-2-boundaries-phase-04.md` Pattern A. That pattern relies on every
  caller honoring `isDashboardRange()`. There is no compile-time enforcement.
- TypeScript's `as DashboardRange` cast is a known footgun — it satisfies the
  compiler without runtime verification.
- The convenience of `getDashboardKpis(range)` makes it tempting to reuse for
  related dashboards.

## Detection plan

- Add an ESLint custom rule (or grep guard) that fails on
  `getDashboardKpis(.*as DashboardRange)` patterns and any reference to the
  service from outside `admin.routes.ts` that doesn't first call
  `isDashboardRange`.
- Refactor `getDashboardKpis` to accept `unknown` and validate internally
  (defense-in-depth at the service boundary).
- Add a `default:` branch to `rangeStartSql` that throws an explicit
  `RangeError` rather than returning undefined.

## Containment plan

If the bug ships:

1. Patch the missing validation at the new call site.
2. Audit `audit_log` for any analytics endpoints called with unusual range
   values during the regression window.
3. Refactor service signature to `getDashboardKpis(rawRange: unknown)` so the
   pattern can never recur.
