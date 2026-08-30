# E39: Admin account lifecycle is not governed in the app

**Date:** 2026-08-31
**Severity:** High privileged-access governance risk
**Status:** Open hard stop for admin-account lifecycle implementation
**Found during:** Admin Staff & Roles W13 audit

## Bad news first

Staff & Roles manages `admin_staff` directory metadata. It does not create,
activate, deactivate, change the login role of, reset credentials for, or
revoke sessions from an admin-tier account. The authoritative access source is
`users.role` plus server route checks.

The only general admin-account creation and role-change mechanism found is
`packages/api/scripts/bootstrap-admin.ts`. That script is safer than the old
seed path because it requires a strong password, an explicit login role, and a
special super-admin confirmation. It is still an out-of-band upsert that can
reactivate an existing account and replace its role and password without an
acting-admin identity, a reasoned `admin_actions` event, refresh-token
revocation, a last-active-super-admin invariant, or a two-person approval.

Customer suspension has a transactional pattern that changes `users.is_active`,
deletes refresh tokens, and records the reason. It is scoped explicitly to
customer accounts and cannot safely be reused for privileged identities by
changing one role predicate.

## Why this is a hard stop

- The current page could easily mislead an operator into deactivating a
  directory profile while the login account and sessions remain active.
- Adding account mutation to the page without a last-super-admin invariant can
  lock the company out of its own control plane.
- Creating or changing a privileged identity affects security, privacy,
  payments, support records, and production operations.
- The out-of-band script has no authenticated actor to attribute and can
  overwrite an existing account role and credentials.
- E32 prevents a verified production account/session inventory and therefore
  blocks a safe migration or cleanup plan.

## Safe containment completed in W13

The Staff page now shows login account role/status separately from directory
profile role/status and uses the real account `last_login_at`. It states that
profile actions do not create or deactivate login accounts and do not revoke
sessions. The old false last-super-admin profile check was removed because it
protected a metadata label while leaving actual access unchanged. No account,
role, password, token, or production row was changed by W13.

## Recommended correction

Create a dedicated privileged-account lifecycle design before adding mutation:

1. Define create, invite, activate, deactivate, reactivate, role-change,
   password-reset, 2FA-reset, session-revoke, and emergency-recovery states.
2. Enforce a locked last-active-super-admin invariant against `users.role` and
   `users.is_active`, not `admin_roles.name` or `admin_staff.is_active`.
3. Require an authenticated acting super admin, a bounded reason, before/after
   evidence, and a transactional `admin_actions` entry for every transition.
4. Add immediate access-token invalidation plus refresh-token and admin-CSRF
   revocation. Coordinate that mechanism with E38.
5. Decide which actions require two-person approval and how emergency access is
   recovered when the ordinary super-admin seat is unavailable.
6. Split account access controls from staff-directory ownership controls in the
   API and UI. Never make a directory profile the access source by accident.
7. Replace or narrow `bootstrap-admin.ts` after the governed path exists. Keep
   an audited break-glass procedure rather than a silent general upsert.
8. Add executed concurrency and authorization tests for the last-super-admin,
   duplicate invite, stale token, failed audit, and rollback cases.

## What is not authorized by this record

- Do not expose the bootstrap script as an ordinary HTTP endpoint.
- Do not reuse customer suspension for admin accounts without the privileged
  invariants and session model above.
- Do not claim an inactive directory profile means an inactive login account.
- Do not change production privileged accounts while E32 blocks verified
  server identity and backup evidence.
