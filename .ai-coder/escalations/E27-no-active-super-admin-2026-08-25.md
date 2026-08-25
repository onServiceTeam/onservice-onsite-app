# E27 — Production has no active super-admin account

**Date:** 2026-08-25  
**Status:** OPEN — Ken identity decision required  
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

## Work that can remain staged safely

The code branch can retain the dashboard/analytics truth fixes, reasoned staff and role-profile audit trail, and DPO management workspace. It must not claim the new super-admin-only controls are operationally usable in production until this escalation is resolved.

