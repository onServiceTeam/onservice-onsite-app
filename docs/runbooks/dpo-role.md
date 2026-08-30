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

The role is intended to be segregated from general operations. The current route matrix is incomplete under E34, and super-admin retains implicit DPO fallback authority, so the application does not yet enforce complete personnel segregation.

> **W13 access warning:** promotion and removal update `users.role`, but do not revoke already-issued access tokens, refresh-token rows, CSRF tokens, or browser sessions. An old access token can retain its former role for its remaining lifetime. Follow the controlled sign-out and access review below; do not describe the database update as immediate revocation. E38 holds the session-version correction.

## Who can hold the role

- An existing active admin account whose `users.role` is changed to `'dpo'`. Create and verify the internal account before assignment.
- A super_admin can perform a reasoned assignment or handover through the staff workspace. The server records the actor, reason, old role, and new role.
- Only one active DPO seat is allowed. Assignment is serialized and fails if the seat is already occupied.
- A super_admin retains *implicit* DPO authority via the `requireDpoRole` middleware (covers the case where the DPO seat is vacant during handover). For routes that require strict segregation, gate inline on `req.user.role === 'dpo'` rather than `requireDpoRole`.

## How to assign

1. Sign in to the admin app as super_admin.
2. Open **Staff & Roles → DPO Management**.
3. Search for an existing active admin account by name, email, or phone.
4. Select the account, enter the appointment authority and handover context, then click **Assign DPO**. This calls `POST /staff/dpos/:userId/promote` with the written reason.
5. Complete a controlled sign-out of the person's existing admin sessions and verify a fresh two-factor login. The current app does not perform or prove that revocation automatically. A fresh login receives the new DPO claim; TOTP enrollment is required only if the account has not already enrolled it.

## How to revoke

1. Open **Staff & Roles → DPO Management**.
2. Click **Start handover** next to the current DPO.
3. Choose the destination account role, enter the appointment-end and replacement context, then confirm. This calls `POST /staff/dpos/:userId/demote` with the written reason.
4. Complete a controlled sign-out and access review for the outgoing DPO. Their already-issued token is not invalidated by the role update. The DPO seat is vacant until the replacement is assigned; complete any required NPC registration update outside the app.

## What changes after a fresh DPO session

- They can sign in via the admin login flow (`POST /auth/admin/login`).
- They are forced to enroll TOTP 2FA on first sign-in.
- A newly issued DPO token reaches routes currently gated by `requireDpoRole`, including consent, breach, and data-subject-request work.
- They should not gain general admin operations from the DPO role. E34 records that the current page and API route matrix is not fully reconciled, so verify the approved route inventory rather than relying on the sidebar alone.

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
- `details` JSONB carries `{previousRole, newRole}`
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
- **Old session still works with the prior role.** This is the open E38 limitation. Complete the controlled sign-out/access review and escalate any failed revocation; do not assume the role update invalidated the token.
