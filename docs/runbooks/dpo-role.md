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

The role is explicitly segregated from super_admin to prevent the same person from approving their own DPO decisions.

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
5. The user is now a DPO. They must enroll TOTP 2FA on next login (forced by the admin login flow).

## How to revoke

1. Open **Staff & Roles → DPO Management**.
2. Click **Start handover** next to the current DPO.
3. Choose the destination account role, enter the appointment-end and replacement context, then confirm. This calls `POST /staff/dpos/:userId/demote` with the written reason.
4. The DPO seat is vacant until the replacement is assigned. Complete any required NPC registration update outside the app.

## What changes when a user becomes DPO

- They can sign in via the admin login flow (`POST /auth/admin/login`).
- They are forced to enroll TOTP 2FA on first sign-in.
- They gain access to every route gated by `requireDpoRole`: consent records, breach logs, data subject requests, DPO-scope reporting.
- They do **not** automatically gain access to general admin routes (booking management, financial reports, BIR filing, catalog editing). Those remain admin/super_admin only.

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
