# Preserved provider submission records

Date: 2026-09-06. Baseline: `1bea0623a207cfeb8c5a65abde33e6147582c1b5`.
E35/E74 remain open. Candidate stage only, not deployed or a completed
request-changes workflow. No money, approval, role, or legal-signoff changes.

## Finding and implemented correction

Initial application wrote only mutable provider/profile and catalog links.
There was no retained record of the original submitted fields. Later profile,
category-label, market-label or document-reference changes could replace the
evidence available for a future correction comparison.

Migration 173 adds typed `provider_application_revisions`, tied to the same
provider/owner identity. Initial submission captures revision 1 inside its
existing transaction, after canonical provider/market/category insertion and
before draft removal. It copies persisted accepted values, not a later profile
or client-supplied market name. Categories retain both IDs and names; they are
not priced services. Omitted optional answers remain null, not invented
defaults. Existing timestamps are retained; no agreement wording/version,
document verification or prior approval is fabricated.

Routine UPDATE, DELETE and TRUNCATE are rejected. Owner/provider and preceding
revision foreign keys, positive sequential version checks, private owner-key
prefixes, field/array bounds and questionnaire root-key/size checks constrain
stored rows. Nested questionnaire types remain the existing application
validator's responsibility, not a claimed complete SQL JSON schema. This is
not tamper-proof storage against an administrator who can alter the database.

The recorder requires exactly one inserted row. SQL failure, missing schema
or silently skipped insertion fails submission and rolls back the provider and
its links. Saved drafts remain available after rollback. No conflict-swallowing
fallback is used. Schema unavailability returns a safe 503 without SQL detail.
The existing owner lock still serializes duplicate initial submissions.

Private JSON/CSV archives include the recorded owner's retained revisions,
even when that account is no longer eligible to apply. Empty history is an
empty JSON array, not a reconstructed legacy application. CSV omits empty
sections. The NBI expiry date is exported as a calendar date, not a shifted
instant. A failed history read fails the archive, not a seemingly complete
partial download. No document URLs are minted and no applicant payload is
copied into generic admin audit events.

## Executed evidence

- OPS-502 baseline on isolated PostgreSQL 17.9 failed because real submission
  created zero preserved rows: 1 failed test, 2.011 seconds. The final test
  checks submitted fields, subsequent profile/catalog changes and an older
  client omitting optional answers.
- OPS-503 uses real constraint failure, zero-row insertion, missing schema and
  duplicate concurrent requests to check atomic admission and draft preservation.
  Existing OPS-490 final-draft-delete failure also checks zero surviving revisions.
- OPS-504 applies the actual migration and checks routine mutation rejection,
  ownership constraints, invalid revision chains/payloads and absent legacy
  history. It does not implement or test a resubmission endpoint.
- OPS-505 baseline failed both private-artifact tests, 1.026 seconds; its actual
  PostgreSQL case was explicitly skipped in that baseline invocation. Final
  coverage executes the real owner-scoped query and checks JSON/CSV artifact
  bytes, absent/inactive owners, immutable source data and read-failure handling.
  Other archive sections and artifact storage are fixtures, not full download
  authorization or object-storage acceptance.
- Final focused selection: **15 suites / 27 tests passed in 5.529 seconds**,
  no PostgreSQL skips. It includes authenticated HTTP applicant/admin handoff,
  real locking/rollback and actual migration 173 on focused schema fixtures.
  This is not the entire deployed migration chain or browser/native acceptance.
- API TypeScript and changed-file ESLint passed. The unchanged regression-ID
  gate passed with 1,578 titled regressions.
- Full local API execution was **not green**: **977 suites / 3,419 tests passed**,
  **2 tests failed** and **2 existing TODOs** remained, in 236.824 seconds. Both
  failures were unchanged nginx tests (UX-860 and UX-201) because the local
  Docker engine was unavailable. No tests were skipped or weakened to hide
  these failures. The final focused run above followed the last refinements;
  fresh CI must independently verify the complete candidate, including Docker.

The local test database was a separate temporary loopback-only cluster with
synthetic fixtures. The existing local PostgreSQL service and production data
were not changed. Each harness removes only its unique test-owned schema.

## Boundaries and next work

1. These records preserve **metadata and private object references**, not uploaded
   file bytes or object-storage retention. Verify existence, immutable uploaded
   objects, historical private streaming and reference-aware cleanup before
   offering evidence replacement. Do not claim Object Lock or legal retention.
2. Provider 360 approval still acts on the current pending provider. It does not
   yet bind decisions to a displayed revision. Reviewer history, stale-decision
   rejection, assignment and applicant/reviewer notices remain required. No
   applicant/admin revision-history screen is added here.
3. `sent_back` remains held; rejected applicants still cannot resubmit. Add
   reasoned same-provider correction, not rejection/recreation or an independent
   legacy approval state.
4. Before existing-provider resubmission, reconcile locking: initial submission
   and draft save lock the owner first, but approval/rejection reach the provider
   before updating the owner. Do not introduce opposite lock order across review
   and correction. Test actual waits, stale decisions, rollback and replay.
5. No legacy record is backfilled or re-approved. Keep legacy admission governed
   and distinguish missing historical evidence from an empty answer.
6. E21/E43 still require governed retention/erasure execution and backup/archive
   handling. Blocking routine mutation is not a policy of indefinite personal-
   data retention or evidence of complete account erasure.
7. Rehearse migration 173 and its provider identity index on the selected full
   candidate schema before rollout. Submission and account export both require
   it. The prior exact-image rehearsal through 172 does not verify 173. Paired
   API/admin/customer-provider release acceptance remains required.

No production migration/deployment, master merge, gate/protection change,
latest-Stitch comparison, complete admin audit or launch readiness is claimed.

## Independent verification after publication

Commit `646c0602462b0e14b8455c4b87d49e453570fb57` passed Gates `34034973223`
and all four jobs in CI `34034973228`. Completed API job `101491264936`
explicitly passed OPS-502 through OPS-505, plus both Docker-dependent nginx
regressions UX-860 and UX-201. The full API result was **979 suites / 3,421
passed tests / 2 existing TODOs**, in 123.209 seconds. This resolves the fresh-CI
uncertainty for this commit, not its production rollout or remaining lifecycle.
