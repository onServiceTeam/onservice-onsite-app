# E57 - Business membership has no safe invitation or permission lifecycle

**Date:** 2026-09-02
**Status:** OPEN - identity, consent, audit, and production-history decision required
**Hard stop:** exposing customer team-management writes or treating the current UUID endpoint as a complete invitation feature
**Related:** E32 production access, E55 controlled business billing, E56 provider funding and settlement, D23 provider-staff invitations

## Bad news

The customer company workspace can display current members and their permissions,
but it has no customer-facing way to invite, accept, decline, change, remove, leave,
or transfer ownership. The mobile client and store still contain an `addMember`
method, but it requires a target user's internal UUID. A normal customer cannot
discover that UUID.

The public `POST /business/:id/members` service also activates membership
immediately. It has no invitation record, verified phone/email match, recipient
acceptance, expiry, cancellation, or pending state. Exposing that method in a
screen would let an owner or manager grant company-record access to an existing
customer account without that person's consent.

The 2026-09-02 containment work prevents providers and internal operators from
using customer business routes, prevents the add-member path from creating a
second owner, and limits targets to active customer identities. Those are
necessary controls, but they do not turn immediate UUID assignment into a safe
invitation lifecycle.

## Current gaps

1. There is no business invitation table, token, expiry, delivery state, or
   recipient decision.
2. There is no safe phone/email lookup contract. Customer-facing arbitrary user
   search would disclose account existence and is not acceptable.
3. There is no permission-change endpoint after membership is created, even
   though the screen tells a restricted member to ask an owner or manager.
4. There is no self-leave flow for non-owners.
5. Ownership transfer exists only as a direct API call and requires the target
   to already be a member.
6. Member addition has `invited_by` and a row timestamp but no append-only
   accepted/declined/permission-change history. Removal and ownership transfer
   write customer-initiated events into `admin_actions`, whose name and actor
   semantics are misleading for customer governance.
7. The database does not enforce one active `owner` membership row per account.
   Application containment now blocks new duplicates through the normal service,
   but existing production history cannot be assumed clean while E32 is open.
8. Admin Business 360 can read the current roster but cannot explain pending
   invitations, acceptance evidence, permission history, or why access changed.

## Options

### Option A - Consent-based invitation and membership event model (recommended)

Add a dedicated invitation lifecycle and make current membership a governed
projection:

1. An owner invites a manager or member by normalized email and/or Philippine
   phone, with the intended permissions. A manager may invite ordinary members
   only and may not grant authority the manager does not hold.
2. Store only the necessary normalized destination plus a hashed, single-use,
   expiring token. Link an existing user internally when possible without
   revealing whether an arbitrary account exists.
3. The recipient signs in or registers, proves control of the matching verified
   identity, reviews the company, role, permissions, and inviter, then explicitly
   accepts or declines.
4. Acceptance locks the invitation, account, and target identity and creates or
   reactivates the membership exactly once. Retries return the same result.
5. Create a dedicated append-only `business_membership_events` record for invite,
   delivery, acceptance, decline, expiry, cancellation, role/permission change,
   removal, leave, and ownership transfer. Record actor, subject, before/after,
   reason where required, request identity, and database time.
6. Owners can manage managers and members. Managers can manage ordinary members
   within their own delegated authority. Non-owners can leave. Ownership changes
   only through the existing locked transfer operation, expanded to emit the
   canonical membership event.
7. Add a database-backed single-active-owner invariant only after the private E32
   inventory identifies and remediates any historical duplicate-owner rows.
8. Add a responsive **Manage company team** workspace with pending invitations,
   resend/cancel, permission review, member removal, self-leave, and explicit
   ownership transfer. No screen accepts or displays an internal user UUID.
9. Add Admin read-only support evidence linking the invitation, recipient state,
   membership events, customer records, related company bookings, statements,
   and support cases. Any future emergency Admin override must be a separately
   approved super-admin action with preview, reason, audit, and customer notice.
10. Retire the direct UUID-add route after compatible clients move to the
    invitation endpoints. Do not silently reinterpret old membership rows as
    accepted invitations.

This is the recommended long-term model because it scales to larger companies,
preserves recipient consent, avoids customer-directory leakage, and gives Support
an evidence trail without making mutable membership rows pretend to be history.

### Option B - Immediate add by email or phone

Resolve a typed destination to an existing customer and add the account
immediately. This is smaller, but it still lacks recipient consent, leaks account
existence through response differences, and creates a poor foundation for
pending users, resend, decline, expiry, or larger-company governance. Not
recommended.

### Option C - Keep the company workspace read-only

Leave all team changes to unsupported API or manual database work. This avoids a
new write path but does not produce a usable enterprise product and gives Support
no safe operating workflow. Not recommended as the target state.

## Production and migration requirements

Before enforcing owner uniqueness or retiring the current route, privately
inventory:

1. every current and soft-deleted business membership, role, permission set,
   inviter, and removal reason;
2. accounts with zero, one, or multiple active owner-role rows compared with
   `business_accounts.owner_user_id`;
3. active memberships whose user is inactive or not a customer identity;
4. evidence of any real client or operator use of the direct add/remove/transfer
   endpoints; and
5. support cases or financial records whose access depends on a membership that
   would be changed.

Do not put private row data in this repository. Preserve historical records and
use explicit remediation events rather than rewriting old membership history.

## Acceptance criteria after approval

1. No person gains company access until a matching verified identity accepts a
   live invitation.
2. A retry cannot create duplicate invitations, memberships, owners, or events.
3. Owners, managers, members, Support, and Admin each see only the actions and
   evidence their role needs.
4. Permission and role changes are bounded, cannot escalate through a manager,
   and are recorded before the API reports success.
5. Exactly one active owner agrees with the account's canonical owner ID.
6. Removing, leaving, or transferring access does not rewrite prior bookings,
   contract snapshots, statements, payments, or support history.
7. Phone, tablet, and desktop flows cover invite, pending, accepted, declined,
   expired, delivery-failed, removed, and transferred states.
8. Admin Business 360 can explain who changed access, when, why, and what company
   records remain affected without exposing secret tokens or unnecessary contact
   data.

## Work paused

Do not add a customer UI around the current UUID endpoint, add arbitrary customer
search, claim that team invitations exist, or enforce a production owner-uniqueness
migration without the private inventory. Safe work may continue on read-only team
display, route containment, strict input validation, tests, documentation, and
unrelated customer/provider/admin audits.
