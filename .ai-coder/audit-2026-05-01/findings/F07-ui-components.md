# Phase F Findings Part 7 — Admin UI components

## Files read (full reads, no skipped sections)

All 21 UI components in `apps/admin/src/components/ui/` fully read.

| File | Lines | Status |
|---|---:|---|
| Badge.tsx | 23 | full |
| Button.tsx | 47 | full |
| Card.tsx | 53 | full |
| Chart.tsx | 59 | full |
| Checkbox.tsx | 19 | full |
| DataTable.tsx | 81 | full |
| Dialog.tsx | 84 | full |
| EmptyState.tsx | 31 | full |
| ErrorState.tsx | 30 | full |
| Input.tsx | 15 | full |
| KpiCard.tsx | 44 | full |
| Label.tsx | 14 | full |
| LoadingState.tsx | 26 | full |
| Pagination.tsx | 64 | full |
| Select.tsx | 84 | full |
| Skeleton.tsx | 15 | full |
| Switch.tsx | 16 | full |
| Tabs.tsx | 40 | full |
| Textarea.tsx | 14 | full |
| Tooltip.tsx | 21 | full |
| index.ts | 74 | full |
| **F07 page total** | **854** | |

**Audit grand total fully read after F07: ~73,792 lines (~52.6% of ~140,380 codebase).**

---

## Honesty notes up front

- F07 added **0 CRITs** and **6 MEDs** (MED-374 through MED-379).
- The UI components are well-architected. Most use Radix UI primitives (Dialog, Select, Tabs, Tooltip, Checkbox, Switch, Label) which gives accessible defaults (focus management, keyboard nav, ARIA attributes) for free. Button uses `class-variance-authority` for typed variants. Chart is a thin recharts wrapper with centralized theming.
- The real findings about UI are about **how pages use these components**:
  - F02 MED-293, F03 MED-309, F04 MED-337, F05 (CatalogPage) — pages use inline `<div className="fixed inset-0 ...">` modal divs instead of the shared `<Dialog>`. Dialog component itself is correct.
  - F03 MED-317, F05 MED-356 — pages use native `confirm()` instead of the shared Dialog.
  - These are page-level findings, not component-level.

- **Phase F summary**: the UI primitives are fine. Use the existing Dialog and DataTable; don't recreate them. Phase I dispatch should mandate migration to these primitives.

---

## CRITICAL bugs

**None.** Components are well-implemented.

---

## MEDIUM bugs (continuing from MED-373)

### MED-374 — DataTable has no built-in sort, filter, or column-resize
**File:** [apps/admin/src/components/ui/DataTable.tsx:1-81](apps/admin/src/components/ui/DataTable.tsx)

`DataTable<T>` is a simple thead/tbody renderer with column.render. No sorting, no filtering, no column resize. Every admin page that needs sort/filter (CustomersPage, ProvidersPage, BookingsPage, FinancialsPage receipts table, etc.) implements it ad-hoc. Result: inconsistent UX.

**Fix:** add optional `sortBy`, `sortDirection`, `onSortChange` props. Centralize sort UI (chevron icons in headers). Page-level filter UIs are still page-specific, but column sort can be shared.

### MED-375 — `<Tooltip>` requires `<TooltipProvider>` ancestor; not verified to be at App root
**File:** [apps/admin/src/components/ui/Tooltip.tsx:1-21](apps/admin/src/components/ui/Tooltip.tsx)

Per Radix docs, `<TooltipProvider>` should be mounted near the React tree root (App.tsx) so all tooltips share state and respect `delayDuration`. F01 audited App.tsx — should re-verify TooltipProvider wraps the router. If missing, tooltips work but with degraded behavior (each Tooltip mounts its own provider).

### MED-376 — No dark-mode token primitives; components hardcode `slate-*` Tailwind colors
**Files:** all UI components

Every component hardcodes `bg-slate-100`, `text-slate-900`, `border-slate-300`, etc. If admin app needs dark mode (likely launch+1 nice-to-have), every file needs editing. **Fix later:** introduce CSS variable tokens (`var(--color-card-bg)`, `var(--color-text-primary)`) used consistently. Some pages already use `[var(--color-text)]` etc. — components don't follow the same pattern.

### MED-377 — Pagination component has no `aria-label` per page button (only "Previous"/"Next" implicit labels)
**File:** [apps/admin/src/components/ui/Pagination.tsx:41-52](apps/admin/src/components/ui/Pagination.tsx#L41)

`<button onClick={() => onPageChange(p)}>{p}</button>` — screen readers announce "1, button" without context. **Fix:** `aria-label={`Go to page ${p}`}` and `aria-current={p === page ? 'page' : undefined}`.

### MED-378 — Badge has no `role` or accessibility hint; status badges (success/danger) communicate visually only
**File:** [apps/admin/src/components/ui/Badge.tsx:17-22](apps/admin/src/components/ui/Badge.tsx#L17)

A status `<Badge label="suspended" variant="danger" />` is rendered as `<span>` with red background. Screen-reader users hear "suspended" without color context. **Fix:** add `role="status"` and optionally announce variant via visually-hidden text ("suspended (critical)").

### MED-379 — DataTable cell render trusts `column.render` to escape user-controlled data; no built-in HTML sanitization
**File:** [apps/admin/src/components/ui/DataTable.tsx:69-71](apps/admin/src/components/ui/DataTable.tsx#L69)

`<td>{col.render(row)}</td>` — JSX escapes by default, so `{row.userName}` is safe. But if any page uses `column.render = (r) => <div dangerouslySetInnerHTML={{ __html: r.bio }} />`, XSS lands. None of the F01-F06 pages do this — but the component contract doesn't prevent it. **Defense-in-depth:** document in JSDoc that column.render must NOT use dangerouslySetInnerHTML for user-controlled data. CI lint can catch.

---

## LOW / INFO

- **Dialog** uses `@radix-ui/react-dialog` — accessible modal with proper focus trap, escape-to-close, click-outside-to-close, aria-modal, aria-describedby. Pages should use this exclusively (F02 MED-293, F03 MED-309, F04 MED-337, F05 CatalogPage all flagged for migration).
- **Select** uses `@radix-ui/react-select` — accessible dropdown with keyboard nav, type-ahead. Pages mixing native `<select>` and Radix Select should standardize on Radix.
- **Tabs** uses `@radix-ui/react-tabs` — keyboard-navigable.
- **Checkbox + Switch** use Radix primitives — accessible toggles.
- **Button** uses `class-variance-authority` (cva) — typed variants. Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon.
- **Chart** wraps recharts with centralized `CHART_COLORS` palette. `ChartContainer` uses `<ResponsiveContainer>` for proper resizing.
- **EmptyState** uses `role="status"` — semi-correct (status announces non-critical info).
- **ErrorState** uses `role="alert"` — correct (alerts announce critical info).
- **LoadingState** uses `aria-busy="true"` and `aria-live="polite"` — correct.
- **Skeleton** uses `aria-busy="true"` — minimal but correct.
- **Pagination smart window** at line 29 (max 5 buttons, sliding) — handles large page counts gracefully.
- **DataTable horizontal scroll** wrapper — `<div className="overflow-x-auto">` — handles narrow viewports.
- **Card / CardHeader / CardTitle / CardContent** — clean layout primitives, used consistently across F01-F06.
- **`@radix-ui/react-*` dependency budget** — Dialog, Select, Tabs, Tooltip, Checkbox, Switch, Label = 7 Radix packages. Bundle size acceptable for an admin tool.
- **No motion-reduce respecting** — animations use `data-[state=open]:animate-in data-[state=closed]:animate-out` (Radix CSS classes). Verify Radix respects `prefers-reduced-motion`.

---

## Phase F running totals (after F07 — Phase F COMPLETE)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| F03 (User + provider + staff + identity + audit) | ~4,500 | 1 |
| F04 (Compliance + data-rights + notification templates) | ~2,743 | 1 |
| F05 (Catalog + pricing + marketing + ops) | ~4,400 | 1 |
| F06 (Dashboard + analytics + settings + cancellation policy) | ~2,355 | 1 |
| **F07 (UI components)** | **854** | **1** |
| **Phase F total — COMPLETE** | **~21,111** | **7** |

| | Phase F totals |
|---|---:|
| New CRITs | 30 (CRIT-120 → CRIT-150 minus 1 demoted to MED-301; net 29 real CRITs) |
| New MEDs | 100 (MED-272 → MED-379 minus a few re-numbered; net ~99 real MEDs) |

**Cumulative audit totals after Phase F COMPLETE:**
- ~73,792 lines fully read (~52.6% of ~140,380)
- **150 CRITICAL** bugs (1 invalidated → **149 real**)
- **379 MEDIUM** bugs

---

## What's left after Phase F

### Phase G — Migrations + RLS (~4,000 lines, 88 SQL files, ~1 session)
- All migration files in `packages/api/migrations/`
- Watch-for: money columns NUMERIC vs INTEGER, RLS policies, NOT NULL gaps, FK gaps, index drift, **provider_kyc tables that should exist per CRIT-128**, **erasure_executions table that should exist per CRIT-136**, **marketing_campaign_adjustments table that should exist per CRIT-143**.

### Phase H — Test quality audit (~20,000 lines, ~2 sessions)
- Patterns to look for: `expect(existsSync(...)).toBe(true)`, `expect(closeout.match(/Bug NNNN/)).toBeTruthy()`, multi-bug test names, `it.todo` skipped without specific reason, "render but don't assert" pattern.

### Phase I — Master AI-coder dispatch (1 session)
- Synthesize 149 CRITs into ~25-30 deployable dispatches. Each dispatch:
  - Description + impact statement
  - Files to edit (with line numbers from F01-F07 + Phase A-E findings)
  - Migration steps if any
  - Tests required (real-render + assertion)
  - Runtime verification protocol (Docker setup, seed scripts, click-paths, screenshot checks)
  - Rollback plan
- Reference CancellationPolicyPage as the gold-standard template.
- Bundle related CRITs (e.g., the staff-permissions dispatch covering CRIT-23/56/120/121/130/131/137/142/144/147 in one super-dispatch).

---

## Discipline note

Phase F audited 21,111 lines across 7 sub-phases. The dominant theme is **server-side authorization gaps** — `requireAdmin` (admin OR super_admin) on routes that should be `requireSuperAdmin`. The fix pattern is consistent: middleware-level role tightening + client-side role-gate hide + audit-row-on-write. CancellationPolicyPage shows the team can do this right; the rest of the admin needs the same treatment.

Phase F is complete. Proceed to Phase G.
