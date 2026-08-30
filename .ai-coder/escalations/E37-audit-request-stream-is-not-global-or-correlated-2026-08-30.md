# E37: The audit request stream is not global or correlated

**Date:** 2026-08-30
**Severity:** High compliance, support-investigation, and accountability risk
**Status:** Open hard stop for global audit-capture architecture
**Found during:** Admin Audit Log and cross-role traceability W12

## Bad news first

The repository repeatedly described `auditMiddleware` as globally capturing all
POST, PUT, PATCH, and DELETE activity. That is not true. The middleware module
is never imported or mounted by the API. Its counters are not consumed by the
health endpoint. The `request_id` column created for `audit_log` is not written
anywhere.

The current Admin Audit Log therefore combines two useful but incomplete
sources:

1. `admin_actions`, populated by selected explicit admin-operation writers; and
2. `audit_log`, populated by selected compliance, feedback, and support events.

It is not a complete HTTP request trail, not a complete mutation trail, and not
a request-to-business-record correlation system. Historical route comments and
the previous UI labels overstated the evidence available to support staff.

## Why simply mounting the middleware is unsafe

- It replaces `res.json` and starts the database insert after response handling.
  A state-changing response can succeed while its audit insert later fails.
- The recorded row does not carry request ID, response outcome, response status,
  error state, transaction identity, or a reliable before/after record.
- It derives entity type from the first URL segment, which is commonly `api`,
  and only discovers UUID-form IDs in the path.
- Its fail-closed threshold cannot protect the first failed writes because the
  failure is observed after those responses. The counters also disappear on
  process restart and are not currently monitored.
- Mounting it could create duplicate or contradictory records beside explicit
  `admin_actions` writers without an exactly-once or canonical-event rule.
- Production row volume, existing coverage, retention, indexes, and personally
  identifiable data exposure cannot be checked while E32 blocks the verified
  server session.

This changes the compliance and operational evidence architecture. It cannot be
treated as a page-local fix.

## Required correction

1. Inventory every state-changing customer, provider, provider-staff, admin,
   support, payment, payout, booking, dispute, work-order, and settings action.
2. Define one canonical event contract containing a server-generated request or
   correlation ID, actor, role, action, record type and ID, outcome/status,
   timestamp, reason where required, and privacy-safe structured change data.
3. Decide which audit evidence must commit in the same database transaction as
   the business mutation and which operational request telemetry belongs in a
   separate durable sink.
4. Prevent duplicate events when explicit domain audit writers coexist with any
   request-level telemetry.
5. Add field-level secret and PII controls, retention, append-only integrity,
   indexes, monitored failure behavior, and a tested recovery/backfill process.
6. Add executed tests for success, validation failure, authorization denial,
   domain failure, transaction rollback, response failure, duplicate delivery,
   process restart, and audit-store outage.
7. After E32 is cleared, back up production and inspect aggregate row counts,
   writer/action coverage, null correlation IDs, retention, and query plans
   without printing personal data.

## Safe W12 containment

- The Admin page now calls the two inputs “Admin decision” and “System event”
  and displays the coverage boundary.
- The list and CSV export use the same union, source filters, exact record
  filters, Manila date semantics, deterministic ordering, and masked bulk data.
- Route and middleware comments no longer claim that global capture is active.
- No middleware was mounted and no audit, money, booking, or production record
  was mutated by W12.
