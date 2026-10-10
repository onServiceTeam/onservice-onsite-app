# Provider decisions tied to the application reviewed

Date: 2026-09-30. Base: `4b73c29d909c94dc072a87ad01fa0176c87d19fd`.
Application: onService PH marketplace. This candidate binds approval and
rejection to preserved evidence. It is not deployed, does not complete E35/E74,
and does not authorize legacy approvals, production backfills or a launch.

## Chosen engineering contract

Under Ken's delegated engineering approval, continue the unified lifecycle in
`docs/architecture/provider-application-lifecycle.md`: one provider identity,
typed submissions and immutable decisions, with Provider 360 as the operating
authority. Reviving the disconnected progress table would reintroduce two
competing approval systems. Recording a reason only in mutable provider fields
would not prove which application was reviewed. Neither alternative was chosen.

Migration 174 adds one decision per preserved revision, a composite foreign key
to that provider's revision, reviewer identity, outcome, bounded reason, approval
checklist summary and database time. Routine update, deletion and truncation are
refused. This is not proof that document bytes cannot change or approval to
retain personal data forever. It neither rewrites old events nor fabricates
decisions for legacy providers.

Both direct admin routes and the compatibility decision route require
`expectedRevisionId`. The canonical service locks the provider and rechecks
pending status, the latest revision and absence of a prior decision. Missing or
invalid IDs fail; foreign, stale, absent-history or previously decided revisions
conflict. Missing schema fails closed with 503. The provider change, eligible
owner-role change, immutable decision, admin action and applicant inbox notice
commit together. A final notification failure rolls all of them back.

Approval preserves the existing current-account/fraud and four-document checks.
It additionally refuses changed current KYC references when they do not identify
the reviewed original objects. Normalized legacy URLs identifying those same
objects remain supported. Missing current references retain their precise
validation failure. Rejection closes an application, not a request for changes;
the existing `sent_back` hold remains. Free-text rejection reasons are no longer
copied to ordinary service logs. The private history and applicant notice still
retain the reason where it is required.

## Admin interaction and linkage

The directory dialog and Provider 360 approval/rejection controls load and show
the actual latest preserved submission. Decision controls mount only after the
index and exact detail validate. Both reads must advertise decision contract
version 1, so a new screen cannot submit a revision to an older API that silently
ignores it. Current profile fields are not a substitute for absent evidence.

Approval requires the existing ten attestations and rationale; rejection
requires an applicant-facing reason. Both send the displayed revision ID.
Reloading evidence unmounts the form and clears old attestations/reason; failed
reads, changed status, a recorded decision or a new operator session block the
form. The actual API still checks the revision at commit time. Pending writes
disable decision controls; errors preserve the current review for an explicit
retry. A rejection dialog warns before discarding an unsaved review.

The historical reader now displays the recorded decision, reviewer ID, rationale,
checklist and time separately from current provider status. It distinguishes
no recorded decision from an older server that supplies no decision contract.
Original account-name and agreement-wording gaps remain explicitly stated.

## Executed verification

- OPS-512 failed before implementation: a stale revision successfully approved
  after a newer revision existed. It passes after correction, covering stale,
  foreign, invalid and legacy-absent evidence with no decision writes.
- OPS-513 executes real PostgreSQL rollback on final-notice failure for both
  outcomes, successful typed history, duplicate refusal and actual migration
  mutation guards. OPS-514 observes real blocked database sessions, commits a
  newer revision while review waits, and races approval against rejection.
  Exactly one decision, audit and inbox record wins.
- OPS-515 exercises both mounted HTTP entry points with real authentication and
  PostgreSQL. OPS-516 checks private historical decision reads, current-profile
  drift and missing migration 174. OPS-517 verifies replacement KYC refusal and
  normalized references to the original objects. These use isolated synthetic
  schemas, not production records or a full migration-chain rehearsal.
- The provider API selection passed **138 files / 306 tests**, 26.047 seconds.
  Its first run had three failures in older fixtures: two used a placeholder
  rather than the actual submission ID, and a truncation assertion encountered
  the new foreign key before the immutability trigger. The corrected fixtures
  retain their original handoff and mutation-rejection assertions. OPS-517 was
  added afterward and separately passed in 1.566 seconds.
- UX-1378 exercises both outcomes at both real-rendered admin entry points and
  asserts the submitted ID/reason. UX-1379 covers evidence retirement and fresh
  same-operator sign-in. UX-1380 covers historical decisions and refusal of an
  older unversioned server. Seven updated UI files passed seven tests in 11.75
  seconds; the later UX-1380 passed separately in 2.40 seconds. Prior approval
  bounds, missing-evidence, dialog/focus and failed-retry assertions remain.
- The full local API run passed **989 suites / 3,433 tests**, with two existing
  TODOs, and failed exactly two Docker-dependent nginx checks because the local
  Docker engine was unavailable (410.239 seconds). This is not a green suite.
  The run began before OPS-517. Fresh CI must execute all tests, including those
  nginx checks and the added database regressions.
- The full two-worker admin run passed **596 files / 704 tests**, with one
  skipped file and three TODOs (541.38 seconds). It began before UX-1380.
  API TypeScript and the admin production build passed. The first build caught
  two mistakes in the new UI test fixture's types; they were corrected without
  suppressions. The successful build took 16.36 seconds. Changed TypeScript
  lint, diff checking and the unchanged **1,597-ID** gate passed.
- UX-1381 runs the compiled real App with synthetic HTTP at **1440, 1024, 768
  and 390 pixels**, both entry points and both decisions: **16 passing decision
  journeys**, plus four repeat read-only UX-1377 journeys. All four original
  document controls open, decode a synthetic image and close. Each decision
  sends one exact revision-bound payload. Page/dialog horizontal-overflow,
  unexpected-request and browser-exception checks pass. The final browser run
  passed in 30.050 seconds. Top, control and full-page captures are retained
  privately; representative phone/tablet/desktop views were inspected. Existing
  narrow stacked-header geometry and keyboard checks also pass.

Browser auth and images are synthetic, not real paired-server/storage acceptance.
The image is one pixel, not a KYC authenticity or PDF rendering test. Full-page
captures alone distort fixed navigation placement, so viewport captures were
also inspected. No native or full latest-Stitch acceptance is claimed. No mobile
source changed; its fresh CI remains a separate required result.

Final focused reruns: `jest --runInBand provider` passed 138 files / 295 tests
in 31.817 seconds, including the later document-drift regression. This path-name
selection differs from the earlier broader selection above; its smaller test
count is not a removed assertion. All eight updated admin decision files passed
eight tests together in 12.75 seconds, including the later history test.

## Remaining lifecycle and release work

1. Standardize owner/provider locking before introducing correction writers.
   This slice deliberately retains existing provider-before-owner review
   locking. It does not claim a global deadlock fix. Future revision writers
   must serialize on that same provider identity; the full correction flow is
   not yet implemented.
2. Build reasoned changes-requested, same-provider applicant correction and
   resubmission, reviewer assignment and corresponding participant notices.
   Preserve earlier submissions and decisions. Rejection is not a substitute.
3. Complete governed legacy admission. Missing original history blocks new
   decisions; no old account is silently promoted, demoted or re-reviewed.
4. Reconcile the retained ten-item checklist with the separate operations
   reference-contact/score rubric. A contactable-reference checkbox is not proof
   of a completed reference interview or an operations score.
5. Complete E21/E43 retention and data-rights treatment for decisions, including
   applicant versus internal rationale, original objects and backups. The owner
   archive's existing submitted-revision section is unchanged; it does not yet
   include this new decision table. Do not claim a complete personal-data export
   or automatically disclose internal approval rationale without that review.
6. Run fresh CI, rehearse the entire selected-image migration chain through 174,
   verify matched API/admin/customer-provider artifacts and real authenticated
   journeys, then follow the governed publication and rollback runbooks. Deploy
   schema/API/admin together. Older clients without a reviewed revision cannot
   decide against this API; newer clients refuse an older decision contract.

No production data, credentials, payments, holds, gate configuration, branch
protection or dependency changed. No master merge or live alignment is claimed.

## Interruption recovery and fresh verification, 2026-10-08

The September candidate survived locally but was still uncommitted. GitHub and
local HEAD both remained `4b73c29d`; PR 81 was open with successful checks for
that older commit only. No work between the interruption and this recovery is
claimed. The interrupted final OPS-512 assertion had not been written; it now
explicitly verifies that refused decisions leave the decision table empty.

The former temporary database and preview were absent. A newly created,
identity-checked loopback PostgreSQL 17 database contained only synthetic test
fixtures. Fresh verification on the recovered candidate:

- OPS-512 through OPS-517: six suites / six tests passed, 35.580 seconds.
- Provider API selection: 138 suites / 295 tests passed, 49.595 seconds, with
  no database skips. This is not a fresh full-API-suite result.
- Eight changed admin behavior files: eight tests passed, 33.99 seconds.
- API TypeScript, admin TypeScript/build and changed-TypeScript lint passed.
  The admin bundle transformed 2,925 modules and built in 31.35 seconds; the
  three provider page/review chunk identities match the September build.
- The unchanged regression-ID gate passed with 1,597 titled regressions;
  whitespace checking passed. Neither is a substitute for all CI gates.
- Fresh compiled-browser checks passed both tests / all 20 journeys in 36.232
  seconds. Phone, tablet and desktop samples were visually inspected. Captures
  use a separate ignored output directory, preserving September screenshots;
  the harness now accepts an explicit per-run capture destination.

The broader September full-suite receipts and their Docker failures above
remain historical evidence, not newly rerun results. Fresh CI for the new
commit, full release/migration rehearsal through 174, legacy admission and
real paired authentication/storage acceptance still gate promotion. No
production connection, migration, deployment or live financial action occurred
during this recovery.
