# Provider support-note deletion and audit correctness

Date: 2026-09-06. Baseline: `30bc13bee7be78d5da4f0baeec4e0bf7db8a48f5`.
Application: onService PH marketplace. Candidate correction only, not a live
deployment or a complete operator-console audit.

## Finding and selected correction

OPS-509: two overlapping authenticated Provider 360 DELETE requests both
returned HTTP 200 for one note. The transaction read author/provider/deleted
state without a lock, then ran a conditional soft-delete without checking the
affected-row count. Its unconditional audit insertion could therefore record
a successful deletion even when that transaction had deleted nothing.

Choose a row-level database lock and affected-row check inside the existing
transaction. Note editors already lock the same note. A competing deleter now
waits, then sees the committed deletion and returns the existing HTTP 409.
A suppressed/no-row update also returns a conflict without an audit insertion.
Scope the final UPDATE by both note and provider ID as well. This uses the
existing primary-key lookup and does not introduce a per-process mutex, new
dependency, table-wide serialization or replacement API. It is designed for
shared-database API replicas, not a claim of a production load benchmark.

The author and super-admin permissions, 10-1000-character trimmed reason,
500-character audit summary/full rationale, soft-only deletion and atomic
audit failure rollback remain unchanged. The note row is preserved, not erased
from history. A misleading source comment claiming a foreign key from the
polymorphic audit target was corrected; no database constraint was changed.
Existing duplicate audit history, if any, is not silently rewritten.

PHASE164-01's old test checked source text and the presence of a comment. It
could not prove that the reason cap actually worked. Replace it with real HTTP
requests and PostgreSQL assertions covering short/blank/overlong rejection,
whitespace normalization, exact 10/1000 boundaries and full audit rationale.
This repairs test evidence, not a newly claimed reason-validation defect.

## Executed and pending verification

- First fixture attempt: two setup failures in 2.229 seconds. It skipped the
  predecessor audit-constraint transformations required by migration 159.
  Adding actual migrations 120/121 corrected the fixture; no historical SQL
  was edited and the setup failure is not a production migration bug claim.
- Actual pre-fix baseline: OPS-509 failed with responses `[200, 200]` instead
  of `[200, 409]`; the replacement reason-boundary test passed. Two suites,
  one failure / one pass, 18.668 seconds.
- First corrected focused run: **6 suites / 67 tests passed**, 2.86 seconds.
  This includes real concurrent requests, winner attribution/reason, exactly
  one deletion audit, retained note fields, filtered live list, repeat conflict,
  other-admin/customer/anonymous/cross-provider denial, super-admin override,
  audit insert failure rollback, suppressed update, and both edit/delete orders.
- An additional unrelated-note progress assertion was added after that run.
  The final focused rerun passed all **6 suites / 67 tests**, 2.472 seconds,
  including creation/deletion of an unrelated note while two writers wait.
- The complete final local API run finished in **336.759 seconds**:
  **982 suites / 3,426 tests passed**, two tests failed and two existing TODOs
  remained (984 suites / 3,430 tests total). Only unchanged UX-860 and UX-201
  failed because Docker Desktop's Linux engine was stopped. The actual
  PostgreSQL regressions ran; no test was skipped or weakened for this result.
  This is not a green full local suite. Fresh exact-commit CI remains required.

Tests execute the real Express router, JWT/session validation, note services
and PostgreSQL transactions. Parent account/provider tables are synthetic.
The guarded harness accepts only loopback `*_test`, owns a unique schema, and
applies actual migrations 052/075/076/120/121/159 on those parent fixtures,
alongside its reused migration-172 draft setup. A local UUID shim supports
PostgreSQL 17; UUID-version behavior is not tested. This is a focused schema
fixture, not a full production migration-chain rehearsal. Barrier checks
observe actual database wait dependencies. Failure triggers and all note
mutations exist only in the owned disposable test schema.

## Remaining work

No production note was created, changed or deleted. No migration, financial
policy, access role, application status, notification policy or retention
rule changed. UI layout and copy are unchanged; a live two-browser support
exercise and the full latest-Stitch acceptance are not completed here.
Optimistic edit-version warnings and the complete correlated E37 audit trail
remain separate work. This is also not completion of E35/E74 revision-bound
provider decisions, same-identity correction/resubmission or historical private
evidence. The existing review branch still needs exact matching release
artifacts, migration 173 rehearsal, authenticated acceptance and safe alignment
with master/production.
