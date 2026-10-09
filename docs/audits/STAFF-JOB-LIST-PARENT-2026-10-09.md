# Staff job list privacy audit October 9 2026

## Finding and correction

SEC-079 reproduces a staff job-list disclosure on verified candidate
`2dc18a3ddcdef819cb01d10e55c14b19bb6bd51e`. The list joined a booking's
performer to approved staff membership but did not require the booking's
provider to be that membership's provider. A retained performer relationship
could expose an unassigned or another provider's job, customer name and address.
It also labeled that other job with the staff member's own provider business.

The fixture deliberately creates individually valid D23 foreign keys with an
inconsistent parent relationship. The normal assignment service already refuses
these relationships. This is not a claim that ordinary assignment created them,
that production contains them or that a live disclosure occurred.

The correction adds the exact parent-provider equality to
`getAssignedJobsForUser`'s SQL join. It hides invalid relationships without
deleting performer attribution, changing approval states or repairing data.
The existing list fields, ordering, limit and approved-membership predicate
remain. No money policy, migration, dependency, issuer, workflow or gate changes.

## Original database and HTTP evidence

The real self-service router mounts at `/api/v1/staff/my-jobs` and executes
canonical account/session authentication and the actual list query. The guarded
loopback test database executes the repository's migration 131 staff schema and
migration 162 financial terms alongside funded synthetic wallet bookings.
This is scoped SQL coverage, not the full migration chain through 174.

Two original GETs returned HTTP 200 with both the legitimate job and the
unassigned/other-provider job. Each exposed the second customer's name and
address and the wrong provider label. Booking, money, support, audit, outbox,
financial-term, notification and staff snapshots stayed unchanged. The clean
original suite failed one regression and passed its other 25 checks in 12.927s.
`sec079-clean-original-red.json` is retained in ignored repair evidence.

Two preceding fixture iterations are also retained. The first failed before
the route because of missing helper names; the next reproduced extra disclosure
but also lacked catalog rows. Those reports are not the clean runtime baseline.
The helpers were corrected without changing the runtime or weakening assertions
before the clean failing run above.

## Caller and authority consequences

Corrected GETs return only the same-provider job with its full existing DTO.
Consistent approved assignments retain active-before-paid ordering and customer,
service, address and provider context. Invited, pending, rejected, suspended and
deactivated memberships return an empty list. Non-staff roles are denied; typed
non-access tokens, stale session generations and inactive accounts are rejected.
Clearing performer assignment removes the job from the list. Reads do not move
money or alter booking/case/audit/notification state.

The actual mobile service and My Jobs screen were read in full. The caller uses
the unchanged endpoint/DTO; the screen renders provider and customer context,
address, status counts and links to `/staff/job/:id`. Separate detail, photo,
checklist, completion and support readers still require their own acceptance.
Filtering this list does not authorize a direct detail request or erase an
earlier browser cache. Current-parent provider eligibility, concurrent authority
changes, multi-account UI caches and private response policy remain separate.

## Verification checkpoint

The first corrected connected run passes five suites / 34 tests in 16.866s,
including all 26 guarded refund/participant checks, the existing list projection,
booking completion and provider/unmatched-customer cancellation regressions.
No skip or TODO occurs. The new list checks use actual SQL and mounted HTTP,
not a source-string predicate or fabricated query rows. The older UX-317 mock
test is retained as projection coverage, not relied on as authorization proof.

Full local API is not green: 1014 suites / 3507 tests pass, two suites / two
tests fail and two TODOs remain, in 470.145s. Both failures are unchanged Nginx
checks requiring the unavailable Docker Linux engine. All 26 guarded checks
and the unchanged five-case token-issuer SQL suite execute and pass. The failed
full receipt is retained, not replaced with an earlier green candidate.

The final reviewed connected repeat passes five suites / 34 tests in 12.032s,
including all 26 guarded checks, with no skips or TODOs. A preceding invocation
used three nonexistent related-test paths; its three suite-loading failures and
26 passing database checks are retained separately. Correcting those invocation
paths did not alter source, assertions, timeouts or the original red evidence.
API types, changed-file lint and diff checks pass. Two unchanged staff rendered
suites / three tests pass in 54.454s using mocked APIs/native primitives, not a
database-connected browser or live journey. Local Gate A passes ten fragments,
Gate C passes seven articles and all seven smoke scripts pass unchanged.

The owned isolated PostgreSQL was stopped after fresh database/user/loopback/
data-directory identity, zero generated schemas, zero other clients and no
owned runners. Controller, process and listener absence were verified; data
was retained. No production or foreign process was stopped.

Exact-candidate CI remains required. It must execute all 26 checks (25 database
cases and one connection-guard unit), unchanged issuer SQL and both Nginx checks, complete
API/admin/mobile regressions and compiled artifacts, and actual API Docker
build/boot before acceptance or another runtime function change. Prior green
candidate receipts cannot substitute for these checks.

## Remaining work and release boundary

This is a narrow candidate list correction, not closure of R-ACC-02 or complete
K07. Staff detail/evidence/support authorization, account/provider/staff authority
under booking locks, concurrent suspension/reassignment and dedicated targets
remain open. Stage 1 also retains cancellation timing, dispute callers, original
funding identity, logical replay, ambiguous external outcomes, actual process
death, stale claims, release races and wider lock-order review. No finding closes.

The candidate is not deployed. Entry points remain
[customer and provider sign-in](https://app.onservice.ph/auth/login) and
[admin sign-in](https://admin.onservice.ph/login). No fresh live readiness or
verified test credentials are claimed by this code correction. A separate
October 9 read-only delivery check found login pages HTTP 200 with valid TLS,
but the verified marketplace API's internal readiness returned 500 and its
Redis was restarting. The live clean checkout remained `7ed367cd`; this
candidate is not that deployed source. E80 recovery remains unapproved and apex
DNS/TLS remains unresolved; denied GoDaddy access must not be bypassed. Full
selected-image migration rehearsal, backups/rollback, matched artifacts and
authenticated multi-role acceptance remain required before release.

Ken additionally requested usable live browser accounts and an Android APK with
updates while repairs continue. The existing `release-candidate` label was added
to PR81 before the next publication to request matching API/admin rehearsal
packages as well as the existing web audit bundle. This changes retention only,
not a workflow or gate. Label changes alone do not rerun CI; packaging, complete
migration/image rehearsal, configured client builds and authenticated acceptance
still need actual evidence. No artifact is made deployment eligible by labeling.
