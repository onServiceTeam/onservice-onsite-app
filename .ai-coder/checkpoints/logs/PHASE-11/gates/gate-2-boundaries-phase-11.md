# Gate 2 — Boundaries (Phase 11)

## Trust boundaries

| Boundary | Where | Validation |
|---|---|---|
| User → POST /api/v1/compliance/dsr | `authMiddleware` | Rejects missing/invalid JWT. Captures `req.user!.userId` (NOT `id`). `req.ip` recorded. |
| User → POST /api/v1/compliance/consent | `authMiddleware` | Same. |
| Admin → /api/v1/admin/compliance/* | `authMiddleware` + `requireAdmin(req)` | role must be `admin` or `super_admin`. |
| Service → audit_log INSERT | wrapped in try/catch | Failure logs `warn`; main row still committed. Tests assert this. |
| Service → CSV export | RFC 4180 escaping | Any `,`, `"`, `\n`, `\r` triggers wrapping; internal `"` doubled. JSON for nested values. Tests cover comma + quote cases. |
| DSR status transitions | `updateDsrStatus` | received → {in_progress, rejected}; in_progress → {completed, rejected}; terminal states reject changes. Tests cover invalid transitions. |

## SQL injection
All queries are parametric. No string concatenation of user input. `searchConsent`/`listDsrs`/audit-log CSV builds WHERE clauses with `$N` placeholders pushed into the params array.

## Data exposure
- `consent_records` exposes user_id, consent_type, version, granted, ip_address (PII). All endpoints require admin or are scoped to `req.user.userId`.
- `data_subject_requests.user_message` and `admin_notes` may contain sensitive text. CSV export already filtered by admin role; output not paginated to disk on the API host.
- No PII in event payloads (Phase 11 emits no socket events).

## Sacred files
- `server.ts` — additive only: 2 imports + 2 `app.use(...)` mounts.
- `App.tsx`, `Sidebar.tsx`, `DashboardPage.tsx` — small additive edits.
- No existing CHECK constraint widened. New CHECKs are scoped to the new `data_subject_requests` table (request_type, status).

## Money math
NONE. Compliance entities store no monetary fields.
