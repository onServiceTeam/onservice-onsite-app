# E43: Direct account deletion bypasses the DPO DSR queue

Date: 2026-08-31
Status: OPEN
Area: Customer account deletion, data-subject rights, admin compliance operations
Risk: Compliance and operational case-tracking gap

## What was found

The product exposes two customer entry points for erasure:

1. `POST /api/v1/compliance/dsr` with `requestType = erasure` creates a
   `data_subject_requests` row and then best-effort calls
   `requestAccountDeletion`.
2. `POST /api/v1/account/deletion` calls `requestAccountDeletion` directly and
   creates only an `account_deletion_requests` row.

The first path reaches both admin surfaces. The second path reaches the Account
Deletions surface but does not create a DSR case for the DPO Compliance queue.
There is no schema link between the two records.

This contradicts the earlier CRIT-84 remediation requirement in
`.ai-coder/audit-2026-05-01/findings/D05-account-data-rights-terms.md`, which
requires either customer entry point to produce one coordinated deletion and
one coordinated DSR record without duplicates.

## Why this is a hard stop

A customer can invoke an erasure right through the ordinary account-deletion
screen without the DPO queue receiving a case or its 15-day due date. Fixing
this correctly affects compliance case ownership, idempotency, transactional
behavior, and the relationship between two production tables. A partial UI
rename would hide rather than solve the admin linkage failure.

## Additional accuracy issue

`compliance.service.ts` says an erasure auto-link failure is surfaced through
the DSR's `user_message`, but the catch block only writes a warning log. The DPO
record is not updated, so the admin case does not show the failed deletion
kickoff promised by the comment.

## Recommended resolution

Treat the DSR as the canonical compliance case and the deletion request as the
execution workflow:

1. Add an explicit, unique relationship between the two records.
2. Create or reuse both records through one transaction-safe orchestration
   service, regardless of which customer screen starts the request.
3. Preserve one active deletion and one active erasure DSR per customer.
4. Record blocked execution reasons on the DSR in a dedicated admin-visible
   field or event, not in customer-authored `user_message`.
5. Make cancellation semantics explicit. Cancelling the 30-day execution
   request must not silently erase the DPO's compliance case or audit history.
6. Add bidirectional behavioral tests for fresh submissions, duplicates,
   blocking bookings/disputes/wallet balances, cancellation, and retry.
7. Then consolidate the two customer screens so Account & Data is the execution
   status surface and Data Rights explains and links to the same case.

## Work paused

No production-table or money/compliance workflow change was made in this audit
wave. Unrelated customer UX and linkage auditing can continue safely.
