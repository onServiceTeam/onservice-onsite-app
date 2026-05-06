# E05 — Provider checklist "Report Issue" endpoint does not exist (2026-05-06)

## Discovered
Phase 15 audit, while sweeping mobile TextInputs for missing maxLength.

## What's broken
The provider checklist screen (`apps/mobile/app/provider/job/[id]/checklist.tsx`,
lines 221–245) lets a provider tap "Report Issue" on any checklist item, type
a description in a modal, and tap "Send Report". The handler `submitIssue()`
posts to `POST /api/v1/bookings/:id/issues` with `{ itemId, description }`.

**This endpoint does not exist on the backend.**
- No route handler in `packages/api/src/routes/booking.routes.ts` or any other route file
- No service in `packages/api/src/services/`
- No table in `packages/api/migrations/`
- No reference anywhere in the API source

The mobile catch-block silently eats the resulting 404 and shows a
fabricated success message:

```ts
} catch {
  Alert.alert('Reported', 'Issue saved locally; will sync when you are back online.');
}
```

There is no local persistence either — no AsyncStorage write, no offline
queue, nothing. The issue text is dropped on the floor.

## Customer-visible impact
- **Customers never receive issue reports.** The hint text in the modal says
  "Describe what went wrong. The customer will be notified." — but no
  notification is ever sent.
- **Disputes are weakened.** A provider who hits "unable to reach area —
  customer not home" mid-job has no audit trail when the customer later
  disputes the no-show.
- **Provider trust is broken.** The provider sees "Reported" in green text and
  trusts the platform recorded it. They later discover their report never
  existed.

## Fix options

### Option A — build the endpoint (recommended, ~3-4h)
1. Migration: `migrations/127_booking_checklist_issues.sql` — new
   `booking_checklist_issues` table:
   ```sql
   CREATE TABLE booking_checklist_issues (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
     item_id TEXT NOT NULL,             -- references checklist item key
     reported_by_provider_id UUID NOT NULL REFERENCES providers(id),
     description TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX idx_booking_checklist_issues_booking ON booking_checklist_issues(booking_id);
   ```
2. Validator: `validators/booking.validators.ts` — add
   `reportIssueSchema` with `itemId: z.string().min(1).max(100)` and
   `description: z.string().min(5).max(2000)`.
3. Route: `routes/booking.routes.ts` — add
   `router.post('/:id/issues', authMiddleware, validationMiddleware(reportIssueSchema), ...)`
   that requires the caller to be the booking's matched provider, INSERTs
   the row, AND fires a customer notification (type='checklist_issue', data
   payload includes itemId so the customer-side issue-list screen can
   route correctly).
4. Service-side notification + UI: hook into existing
   `notification.service.ts` so customer's notifications.tsx routing
   already covered by Phase 57/100 dispatches the issue to the customer's
   booking detail.

### Option B — remove the feature (bad)
Pull the "Report Issue" button entirely from the checklist screen. The
provider loses a useful in-job signaling tool, but at least the UI no
longer lies. Probably not what Ken wants.

### Option C — keep current behavior, fix the message (band-aid, ~30min)
Drop the fake "saved locally" text. Show the actual error from the API
("Endpoint not found"). The button still doesn't do anything useful but
at least it's honest. Customer still never gets the report. This is the
minimum-honesty option pending a real fix.

## Recommendation
**Option A.** This is a small build (3-4h), the table + route + validator
match patterns the codebase already uses heavily, and the customer-
notification hookup is the same pattern used for change-orders and
disputes. The feature already has a UI shipped — wiring the backend
brings honest functionality.

In the meantime, Phase 195 has applied **Option C** (the band-aid) so
the misleading message stops shipping immediately while the real fix
awaits Ken's call.

## Status
- **Awaiting Ken's call** between A / B / C.
- Phase 195 immediate-honesty patch landed: the catch-block now surfaces
  the real error message via `getErrorMessage(err, ...)` instead of
  fabricating "saved locally".
