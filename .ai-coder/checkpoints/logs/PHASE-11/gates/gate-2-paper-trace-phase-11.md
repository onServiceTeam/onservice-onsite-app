# Gate 2 — Paper Trace (Phase 11)

## Request paths

### 1. Customer submits a DSR
1. `POST /api/v1/compliance/dsr` body `{ requestType, userMessage }`.
2. `compliance.routes.ts` reads `req.user!.userId`, `req.ip`.
3. `compliance.service.createDsr({...})` runs:
   - `INSERT INTO data_subject_requests` with `due_at = NOW() + INTERVAL '15 days'`.
   - Inside try/catch: `INSERT INTO audit_log` with action `'dsr.created'`, entity_type `'data_subject_request'`, entity_id = new DSR id, user_id = the requester. Failure logs `logger.warn` and returns the DSR row anyway.
4. Response: created DSR JSON.

### 2. Admin updates DSR status
1. `PATCH /api/v1/admin/compliance/dsr/:id` body `{ newStatus, adminNotes?, rejectionReason?, responsePayloadUrl? }`.
2. `requireAdmin(req)` enforces role.
3. `compliance.service.updateDsrStatus({ id, adminId: req.user!.userId, ... })`:
   - SELECT current row.
   - Validate transition: received → {in_progress, rejected}; in_progress → {completed, rejected}; terminal states reject all changes.
   - UPDATE row; sets `completed_at = NOW()` if newStatus is `completed` or `rejected`.
   - try/catch: INSERT audit_log action `'dsr.status_changed'`, old_values `{status: oldStatus}`, new_values `{status: newStatus, adminNotes, rejectionReason}`. Failure → warn only.
4. Response: updated DSR row.

### 3. Audit-log CSV export
1. `GET /api/v1/admin/compliance/audit-log/export.csv?action=&entityType=&from=&to=&userId=`.
2. `requireAdmin(req)`.
3. Service builds same WHERE clause as `/admin/audit-log` (parametric placeholders, ILIKE for action, equality elsewhere, dates as bounds).
4. Streams a single CSV string (header + rows). RFC 4180: any value containing `,`, `"`, `\n`, or `\r` is wrapped in `"..."` with internal `"` doubled. JSON for `old_values`/`new_values`.
5. Response headers:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="audit-log-<ISO>.csv"`

### 4. BIR calendar fetch
1. `GET /api/v1/admin/compliance/bir-calendar?year=2025`.
2. `requireAdmin(req)`.
3. Pure function `getBirCalendar(year, now=new Date())`:
   - 12 × 1601-EQ entries (due 10th of month + 1).
   - 12 × 2550M entries (due 20th of month + 1).
   - 4 × 1701Q entries (May 15, Aug 15, Nov 15, Apr 15 next year).
   - 1 × 1701 (Apr 15 next year).
   - Each entry: `{ formNo, label, dueDate, status }` where status = `'overdue'` if `now > dueDate`, `'due_soon'` if within 7 days, else `'not_yet_due'`.
4. Response: JSON array sorted by dueDate ascending.

### 5. DSR alerts → dashboard merge
1. Dashboard mounts → TanStack Query `['dsr-alerts']` → `GET /admin/compliance/dsr-alerts`.
2. Service: `SELECT ... WHERE status IN ('received','in_progress') AND due_at - NOW() <= INTERVAL '2 days'`.
3. Frontend converts each row to an `Alert`-shaped object and prepends to the existing alerts list (no mutation of upstream query).

## Money paths
NONE. Compliance has no centavos. All consent/DSR rows store no monetary fields.

## Idempotency
- POST /dsr is NOT idempotent — each call creates a new DSR row. Mobile UI must rate-limit / debounce client-side.
- recordConsent is granted-or-revoked: on `granted=false`, prior granted row is updated `revoked_at = NOW()` and a new `granted=false` row is inserted (history preserved per NPC).
- updateDsrStatus enforces forward-only transitions; replays of the same PATCH from a stuck UI return either success (no-op) or 400 if status would regress.
