# Provider draft expiry scheduling and account archive linkage

Date: 2026-09-06. Base: `6e45180e5e0d5e1e5f3a086f915abfe74a907c88`.
Candidate corrections OPS-500 and OPS-501. Not deployed; E21/E35/E74 remain open.

## Findings and decisions

The draft service already hid expired rows and offered bounded deletion, but
no worker invoked it. Expired identity metadata could remain indefinitely.
Separately, the account export gathered sixteen other record sections but
omitted an applicant's retained unsubmitted draft.

Keep the approved 30-day-since-save engineering default and existing SQL. Add
one independent `provider-application-draft-expiry` job every five minutes,
at most 100 unlocked expired rows per attempt. Three attempts use exponential
backoff starting at one minute. Keep 30 completed and 100 failed job records.
The actual worker ignores queued deletion parameters, returns only the count,
and propagates a failure to BullMQ. Existing money-related jobs are unchanged.

At one successful full batch per scheduled interval, nominal capacity is
28,800 rows per day. This is not a latency or throughput guarantee: queue
contention, downtime, locks and failures can delay expiry. Retries are also
bounded per attempt. Repeated full batches or failures need investigation;
there is no new production backlog dashboard or measured load-test result.
Do not invoke an unbounded drain or expand this job into deleting documents.

The archive adds the explicit `providerApplicationDraft` section. Only the
requested owner's row is selected, including expired-but-still-retained data.
It does not reuse applicant eligibility, renew saved timestamps, issue document
URLs or expose a new admin draft-viewing route. JSON and CSV retain fields,
revision, creation/save/expiry timestamps and a database-evaluated `expired`
flag. No row means null in JSON and no draft section in CSV, following the
existing serializer. A failed read fails the archive instead of silently
reporting incomplete success. Migration 172 must precede this API rollout.

## Actual local evidence

- OPS-500 before wiring: two failures and one explicitly skipped PostgreSQL
  test, 6.877 seconds. The schedule was absent; the unknown job returned an
  empty result rather than executing or propagating the cleanup failure.
- OPS-500 after wiring: four suites / five tests passed, two PostgreSQL tests
  skipped across the five-file selection, 3.741 seconds. This included existing
  change-order expiry, gateway retry and held-quality-scheduler regressions.
- OPS-501 before correction: two failures, one PostgreSQL skip, 0.643 seconds.
  The actual serialized JSON omitted the draft; the failure case still wrote
  an artifact. An earlier sandbox dependency-read failure did not run tests
  and is not counted as a regression failure.
- Combined focused selection after both changes: ten suites / fourteen tests
  passed, three PostgreSQL tests skipped across eleven files, 1.643 seconds.
  This covers JSON/CSV persistence, incomplete-export failure and existing
  owner/download/expiry/processing-lease/storage regressions.
- Changed-file ESLint and API TypeScript passed. Fresh CI, including actual
  PostgreSQL execution, is required after publication. Local skips are not
  database passes.

OPS-500 substitutes BullMQ delivery and captures the real worker processor.
Its PostgreSQL case creates 102 expired drafts plus one active draft under
the actual migration. One expired row is locked on a separate connection.
The worker must remove 100 unlocked rows, then two after lock release, then
zero, while the active draft and all fixture users/providers remain identical.
No production worker or real Redis retry delivery is exercised by that test.

OPS-501 calls the real archive generation/serialization code with storage and
database fixtures for its local tests. Its guarded PostgreSQL case executes
the actual new draft query for two owners and an absent owner, checks retained
expired versus active data, changed account eligibility, and unchanged rows.
Other archive sections deliberately return empty fixtures in that case. It
does not prove their joins, full archive snapshot consistency, actual storage
or authenticated download. Both guarded cases require the existing isolated
localhost `*_test` service in CI and fail CI configuration without it; their
unique test-owned schemas are removed in `finally`.

## Privacy and operator boundary

The draft-specific inventory is in
`docs/architecture/provider-application-lifecycle.md`. Account anonymization
currently updates the owner but does not erase this row. Onboarding objects,
submitted evidence, financial records and backups are untouched by this job.
An already-created private export can retain a draft copy during the existing
seven-day archive lifetime. These distinctions remain visible limitations,
not an approved legal retention matrix or complete DSR fulfillment.

No dependency, migration, admin permission, consent wording, money path,
production record or live application changed. No admin erasure button is
added. The next acceptance steps are actual queue/backlog operation and owner
export/download on the selected paired candidate, then the governed review
revision/request-changes/resubmission lifecycle and remaining screen audit.

## Prior checkpoint verification

The base commit passed CI `34029581600` and Gates `34029581613`. Completed
logs show 973 API suites / 3,409 passes / 2 TODOs, 591 passing and one skipped
admin files / 698 passes / 3 TODOs, and 594 mobile suites / 878 passes / 84
TODOs. API-image build/liveness also passed. These results cover the earlier
release-observer and TOTP diagnostic corrections, not this subsequent draft
change. They do not establish full screen, business-flow or live-release
acceptance.
