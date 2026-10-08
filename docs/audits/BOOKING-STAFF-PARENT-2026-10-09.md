# Booking staff parent-provider audit October 9 2026

## Finding and correction

SEC-078 reproduces a staff booking-status permission gap against candidate
`c04726e0d15b060a3f6cf7d5b345ee089da15023`. An approved staff member could start
a booking whose provider was absent or belonged to another provider account,
if that booking retained their `performer_staff_id`. The guard checked the
performer, user and approval but not the parent-provider relationship.

The synthetic fixture deliberately creates inconsistent historical-style
relationships that the individual D23 foreign keys permit. The normal staff
assignment service already rejects these relationships; this is not evidence
that its ordinary assignment flow created them or that production contains
affected records. No live account or booking was inspected or changed.

Only the staff branch of `validateRoleForTransition` changes: it requires a
booking provider and includes that exact provider in the approved staff lookup.
Performer attribution alone is not operating authority. Existing customer,
provider, admin/super-admin and unsupported-role checks, staff allowed targets,
error text, cancellation policy and completion quality gates remain unchanged.
No money model, migration, dependency, issuer, workflow or gate changes occur.

## Original failing SQL and HTTP evidence

The actual mounted booking router executes canonical authentication, status
validation, PostgreSQL writes, stored financial terms and customer inbox
notifications. The fixture forbids external delivery, disables push through
stored preferences and uses the standard isolated Redis/logger harness.

Both original requests returned HTTP 200 instead of 403 and changed paid
bookings to provider-en-route. Two false customer notices persisted. Wallet,
ledger and payment state stayed unchanged. The original suite failed the new
regression and passed its other 23 checks in 32.992 seconds. The unmodified
`sec078-original-red.json` remains in ignored private repair evidence.

After correction, both requests return 403 with the existing unassigned-job
error. Booking, wallet, ledger, payment, support, audit, outbox, provider,
financial-term, notification and staff snapshots remain unchanged. This is
actual database/HTTP evidence, not an assertion about source text or mock calls.

## Caller and role consequences

The existing consistent assigned-staff test still verifies en-route success
with a stored customer notice and no money movement. Suspension, cancellation
and unrelated-job denial still pass. Existing assigned-owner, customer refund,
DPO denial and explicit admin/super-admin checks also remain in the connected
suite. Preserving the broad admin exemption does not certify every admin target.

The staff job screen and service caller were read in full. The screen submits
its next-step action to the shared booking-status endpoint and reports a
server rejection as a toast. Three unchanged rendered staff suites pass four
tests in 52.513 seconds. APIs and native primitives are mocked; these are not
database-connected browser, native-device or live authenticated journeys.

The scoped D23 staff/performer relationships and the repository's actual
migration 162 financial terms execute in the synthetic fixture. They do not
prove the complete production migration chain through 174 or a selected image
on restored production data.

## Verification checkpoint

The first corrected connected run passes four suites / 31 tests in 14.355
seconds, including all 24 guarded refund/booking checks (23 database cases and
one connection-guard unit case), booking completion and the existing provider
and unmatched-customer cancellation regressions. No skips or TODOs occur.
API TypeScript and changed-file lint pass. Local Gate A passes ten fragments,
Gate C passes seven articles and all seven smoke scripts pass, with no gate,
enforcement mode, assertion or timeout changes. The new regression ID also
has one test-title occurrence on the reviewed source.

The full local API run is not green: 1014 suites / 3505 tests pass, two suites /
two tests fail and two TODOs remain, in 594.512 seconds. Both failures are the
unchanged Nginx checks requiring the unavailable Docker Linux engine. All 24
guarded refund/booking checks and the unchanged token-issuer SQL suite execute
and pass. This receipt does not inherit an earlier full-run result or conceal
the two environmental failures. The original red and complete final reports
remain retained privately. The final reviewed connected repeat passes four
suites / 31 tests in 17.596 seconds, with all 24 guarded checks executing and
no skips or TODOs. The runtime diff remains limited to the same staff branch.

The owned isolated PostgreSQL was stopped after fresh database/user/loopback/
data-directory identity, zero generated schemas, zero other clients and no
owned test-runner checks. Controller, process and listener absence were verified;
the test data was retained. Recorded process IDs are historical, not permission
to stop a process on resumption. No production or foreign service was touched.

Fresh exact-candidate CI must execute all 24 guarded checks and both Nginx
checks, complete API/admin/mobile regressions and builds, compiled web export
and actual API Docker build/boot before another function changes. Earlier
candidate success is not verification of this correction.

## Remaining work and release boundary

This fixes the reproduced staff status-parent mismatch in candidate code, not
complete R-ACC-02 or K07 acceptance. Staff jobs/readers, photo/checklist/proof
and support callers have separate authorization boundaries requiring review.
Current staff/provider/account authority under booking locks, concurrent
assignment/suspension, dedicated-flow-only targets and the wider lock graph
remain open. No historical relationship is rewritten or backfilled.

Customer/provider timing, disputes, original funding identity, logical replay,
ambiguous external outcomes, actual process death, stale claims, refund/release
races and full K01/K08 acceptance remain separate work. The 124 historical
findings are not closed by this correction. No deadlock-free or full refund
safety claim is made.

The candidate is not deployed. Entry points remain
[customer and provider sign-in](https://app.onservice.ph/auth/login) and
[admin sign-in](https://admin.onservice.ph/login). No fresh live readiness or
verified test credentials are claimed. E80 recovery remains unapproved;
apex DNS/TLS and denied GoDaddy access remain unresolved. Complete selected-image
migration rehearsal, backups/rollback, matched API/admin/customer-provider
artifacts and authenticated acceptance are required before release. Engineering
approval is not legal sign-off, live payment proof or launch readiness.
