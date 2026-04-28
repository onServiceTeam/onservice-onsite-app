# Phase 11 — Honesty Check (Compliance Center + Audit Log Depth)

## Mandate
Build the NPC compliance center (consent log, DSR queue, DPO actions) and complete the audit log UI with diff viewer + CSV export. Add BIR filing calendar, Tax Documents archive shell, and Regulatory Reports shell. Wire DSR overdue alerts into dashboard.

## What was actually delivered

### Backend (packages/api)
- `migrations/057_compliance_consent_dsr.sql` (44 LOC): two new tables — `consent_records` (NO CHECK on consent_type — flexible) and `data_subject_requests` (CHECK on request_type IN access|erasure|correction|portability|restriction|objection AND status IN received|in_progress|completed|rejected). Indexes: `idx_consent_user_type`, `idx_dsr_status_due` (partial WHERE in `('received','in_progress')`), `idx_dsr_user`. PKs use `uuidv7()` matching migration 009 style.
- `src/services/compliance.service.ts`: `recordConsent` (revokes prior on granted=false), `listConsentForUser`, `searchConsent`, `createDsr` (due_at = NOW + 15 days; audit_log entry `dsr.created` wrapped in try/catch + logger.warn), `listDsrs` (filter status, overdueOnly), `getDsr`, `updateDsrStatus` (validates received→{in_progress,rejected}, in_progress→{completed,rejected}; sets `completed_at` on terminal; audit `dsr.status_changed`), `exportAuditLogCsv` (RFC 4180 escaping; reuses same WHERE-clause shape as existing `/admin/audit-log`), `getBirCalendar(year)` (29 entries: 12×1601-EQ + 12×2550M + 4×1701Q + 1×1701; status `not_yet_due`/`due_soon`/`overdue` from `now`), `getDsrAlerts` (DSRs `due_at - NOW() <= INTERVAL '2 days'`).
- `src/routes/compliance-admin.routes.ts` (mounted at `/api/v1/admin/compliance` BEFORE generic admin per existing convention): GET /consent, GET /consent/users/:userId, GET /dsr, GET /dsr/:id, PATCH /dsr/:id, GET /audit-log/export.csv, GET /bir-calendar?year=, GET /dsr-alerts. All require admin via `requireAdmin`.
- `src/routes/compliance.routes.ts` (mounted at `/api/v1/compliance`): POST /dsr (any auth user), POST /consent (any auth user). Captures `req.ip` for ipAddress.
- `__tests__/compliance-admin.test.ts` (481 LOC, 40 tests): hermetic db.query mock + logger mock per `marketing-admin.test.ts` pattern. Coverage:
  - recordConsent (7) — insert + revoke prior + ipAddress passed through
  - listConsentForUser (1)
  - searchConsent (2) — filter and pagination
  - createDsr (4) — 15-day SLA, audit insert, audit failure does NOT throw
  - listDsrs (2) — status filter, overdueOnly clause
  - getDsr (2)
  - updateDsrStatus (7) — invalid transitions rejected, valid succeeds, terminal sets completed_at, audit wrap
  - exportAuditLogCsv (5) — header row, RFC 4180 escaping (commas + quotes), filter pass-through
  - getBirCalendar (8) — counts, sort order, status transitions on a fixed `now`
  - getDsrAlerts (2) — SQL contains `INTERVAL '2 days'`

### Admin frontend (apps/admin)
- `src/pages/CompliancePage.tsx` (599 LOC): 5 tabs (state-driven, NOT route-driven).
  - **NPC Compliance**: DSR queue (status badge, daysUntilDue with red badge if overdue), row click → detail panel with status update form. Consent search by userId/consentType/version → table.
  - **BIR Calendar**: Year selector → calls `/bir-calendar?year=`. Table grouped by month with status badge.
  - **Audit Log**: extended viewer with from/to date pickers, userId filter, "Export CSV" button (uses `api.get('...export.csv', { responseType:'blob' })` then `URL.createObjectURL` + anchor click — preserves auth header). Side-by-side diff viewer for old/new values.
  - **Tax Documents**: stub with year/type filter and placeholder note pointing to `/api/v1/admin/bir/exports` (Phase 08).
  - **Regulatory Reports**: static placeholder + stub button.
- `src/App.tsx`: lazy `CompliancePage` + `<Route path="/compliance">`.
- `src/components/Sidebar.tsx`: `Compliance` entry with `Shield` icon between Audit Log and Support.
- `src/pages/DashboardPage.tsx`: fetches `/admin/compliance/dsr-alerts`; merges into existing alerts list (DSR overdue rows prepended).

### Server wiring
- `src/server.ts`: imports + mounts `compliance-admin.routes` BEFORE generic `admin.routes` per the same comment pattern used for marketing/financial-admin/bir-admin. Mounts `compliance.routes` at `/api/v1/compliance`.

## What was NOT delivered (carried forward)

- **DPO action log UI** — narrative-only in spec. No backend table or admin UI built. Future phase.
- **Consent version manager UI** — narrative-only. Backend supports versioned consent rows, but no UI to bump version + force re-acceptance flow.
- **Mobile DSR submission UI** — backend endpoint `POST /api/v1/compliance/dsr` exists, but no mobile screen built (Phase 09 scope was different). Customers can submit via API; UI follow-up belongs to a future mobile phase.
- **Tax Documents tab** is a stub placeholder pointing to existing Phase 08 BIR exports endpoint. Year/type filter UI present but does not call backend yet — explicit per spec ("NO new backend").
- **Regulatory Reports tab** button is a `window.alert('Not yet implemented')` per spec.
- **Auto-overdue dashboard alert** — implemented as a query merging into dashboard's alerts list rather than a discrete UI badge; if dashboard had no alerts slot, would have been silently skipped. (Slot was found and used.)

## Sacred-file touches
- `server.ts` — additive only: 2 imports + 2 `app.use(...)` lines.
- `App.tsx`, `Sidebar.tsx`, `DashboardPage.tsx` — small additive edits.
- No money math added or modified.

## Money math
None. Compliance handles consent and DSR rows; no centavos involved.

## Verification
- `packages/api` tsc / eslint / jest: 789/789 pass (was 749; +40 new compliance tests).
- `apps/admin` tsc / eslint / build: success (CompliancePage chunk 18.57 kB, gzip 4.97 kB).
- repo-root `npm run lint`: clean.
