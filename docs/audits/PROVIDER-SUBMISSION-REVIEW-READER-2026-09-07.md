# Exact submitted application evidence for operator review

Date: 2026-09-07. Baseline: `8e755bdcdd820423d9207b7db081bc78078e2d7e`.
Application: onService PH marketplace. E35/E74 remain open. This is a tested
read-only API stage, not a completed admin screen, revision-bound approval,
correction/resubmission workflow or production deployment.

## Gap and selected implementation

Migration 173 preserves submitted fields, but Provider 360 still reads the
mutable profile and current KYC references. Operators had no mounted API for
the exact captured revision or its original documents. Reconstructing a past
application from current profile/catalog data would misrepresent the evidence.

Keep the existing provider identity and approval authority. Add three private
Provider 360 reads under `/api/v1/admin/providers/:id/application-revisions`:

- The collection returns newest-first summaries, default 20 and maximum 100.
  `beforeRevision` is an exclusive positive-integer cursor. The existing
  provider/revision index supports paging without loading every submission.
  Presence, current provider status and the page share one database statement.
  An empty older page is distinct from `historyState: not_recorded` on a
  provider without captured evidence. Unknown providers return 404.
- `/:revisionId` returns the exact captured business/location/market/category
  fields and original labels, optional questionnaire/ID/experience/date fields,
  version identifiers and actual agreement/submission/recording timestamps.
  Omitted optional answers stay null. `currentStatus` is separate operational
  context, not a claim that this revision was approved. Current profile,
  catalog names and priced services are not substituted.
- `/:revisionId/kyc/:docType` resolves the original document key under both
  provider and revision IDs. It validates the stored owner prefix and key,
  then streams through existing private storage. The four KYC references in
  detail responses are authenticated proxy paths, not storage keys/URLs.
  `mode=link` does not mint a historical bearer URL. Missing original bytes
  fail rather than silently returning a newer document.

Both operations roles retain access. Customer, provider, provider-staff and
privacy-only DPO accounts cannot use these admin reads. Existing canonical
session, active-account and mandatory-password-rotation enforcement runs first.
Every success and early error inherits `private, no-store`. Missing revision
schema is a stable, non-sensitive 503, never a seemingly empty legacy history.
Unknown collection query keys, repeated values and invalid bounds are rejected.

No migration, dependency, state transition, role grant, approval, financial
policy, notification, retention rule or historical record changes. The reader
does not copy application payloads into general audit events or manufacture a
legacy submission. It adds no claim of a complete audited evidence-access trail.

## Executed evidence

- Initial isolated PostgreSQL baseline: OPS-510 and OPS-511 both failed with
  HTTP 404 instead of the required evidence/stream response, 2.911 seconds.
  An earlier attempt stopped at a Windows dependency permission error before
  tests ran; the scoped authorized rerun produced this actual baseline.
- First implemented selection: seven suites passed, one failed, 4.604 seconds.
  Express's simple query parser treated `limit[]` as an unknown key, silently
  using the default. Strict collection-key validation fixed that discrepancy;
  the regression was not weakened.
- Final focused selection: **8 suites / 13 tests passed**, 5.259 seconds, no
  PostgreSQL skips. OPS-510 covers exact original values after mutable changes,
  pagination during newer inserts, missing/foreign/legacy revisions, absent
  optional fields, invalid queries and missing schema. OPS-511 covers each
  original document, later/current-document separation, cookie authentication,
  role/current-session restrictions, cross-provider IDs, missing bytes and
  unchanged original rows. Existing OPS-502 through OPS-505, SEC-074 and UX-573
  also passed.
- Full final local API execution: **984 suites / 3,428 tests passed**, two
  failed and two existing TODOs (986 suites / 3,432 tests total), **239.303
  seconds**. Only unchanged UX-860 and UX-201 failed because the Docker Desktop
  Linux engine was unavailable. Actual PostgreSQL tests executed. This is not
  a green full local suite; fresh exact-commit CI remains required.
- API TypeScript, final changed-file ESLint and the unchanged regression-ID
  gate passed (1,585 titled regressions). Diff formatting passed.

The new tests use real Express routes, JWT/current account checks, services and
PostgreSQL against guarded loopback `*_test` schemas with synthetic parents and
actual migrations 172/173. Only settings and document storage are substituted;
streamed synthetic bytes identify the selected original key. Later revisions
are explicit database fixtures, not a claimed working resubmission endpoint.
This does not verify actual stored production bytes, the full migration chain,
load capacity, a browser session or any live provider's vetting.

## Required continuation

1. Wire the exact-submission panel into Provider 360 with every recorded field,
   private document viewing, legacy/missing/error/paging states and clear
   separation from current profile data. Verify rendered and browser behavior.
2. Bind approval/rejection to the displayed revision, immutable decision history
   and stale-review rejection. Standardize owner/provider locking before adding
   correction writes; test actual concurrent decisions and resubmissions.
3. Complete reasoned changes-requested, same-provider correction/resubmission,
   reviewer assignment and applicant/operator notification linkage. `sent_back`
   remains held until that complete path works.
4. Verify original document-byte preservation and reference-aware retention,
   governed legacy admission and E21/E43 privacy execution. Metadata immutability
   and private HTTP responses do not prove any of those requirements.
5. Verify the selected exact API/admin/customer-provider artifacts, migration
   173 on the full restored schema, authenticated journeys and safe live rollout.
   Local and GitHub review-branch publication is not master/production alignment.

No master merge, production inspection/change, live credential test, latest
Stitch comparison, complete operator-console audit or launch readiness is
claimed for this stage.

## Independent CI receipt and subsequent UI stage

Reader commit `ee16e2e38a286439b5b4e7b450f3fe9eab8deaf5` passed CI
`34082814032` and Gates `34082814039`; completion was reverified on September
30. Completed API job `101621212091` explicitly passes OPS-510, OPS-511,
UX-860 and UX-201: **986 suites / 3,430 passing tests**, two existing TODOs.
All four CI jobs succeeded. API/admin release packaging was not requested,
so this is not a matched release-artifact receipt.

The subsequent operator panel and its explicit remaining limits are recorded
in `docs/audits/PROVIDER-SUBMISSION-REVIEW-UI-2026-09-30.md`. That screen stage
supersedes the API-only UI status above, not the remaining revision-bound
decision, correction/resubmission, privacy or deployment requirements.
