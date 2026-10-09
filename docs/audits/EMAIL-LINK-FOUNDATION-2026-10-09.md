# Verified email linking foundation, October 9

## Scope and current status

Ken requested phone/email and existing-account sign-in methods. This bounded
stage follows exact-source-verified SMS transport candidate `f2d090e1`. It is
an internal account-linking implementation, **not email login, a public endpoint,
configured delivery, a deployed migration or a completed customer journey**.
It introduces no dependency and does not change phone or administrator login.
No real email, SMS, account or production resource was used.

Migration 175 is additive. History through 174 is untouched. There is no legacy
backfill, account merge, placeholder phone, role promotion or provider approval.
`users.email` remains contact information, including its existing staff-invite
meaning. Verified sign-in ownership lives in its explicitly named new table.
One current email per account and one owner per case-folded email are enforced.
Original proved spelling is retained for future delivery. Local-part dots/plus
and relay aliases are not removed or used to merge accounts. The initial
service accepts ASCII email addresses only, not internationalized local parts.

## Internal contract

- Start accepts an authenticated marketplace actor and rechecks active account,
  exact role/session generation and canonical phone under an account-first lock.
  Admin, super-admin and DPO are excluded. Refreshed JWT issue time is not proof.
- Each operation binds its own ID, owner, role, generation, phone, preserved
  email, `link_email` purpose and factor name into salted scrypt proofs at the
  existing cost. Both fresh six-digit codes are required together. Legacy OTPs
  are never read or reinterpreted. Sequential derivation bounds peak memory.
- A sixty-second per-account cooldown and five-per-hour account, recipient and
  canonical-IP limits serialize under account and consistently ordered advisory
  locks. These internal limits have no development relaxation. They do not
  substitute for public CAPTCHA/HTTP abuse handling or capacity acceptance.
- Attempts commit on rejection, rather than rolling back with a thrown error.
  Three incorrect submissions invalidate the operation. A replacement invalidates
  the old operation. Terminal state clears both stored hashes.
- Expiry is server-derived, with the existing five-minute default. Verification
  checks the actual database clock after account waits, hashing and uniqueness/
  audit work. A late expiry rolls ownership/audit back to a savepoint and records
  invalidation. Neither transaction-start `NOW()` nor client time is authority.
- Identity ownership, proof completion and a minimal audit commit together.
  The audit contains method and operation ID, not email/phone/codes/hashes.
  An insert failure rolls the operation back for retry. Concurrent ownership
  does not merge accounts. Completed-response replay reports the same retained
  identity only; it is not a reusable verification grant or session issuer.
- The start result contains plaintext codes strictly for a future server-side
  delivery coordinator. It MUST NOT be serialized to HTTP, logs or job payloads.
  No such caller is mounted in this stage. Repeating start is not delivery retry.

## Privacy and lifecycle

Owner exports explicitly select verified email/date and retained request
phone/email/state/IP/timestamps. They exclude codes, hashes and proof identifiers.
Unrelated accounts are excluded. Soft anonymization explicitly deletes both new
tables in its existing account-first transaction with session revocation; FK
`ON DELETE CASCADE` alone would not handle an UPDATE-based anonymization.
Any failure rolls those deletions back. Existing broader eligibility, DSR,
retention and export-snapshot limitations remain open.

Expiry is not data deletion. Bounded expiry/retention scheduling and its accepted
engineering retention policy must be integrated before public enablement. There
is deliberately no live producer of these records in this stage. No new permanent
server service, listener or queue was added. This is not legal-compliance sign-off.

## Verification evidence

The feature had no preceding runtime implementation. A missing-module test would
not constitute a reproduced legacy bug, and no such red claim is made.

`email-link-postgres.test.ts` contains one pre-database rejection check and fifteen
actual PostgreSQL cases. The fixture rejects unsafe CI URLs at module load and
checks actual loopback TCP peer, requested port and exact `*_test` database before
creating an owned schema. It applies the real migration 175, not a schema mock.
Other lifecycle tables are a focused synthetic fixture, not a complete production
migration/image rehearsal. It cleans only its generated schema and clients.

Cases cover three marketplace roles; both-code requirements and attempt lockout;
swapped/context-mutated proofs; unrelated account and legacy-contact preservation;
concurrent replay and competing ownership; actual audit-trigger rollback/retry;
expiry/phone change/revocation; concurrent cooldown; real account/unique-key waits;
hard hourly limits; explicitly selected owner export; and actual soft-anonymization
rollback/erasure. Export uses actual SQL for the two new sections and empty fixture
boundaries for unrelated sections, not full end-to-end archive acceptance.

Local first run: one check passed, twelve database checks skipped, 0.958 seconds.
After expanding contention/rate coverage: three selected suites passed five
checks, fifteen database checks skipped, 0.880 seconds. These are **not actual
database acceptance**. The owned local PostgreSQL remains stopped after the
preceding Windows bind-permission failure; no alternative-port or elevated
workaround was used. Final review also included retained request metadata in the
owner export. The final connected rerun passed three suites/five checks with
fifteen SQL checks skipped in 1.038 seconds. API types and changed-file lint passed.

The full local API run is **not green**: 955 suites/3,414 checks passed, 66 suites/
143 checks skipped, two TODOs, and two failures in 192.301 seconds. Both failures
are the unchanged Docker-unavailable Nginx checks. The full run preceded the final
request-export addition; the connected rerun covers the final files only to the
limited non-database extent stated above. Actual database execution, final full
candidate acceptance and both Nginx checks remain CI requirements.

Local Gate A passed all ten fragments, Gate C all seven articles and all seven
gate smoke scripts passed, with no gate/mode changes. Publishing this candidate
to the existing risk-review PR is for real isolated-database CI verification,
not feature acceptance, release approval or permission to apply migration 175
to production. Exact-candidate results must be appended when actually observed.

No next sign-in function should be connected until the new database checks
actually execute and the whole candidate passes its CI. No tests, modes,
assertions, workflows or gates are weakened for this implementation.

## Remaining delivery and release work

Next: exact-source acceptance, retention integration, governed delivery outcomes
and lost-response handling, fresh-proof HTTP integration, email session issuance
with canonical authority, configured sender/inbox verification and role-aware UI.
Google/Apple stable-subject adapters and Facebook evaluation follow. Preserve
provider admission, staff assignment, administrator password/TOTP and required
phone onboarding. Existing contact-email invitation semantics need explicit
caller reconciliation, not silent substitution of the new table.

Public enablement needs neutral discovery responses, CAPTCHA/abuse acceptance,
configured same-origin browser/native redirects, safe session handling, actual
provider consent/outage/replay tests, and matched builds. A new selected-image
restoration through 175, data preservation, backup/rollback and authenticated
multi-role acceptance are required before deployment. The verified predecessor
and old full-chain rehearsal through 174 cannot certify this migration.
