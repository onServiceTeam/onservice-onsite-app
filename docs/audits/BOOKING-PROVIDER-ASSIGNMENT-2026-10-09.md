# Provider booking assignment audit, October 9, 2026

## Finding and scope

SEC-076 reproduces historical R-ACC-02 against candidate
`0e96abee1dc274253d33e3955b4174aaca179db3`. An authenticated provider could
change a paid booking when its provider assignment was absent. The shared
status service checked ownership only when `provider_id` was populated.
This is a synthetic PostgreSQL/HTTP finding, not a claim of live exploitation.

The narrow correction refuses provider status changes without an assignment
and preserves the existing owner check for assigned bookings. It runs before
status writes, cancellation accounting and notifications. Provider assignment
continues through the separate offer, quote and operator workflows. No refund
policy, account role, historical record, migration or funding model changes.

## Actual failing baseline

The new regression mounts the real booking router, canonical authentication,
validation and error middleware. It uses actual PostgreSQL transactions,
wallet and payment rows, inbox notifications and immutable financial terms
from the repository's existing migration 162, not the attachment's replacement
migration proposal. Only synthetic identities and funds are used.

Before correction, one unassigned provider's cancellation and en-route
requests both returned HTTP 200 instead of 403. The cancellation changed a
paid booking to cancelled, credited its customer wallet by 100000 centavos,
inserted the two refund ledger entries and marked its payment refunded. The
other paid booking changed to provider-en-route. Both customer inbox notices
were inserted despite neither booking being assigned to that provider.

The retained original report is `booking-actor-original-red.json` in ignored
private repair evidence. One regression failed in 23.426 seconds; the other
19 tests were excluded by its explicit name filter, not disabled in the suite.
The report is preserved unchanged.

## Caller and role consequences

The guarded refund suite expands from 16 to 20 checks. The four new actual
database/HTTP cases establish these boundaries:

- Unassigned-provider cancellation and en-route requests return 403. Booking,
  wallet, ledger, payment, support, audit, outbox, financial-term, provider and
  inbox snapshots remain unchanged.
- Another provider cannot act on an assigned booking. The actual assigned
  owner can start navigation, with held funds unchanged and a persisted
  customer en-route notice.
- Refresh, pending-factor and setup-factor credentials fail before business
  writes. Deactivation also denies an otherwise signed provider credential.
- The owning customer can still cancel an unassigned wallet-paid booking
  scheduled five minutes away and receive the existing full refund, including
  its fee. The unrelated booking's ledger remains unchanged.

Stored customer preferences disable device push in the fixture. Inbox delivery
is real SQL; Expo/device push, realtime delivery and external payment calls are
not certified. The final fixture uses a consistent 25% fee on service price,
with the same total/escrow amounts as the original baseline. This test-data
refinement does not change runtime policy or remove assertions.

The provider job-detail, active-job and customer booking-detail callers were
read in full. They use the same status route and display server rejections.
Three unchanged mobile rendered suites pass five tests in 33.204 seconds,
covering customer cancellation wording, provider controls and active-job
mounting. Their APIs/native primitives are mocked. They are not a connected
browser, device or live multi-role journey.

## Verification checkpoint

The first corrected run executes all 20 guarded checks with no skips and
passes in 8.647 seconds. API TypeScript, changed-file lint and whitespace pass.
The final full local API run passes 1014 suites / 3501 tests, with two TODOs
and only the two unchanged Docker-unavailable Nginx failures, in 464.325
seconds. All 20 guarded checks execute and pass. This is not a green full
local run. The reviewed connected repeat passes four suites / 27 tests in
11.437 seconds, including all 20 guarded checks without skips and the existing
completion, provider-cancellation accounting and unmatched-refund regressions.
Unchanged local Gate A's ten fragments, Gate C's seven articles and all seven
smoke scripts pass. The ignored process-local Python shim selects the installed
interpreter; no repository gate source or enforcement mode changes.

Fresh exact-candidate CI must execute all 20 checks, both Nginx checks,
full API/admin/mobile regressions,
compiled artifacts and API Docker build/boot before the correction is accepted.

The local Nginx tests require a Docker Linux engine unavailable in this session.
An older green CI run is not verification of this new correction. No gate,
workflow, enforcement mode or assertion has been weakened.

Completed independent source verification: exact topic `82e5558c` passed
CI `37851008447` and Gates `37851008382`. Actual API logs pass all 20 guarded
checks and both Nginx checks: 1016 suites / 3503 tests, two TODOs, no skips or
failures. Admin passes 706 tests with one skipped file / three TODOs and its
production build/types; mobile passes 879 tests / 84 TODOs, types and the
compiled web export; actual API Docker build and `/health` boot liveness pass.
CI merge `4d5fdf0990c30b70e6b6c186fe7c56c9555445e7` and topic share tree
`571747e740f7966bab36aba71c4ee7aa7bc6292d`. This supersedes the pending-CI
checkpoint above, not deployment. Optional exact API/admin packaging was
skipped; web artifact `11581748673` is not deployment eligible and was not
exercised as a browser journey. Gate B conditional dispatch and D/E report
workload limits remain unchanged.

The isolated fixture runs PostgreSQL 17.9 and Node 24.13.0. Its scoped schema
plus migration 162 are not the complete production migration-chain/image
rehearsal through 174. After all local SQL checks finished, fresh database,
user, loopback listener, data-directory and process identity checks passed;
zero owned refund schemas and other client backends remained. Only that owned
test server was stopped. Listener/process absence was verified and its data
and reports retained. No foreign service or production server was touched.

## Remaining work and release boundary

This is not complete K07 actor/transition acceptance. Provider-staff parent
ownership, non-operations/unknown roles, dedicated-flow-only targets and the
wider account/provider/booking lock graph still need review. Assigned-provider
cancellation compensation, customer timing tiers, original funding identity,
dispute callers, partial-refund replay, ambiguous external outcomes, actual
process death, stale claims and refund/release races remain separate work.
Do not claim complete K01/K08/K07, deadlock-free behavior or full refund safety.

The subsequent DPO-role fall-through reproduction and narrow candidate
correction are recorded separately in
`docs/audits/BOOKING-STATUS-ROLE-2026-10-09.md`. That newer source needs its own
verification; the SEC-076 result does not verify a later change.

The correction is not deployed. Current live customer/provider entry is
[the shared sign-in page](https://app.onservice.ph/auth/login); admin entry is
[the operator sign-in page](https://admin.onservice.ph/login). No live readiness
or authenticated test-account acceptance was checked here. Production recovery,
apex DNS/TLS, full migration/image rehearsal, matched release artifacts,
backups/rollback and all remaining launch requirements remain unresolved.
