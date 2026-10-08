# Booking status role audit October 9 2026

## Finding and correction

SEC-077 reproduces a booking-operation permission gap against candidate
`82e5558c0dc319f0b3b1f1b2def31f25440d4fdf`. A canonically authenticated privacy
officer could cancel a paid booking as a provider or mark another booking
en route. The status guard checked customer, provider and provider-staff
roles but returned successfully when none matched. Authentication was
mistakenly sufficient for an unsupported actor. Only synthetic accounts and
funds were used; this is not evidence of production exploitation.

The correction makes each permitted role return only after its own checks
and rejects every remaining role. DPO privacy authority does not grant booking
operation authority. The existing explicit admin/super-admin exemption,
customer ownership, provider assignment and staff approval checks remain.
No refund policy, role issuance, migration, historical row, funding model,
dependency or gate changes are included.

## Original failing database and HTTP evidence

The real mounted booking router executes canonical account/session validation,
status validation, actual PostgreSQL transactions, immutable financial terms,
wallet/payment accounting and stored inbox notifications. External delivery
is forbidden by the fixture. Device push is disabled through stored preferences;
the standard unit harness isolates Redis and the logger is mocked.

Both original DPO requests returned HTTP 200 instead of 403. The cancellation
changed the paid booking, credited its customer wallet by 100000 centavos,
inserted both refund ledger entries and marked the payment refunded. The other
booking moved to provider-en-route. Both false customer notices were stored.
The original suite failed one regression and passed the other 20 checks in
68.628 seconds. Its unchanged report, `sec077-original-red.json`, remains in
ignored private repair evidence.

## Caller and role consequences

The corrected guarded suite executes 23 checks, including three new actual
database/HTTP cases:

- DPO cancellation and en-route requests return 403. Booking, wallet, ledger,
  payment, support, audit, outbox, provider, financial-term and notification
  snapshots remain unchanged.
- An approved assigned staff member retains the existing en-route action and
  customer inbox notice without changing money. Unassigned-job actions,
  provider cancellation and suspended-staff requests remain denied.
- Current admin and super-admin identities retain their explicit status-action
  exemption and existing customer notice, with no wallet movement.

Existing connected checks continue to exercise assigned-provider ownership,
purpose/revocation denial and the owning customer's full late-unassigned wallet
refund, including its fee. The staff relationship fixture models D23 foreign
keys and approval values; it is not a complete migration 131/174 rehearsal.
The repository's actual migration 162 financial terms still execute.

The staff job screen was read in full. Its existing next-step mutation calls
the shared booking status endpoint and reports server failures as a toast.
Three unchanged rendered staff suites pass four tests in 31.746 seconds.
Their APIs and native primitives are mocked; these are not connected-browser,
native-device or live authenticated acceptance.

## Verification checkpoint

The first corrected connected run passes all 23 guarded checks without skips
in 28.521 seconds. API TypeScript, changed-file lint and whitespace checks pass.
The final reviewed connected run passes four suites / 30 tests in 36.326
seconds, including all 23 guarded checks (22 database cases and one connection
guard unit case), booking completion and the existing provider/unmatched
cancellation regressions. No tests are skipped or TODO in that run. Local
Gate A passes ten fragments, Gate C passes seven articles and all seven gate
smoke scripts pass. No assertion, gate or enforcement mode changed.

The full local API run is not green: 1013 suites / 3502 tests pass, three suites /
four tests fail, and two TODOs remain, in 572.024 seconds. Two failures are the
unchanged Nginx checks requiring the unavailable Docker Linux engine. The
unchanged token-issuer SQL suite also exceeds its existing 5000ms test limit
and then reports a missing signing secret. Its fixture restores that secret
after each asynchronous case, so overlapping cleanup after timeout is a
possible explanation for the second failure, not a proven runtime diagnosis.
All 23 refund/participant checks pass in the full run.

The unchanged token-issuer suite rerun alone passes five tests in 17.642
seconds, including the original lock-wait test in 4768ms, with no timeout,
assertion, fixture or auth runtime edits. Both failed full-run and passing
rerun reports are retained privately. The focused rerun does not turn the
failed full run into a green receipt. Fresh exact-candidate CI must execute
all 23 checks, both Nginx checks, complete API/admin/mobile regressions and
builds, the compiled customer/provider web artifact and actual API Docker
build/boot before this function is accepted or another function changed.

The owned isolated fixture uses PostgreSQL 17.9 and Node 24.13.0. Scoped SQL
coverage does not replace complete selected-image migration rehearsal through
174 or a restored-production comparison. No live or foreign service was touched.
After all owned tests finished, fresh database/user/loopback/data-directory
identity and zero generated schemas/other-client checks passed. Only the
owned isolated PostgreSQL was stopped; controller, process and listener
absence were verified and the test data directory retained.

## Remaining work and release boundary

This closes the reproduced DPO fall-through in candidate source, not complete
K07 acceptance. Staff parent-provider consistency, current authority under the
booking transaction, dedicated-flow-only status targets and the broader
account/provider/booking lock graph remain open. The preserved broad admin
exemption is not certification of every admin transition. Unsupported future
roles are denied by the fallback, but this slice does not mint or validate a
future role's authentication flow.

Customer/provider timing tiers, disputes, original funding identity, logical
replay, ambiguous external outcomes, actual process death, stale claims,
refund/release races and full K01/K08 acceptance remain separate work. The 124
historical findings are not closed by this correction.

The candidate is not deployed. Live entry points remain
[customer and provider sign-in](https://app.onservice.ph/auth/login) and
[admin sign-in](https://admin.onservice.ph/login). No fresh live readiness or
authenticated acceptance is claimed. E80 production recovery remains held;
apex DNS/TLS, backups/rollback, matched release artifacts and all remaining
launch requirements are unresolved.
