# Runbook — Data Protection Officer (DPO) role

**Owner:** super_admin
**Compliance ref:** NPC RA 10173 §21 (Data Privacy Act of 2012)
**Established:** 2026-05-02 (Escalation E01 / Decision D15)

---

## What the DPO is for

The DPO is the designated Data Protection Officer required by RA 10173. Their job is to act independently of operational management on:

- Consent records (review, audit, dispute resolution)
- Data subject access / correction / deletion requests
- Data breach assessment, notification (NPC and affected subjects), and post-incident review
- Vendor / processor data-sharing agreements
- Privacy impact assessments for new features
- Coordinating with the National Privacy Commission (NPC)

The role is segregated from general operations. DPO sessions receive the
privacy workspace, data-subject-request queue, consent-version history, and
password/account controls. They do not receive booking, customer,
provider, support, money, tax, audit-log, staff, catalog, marketing, dispatch,
or settings routes. A super-admin retains documented fallback privacy authority.
The existing breach API remains DPO-scoped, but its replacement admin screen is
held under E40 until privacy counsel approves the classification and deadline
contract.

## Who can hold the role

- An existing active plain-admin account whose `users.role` is changed to `'dpo'`. Customer, provider, and super-admin identities cannot be appointed directly.
- A super_admin can perform a reasoned assignment or handover through the staff workspace. The server records the actor, reason, old role, and new role.
- Only one active DPO seat is allowed. Assignment is serialized and fails if the seat is already occupied.
- A super_admin retains *implicit* DPO authority via the `requireDpoRole` middleware (covers the case where the DPO seat is vacant during handover). For routes that require strict segregation, gate inline on `req.user.role === 'dpo'` rather than `requireDpoRole`.

## How to assign

1. Sign in to the admin app as super_admin.
2. Open **Staff & Roles → DPO Management**.
3. Search for an existing active admin account by name, email, or phone.
4. Select the account, enter the appointment authority and handover context, then click **Assign DPO**. This calls `POST /staff/dpos/:userId/promote` with the written reason.
5. The transition atomically advances the account session generation, deletes all refresh tokens, revokes all active admin CSRF tokens, and disconnects live sockets. The person's current session must stop working. Verify a fresh two-factor login into the Privacy Workspace; TOTP enrollment is required only if the account has not already enrolled it.

## How to revoke

1. Open **Staff & Roles → DPO Management**.
2. Click **Start handover** next to the current DPO.
3. Enter the appointment-end and replacement context, then confirm. This calls `POST /staff/dpos/:userId/demote` with the written reason and always returns the dedicated identity to plain admin. It cannot convert an internal privacy identity into a customer or provider persona.
4. The same immediate session-generation, refresh-token, CSRF-token, and socket invalidation runs on removal. Verify that the old privacy session fails and that the fresh login has plain-admin access. The DPO seat is vacant until the replacement is assigned; complete any required NPC registration update outside the app.

## What a DPO session can access

- They can sign in via the admin login flow (`POST /auth/admin/login`).
- They are forced to enroll TOTP 2FA on first sign-in.
- The app lands at `/privacy` and exposes `/data-protection-log` and `/consent-versions`.
- The API permits DPO-scoped consent search/history, DSR list/detail/update/actions/alerts, breach-log actions, and consent-version publication.
- General operations, money, customer/provider, support, tax, staff, system-settings, and general audit endpoints continue to reject the DPO role. Client navigation is a usability boundary; API middleware remains the authority.
- Do not present every incident as NPC-notice-pending. E40 holds the replacement breach UI and legal wording for counsel review.

## What stays with super_admin

- Staff role assignment (including DPO promote/demote)
- Platform settings
- Catalog / category / addon editing
- All admin routes already gated to admin/super_admin
- Implicit DPO fallback authority (until a DPO is assigned)

## NPC registration

Per NPC Circular 17-01, the DPO's contact details (name, email, phone) must be registered with the National Privacy Commission within 30 days of appointment. The runbook owner is responsible for filing this with NPC after promotion. The launch cutover checklist (`docs/runbooks/launch-cutover.md` item #1) covers initial registration; subsequent changes need a separate filing.

## Audit trail

Every promote/demote writes an `admin_actions` row:
- `action_type='staff_role_promoted_dpo'` on promotion
- `action_type='staff_role_demoted_from_dpo'` on demotion
- `details` JSONB carries the prior/new role, new session generation, and refresh/CSRF revocation counts
- `admin_id` is the acting super_admin
- `reason` and `full_notes` preserve the written appointment or handover rationale

Query the trail:
```sql
SELECT * FROM admin_actions
WHERE action_type IN ('staff_role_promoted_dpo', 'staff_role_demoted_from_dpo')
ORDER BY created_at DESC;
```

## Failure modes

- **DPO seat empty.** `requireDpoRole` still passes super_admin through. Operationally OK, but a violation of segregation; assign a DPO ASAP.
- **DPO seat already occupied.** A second assignment is refused with 409. Complete the current DPO handover before assigning the replacement.
- **Tried to promote a super_admin.** Refused with 409. Demote them to admin first if you really want to formally assign DPO.
- **Tried to promote a deactivated user.** Refused with 409. Reactivate first.
- **Promoted user already DPO.** Idempotent — no-op, no audit row.
- **Old session still works after a transition.** Treat this as a security incident. Stop the handover, capture the route and timestamp, and inspect migration 158, the account session generation, refresh-token deletion, CSRF revocation, and Socket.IO disconnect evidence before proceeding.
