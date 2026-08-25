# E27 — Production has no active super-admin account

**Date:** 2026-08-25  
**Status:** RESOLVED — 2026-08-25
**Area:** production access governance

## Bad news

The production database currently has no active `super_admin` account. A read-only aggregate check returned:

- one active `admin` account;
- one inactive `super_admin` account;
- zero active `admin_staff` directory profiles.

No identity, email, phone number, credential, session, or other personal field was read. No production row was changed.

## Why this blocks autonomous correction

Super-admin-only controls include money decisions, settings, staff/profile governance, and DPO assignment. The inactive privileged account was deliberately disabled during the production security cleanup because its credential had been published. Reactivating it would reverse that safety action. Promoting the unidentified active admin could give the wrong person money and governance authority.

This is therefore not a safe code default. It requires Ken to identify the intended human account and confirm that the account has a private credential and TOTP enrollment.

## Safe options

1. **Recommended:** Ken identifies the existing active admin that should become the operational super-admin. After identity confirmation, back up production, promote that one account, revoke its existing sessions, require a fresh sign-in/TOTP check, write a reasoned audit event, and verify access.
2. Create a new named internal super-admin account with a private one-time credential, force TOTP enrollment, and retain the current active admin at its existing role.

Do not reactivate the inactive published-credential account.

## Resolution

Ken explicitly authorized creation of durable accounts for the application user
types. A new, clearly named UX-audit super-admin was created without modifying
the inactive compromised account or the existing active admin. Before the write,
the onService database/uploads/config/git backup completed successfully.

The new account has a generated strong password, mandatory TOTP enabled, two
successful end-to-end password-plus-TOTP verifications, and one reasoned
`user_role_changed` audit event with source `authorized_ux_audit_bootstrap`.
Its password and TOTP secret are encrypted with Windows DPAPI in Ken's private
security directory; neither value is in the repository, Git history, command
output, this escalation, or chat.

Post-change aggregate state:

- one active `super_admin` with password and TOTP;
- one active `admin` with password and TOTP;
- the formerly published `super_admin` remains inactive.

## Work that can remain staged safely

The code branch can retain the dashboard/analytics truth fixes, reasoned staff and role-profile audit trail, and DPO management workspace. It must not claim the new super-admin-only controls are operationally usable in production until this escalation is resolved.
