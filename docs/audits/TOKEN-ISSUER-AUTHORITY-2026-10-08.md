# Credential issuance and current account authority

Date: 2026-10-08. Base: `58477af3eb09a7d54096ae248c521483c5895d2d`.
Application: onService PH marketplace, existing PR 81. Candidate only, not deployed.

## Finding and correction

OPS-526: the shared `createTokenPair` helper trusted the caller's role and
session generation without checking the account at issuance. The unchanged base
returned credentials for an inactive synthetic account. A stale role or revoked
generation could likewise be persisted. This is not proof of unauthorized
protected access: canonical request authorization separately checks these values.

The helper now locks the account before session storage and requires it to be
active with exactly the caller's supplied role and valid session generation.
Missing or changed authority receives HTTP 401. It does not substitute newer
authority for an old authentication proof. The account read and refresh insert
use one transaction; credentials return only after commit. The lock order is
account then refresh session, consistent with the reviewed refresh/revocation
paths. Token lifetimes, factors, schema, dependencies and recovery holds are
unchanged.

## Executed evidence

The initial failing check started with a missing account and observed the old
foreign-key error instead of the intended refusal (5.799 seconds). That result
alone did not prove credential issuance. The same test was reordered to check
the inactive account first, still against unchanged runtime code: it observed
`issued` instead of `denied`, failing in 0.623 seconds. Failure assertions project
only outcome/status, not credentials.

- `bug-ops-526-token-issuer-current-authority.test.ts` executes 24 combinations
  across customer, provider, provider-staff, admin, super-admin and DPO: inactive,
  changed role, revoked generation and missing account. Rejection preserves
  complete account and existing session rows.
- `token-issuer-transaction-postgres.test.ts` checks signed and persisted success
  for all six roles; waiting issuance after committed/rolled-back generation
  changes; issuer-first revocation; unrelated-account progress; actual insert
  failure and retry; and invalid supplied generations. PostgreSQL blocking is
  observed directly. Scheduling hooks pause real SQL, not substitute its results.
  The reverse-order revocation writer is fixture SQL, not an exercised admin UI.
- Existing token-expiry and admin-session-timeout mocks now supply the canonical
  account read and transaction client. Their expiry/cookie assertions remain.
  Existing password-change and rehash database tests still pass.

The focused selection passed **6 suites / 25 tests in 36.839 seconds**. The full
local API run passed **1,004 suites / 3,460 tests**, with two existing TODOs and
two failed suites/tests in **386.123 seconds**. Only unchanged UX-860 and UX-201
failed because the Docker Linux engine is unavailable. All new PostgreSQL tests
executed; none were skipped. This is not a green full local suite, and the Nginx
checks remain enabled for fresh CI. API TypeScript, lint of all five changed/new
TypeScript files and the unchanged 1,607-ID gate passed.

Database evidence uses isolated, test-owned PostgreSQL 17 schemas on loopback.
It is not a complete production-schema restoration or browser/native acceptance.
Fresh exact-candidate CI remains required.

## Preceding candidate verification

The exact base passed all four jobs in
[CI 37792827931](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37792827931)
and [Gates 37792828059](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37792828059).
API job `113364452922` explicitly passed OPS-524/525, their supporting transaction
tests and both Nginx checks: **1,004 suites / 3,456 tests**, two TODOs, in
70.198 seconds. Admin, mobile including web export, and Docker build/liveness
also succeeded. Optional exact release packaging was skipped. These results
verify the preceding phone-sign-in candidate, not this newer issuer change or
production readiness.

## Remaining account workflow work

This helper does not verify authentication factors itself. Each caller must
bind its supplied authority to the proof actually checked. In particular,
setup completion currently re-reads role/generation after earlier authorization;
that caller needs its own interleaving regression and transaction review. A
matching current value supplied by that caller is not proof that its earlier
authorization remains valid.

Earlier committed caller effects, including login metadata, password changes,
staff invitation acceptance or factor activation, are outside this transaction.
Credential-storage failure does not roll those effects back. Factor changes,
backup-code consumption, invitation recovery, first-registration races, the
full account-writer lock graph and E79 cookie/cross-tab behavior remain open.

No production connection, live account mutation, earlier-session invalidation,
migration, master merge or deployment occurred. The separate production recovery
hold is unchanged. Full migration/image rehearsal, matched frontend artifacts,
authenticated acceptance, backups/rollback, provider correction/resubmission,
Stitch/UX coverage and launch requirements remain separate work.
