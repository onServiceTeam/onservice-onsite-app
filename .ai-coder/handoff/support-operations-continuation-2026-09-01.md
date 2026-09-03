# Support operations continuation, 2026-09-01

## Scope read in full

- `apps/admin/src/pages/SupportTicketsPage.tsx`
- `packages/api/src/routes/support-ticket.routes.ts`
- `packages/api/src/services/support-ticket.service.ts`
- `apps/admin/src/pages/BookingDetailPage.tsx`
- `apps/mobile/app/support/index.tsx`
- `apps/mobile/app/support/new.tsx`
- `apps/mobile/app/support/[id].tsx`
- `apps/mobile/src/services/support.service.ts`
- `apps/mobile/src/utils/notification-navigation.ts`
- Customer and provider notification inbox screens
- Shared notification service and the relevant support, refund, and notification regression tests

## Verified operating chain

The current chain is real, not a mock-only UI:

1. Customer/provider creates an owner-scoped support case, optionally linked to a booking.
2. The server rejects a booking link that does not belong to that account.
3. Admin sees account persona, booking, owner, priority, status, public messages, private notes, and decision history.
4. Assignment, status, and priority mutations validate current state and write audit evidence.
5. Participant replies resume the correct waiting state.
6. Terminal cases block participant-visible replies while preserving private post-closure notes.
7. Refunds require an active booking-linked support case and append the outcome to that case.
8. Customer/provider notification taps and support threads return to the exact participant-appropriate work record.

## Defects fixed in this continuation

- **OPS-302:** Booking 360's no-case refund handoff omitted the account ID, so `new=1` opened the queue instead of the case form. The handoff now carries booking ID, customer ID, customer name, role, and creation intent.
- **OPS-303:** Equal-priority admin cases were ordered by original creation time, burying old cases with fresh replies. The service now orders by `updated_at` before `created_at`.
- **OPS-304:** The admin queue displayed `Created` while operational ordering depends on latest activity. It now displays `Last activity` from `updated_at`.
- **OPS-305:** Public admin replies produced no customer/provider inbox or push notification. A generic `support_update` notification is now written after the durable reply; no message body is exposed in push copy. Notification failure does not roll back the saved reply.
- **OPS-306:** Support notifications had no exact mobile destination. Customer and provider notifications now open `/support/[id]`.
- **OPS-307:** The participant support thread had no return path to its linked work record. It now opens the customer booking, provider job, or provider-staff job according to the signed-in role.
- **OPS-308:** The participant support inbox discarded API pagination and made cases after the first 20 unreachable. It now uses bounded infinite paging with an explicit Load earlier action.

Each defect has its own executed regression file. No source-text existence test was added.

## Verification at this checkpoint

- Admin: 251 passed suites, 1 skipped; 343 passed tests, 3 todos.
- Mobile: 505 passed suites; 884 passed tests, 84 todos.
- API: 686 passed suites, 1 skipped; 3,072 passed tests, 1 skipped.
- Admin, mobile, and API TypeScript checks passed.
- Repository lint passed with `--no-cache --quiet`.
- `git diff --check` passed. The only output was Git's Windows line-ending warning.
- Docker-only nginx certificate-revocation coverage remains intentionally excluded because the Docker daemon is unavailable.

## Safety state and remaining work

- Production was not changed.
- Do not merge/deploy until E50's production financial inventory and legacy-terms checks are complete.
- Production SSH remains blocked under E32. The canonical production path is `/opt/onservice`, with `/opt/onservice-onsite-app` as the clearer alias. Do not touch the separate Odoo addon path.
- E31/D33 still blocks direct goodwill/wallet adjustment authority until caps and dual-control thresholds are approved. The support/refund work here does not bypass that hold.
- The next safe audit slice should trace dispute decisions and payment/refund outcomes back through customer/provider notifications and the admin case workspace, then inspect unread/attention semantics without pretending cumulative message counts are unread counts.
