# Provider team routing, performance and private responses

Date: 2026-09-06. Baseline: `646c0602462b0e14b8455c4b87d49e453570fb57`.
Candidate corrections only. No production rollout, provider approval, money
movement, stored historical edit, schema migration or dependency change.

## Findings and decisions

### SEC-074: private response policy was missing outside file streams

Both admin and owner KYC routes returned signed links before setting their
no-store header. Provider 360 profile, support-note and contact responses also
lacked explicit cache protection. The baseline exercised actual HTTP responses:
both signed links had no Cache-Control header while both streams had it.

Use one small `privateResponse` middleware before authentication in the two
provider route families. All their current routes require an account. Drafts
reuse this policy; document streams retain their existing explicit header too.
Successful JSON, short-lived links, streamed documents and early errors now
receive `Cache-Control: private, no-store`. This changes HTTP storage policy,
not authorization, link lifetime or payloads. It does not purge older caches,
erase downloaded files or application memory, or verify every proxy/browser.
The policy is not mounted on catalog or other unrelated public routes.

### OPS-506: the team list was intercepted as a provider-profile request

The real mobile client uses `GET /api/v1/providers/staff` from My Team and the
active-job assignment picker. That literal route appeared after `GET /:id`.
After a successful invitation in the isolated HTTP test, PostgreSQL received
`staff` as a provider UUID and returned a server error. Move the unchanged team GET before the parameter
route. Keep the existing approved-provider and role checks, owner-derived scope,
DTO and shared operator staff service. Do not create a second team endpoint or
weaken guards to repair routing.

### OPS-507: completed team jobs were counted with a nonexistent status

The single-member and provider-wide performance queries checked `completed`,
which is not an app booking status. Five fixture jobs in the five established
completed states returned zero. Use `COMPLETED_BOOKING_STATUSES`, the existing
shared bucket, for both reads. This includes provider-completed work awaiting
customer confirmation; these are operational completion counts, not settled
earnings, payout eligibility or an assertion that all jobs were satisfactory.

### OPS-508: joining jobs to reviews multiplied review counts

Two visible reviews became six after the same member had three bookings.
Aggregate each member's jobs and visible reviews independently in lateral
subqueries, shared by the single-member and provider-wide reads. Existing
performer indexes support these reads. The populated provider list still uses two SQL
round trips (member records, then performance), not an application query loop
per member. No production-scale benchmark or pagination improvement is claimed.
Hidden reviews remain excluded; absent history remains zero. Current advisory
cached columns, headline provider ratings and financial calculations are unchanged.

## Executed evidence

- SEC-074 baseline: 4 failing HTTP tests, 3.328 seconds. Actual Express routers,
  JWT/session validation and KYC authorization run; account/document queries,
  storage and separate profile/note/contact/certificate service payloads are
  fixtures. This is header/route behavior, not full storage or database acceptance.
  Coverage includes admin cookie and owner bearer credentials, signed-link
  fallback, document bytes, disallowed roles, revoked sessions, password rotation,
  CSRF refusal, malformed/missing records and storage failure.
- OPS-506 baseline: 1 failed actual-PostgreSQL HTTP test, 1.620 seconds, after
  invitation succeeded. The final test checks owner listing, another provider's
  empty/populated list, ignored scope-spoofing input, operator linkage/masking,
  protected access and no incidental staff/audit edits during reads.
- OPS-507 and OPS-508 baseline: 2 actual-PostgreSQL failures, 1.265 seconds.
  Final cases exercise both shared read paths, zero history, all 17 canonical
  booking states, multiple jobs/reviews, visibility changes and record preservation.
- Focused correction run: **4 suites / 7 tests passed**, 2.214 seconds. Final
  test refinements add cookie-CSRF denial and confirmed jobs alongside reviews;
  complete final-suite verification follows below.

The database harness uses only an isolated loopback `*_test` database and one
unique owned schema per case. It applies actual migration 131 to the team fixture,
alongside the existing actual 172/173 setup. This is a focused schema harness,
not a full migration-chain or authenticated production/browser rehearsal.

### Final local verification

The complete final functional API run finished in **294.835 seconds**:
**981 suites / 3,426 tests passed**, **2 tests failed**, and **2 existing TODOs**
remained (983 suites / 3,430 tests total). The only failures were unchanged
nginx regressions UX-860 and UX-201 because Docker Desktop's Linux engine was
not running. No regression was skipped or weakened to hide those failures.
The PostgreSQL tests ran, including all three new team regressions.
API TypeScript, changed-file ESLint, `git diff --check` and the unchanged
regression-ID gate passed (1,582 titled regressions). The temporary test cluster
was stopped after confirming zero leftover fixture schemas/connections; the
existing local PostgreSQL service remained running.

**Fresh CI for this correction checkpoint is still required.** The preceding
`646c0602` CI receipt is for the submitted-evidence stage, not these later fixes.

## Still open

This does not complete D23 or E35/E74 re-acceptance. Provider approval is not yet
bound to a displayed submitted revision. Same-identity correction, immutable
decision history, reviewer assignment, applicant/reviewer notices and legacy
admission remain required. Staff invitation/acceptance and suspension/assignment
concurrency need further review. Team pagination and actual browser/device
acceptance remain open. No latest-Stitch or all-screen visual claim is made.

These findings supersede any assumption that the historical D23 completion
record alone proves current end-to-end correctness. The prior record is retained.
Release remains separate: matching API/admin/customer-provider artifacts, exact
migration 173 rehearsal and authenticated acceptance are still required before
master/production alignment. No hold or external sign-off is waived by these fixes.

## Independent CI receipt

Candidate `30bc13bee7be78d5da4f0baeec4e0bf7db8a48f5` passed all four jobs in
[CI 34037600893](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/34037600893)
and [Gates 34037600892](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/34037600892).
Actual API job `101498412672` logs explicitly pass SEC-074 and OPS-506/507/508,
plus the Docker-dependent UX-860/UX-201 tests unavailable in the local run.
All **983 API suites / 3,428 tests passed**, with two existing TODOs. Admin,
Mobile and Docker build/liveness jobs also succeeded. Packaging/retention of
an exact API/admin release candidate was not requested in this run and those
steps were skipped; the green run is not a deployable matched-release receipt.
This resolves fresh CI for the four corrections, not the remaining acceptance,
master merge or production deployment requirements. The later support-note
concurrency correction needs its own verification.
