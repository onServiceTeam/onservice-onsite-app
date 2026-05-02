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

- A user (any existing user — staff, contractor, internal counsel) whose `users.role` is set to `'dpo'`.
- Super_admin can promote and demote at will via the staff routes (audit trail captured).
- A super_admin retains *implicit* DPO authority via the `requireDpoRole` middleware (covers the case where the DPO seat is vacant during handover). For routes that require strict segregation, gate inline on `req.user.role === 'dpo'` rather than `requireDpoRole`.

## How to assign

1. Sign in to the admin app as super_admin.
2. Settings → Staff → DPO management.
3. Search for the user (must already exist in the users table; create the user first via normal staff flow if needed).
4. Click "Promote to DPO". This calls `POST /staff/dpos/:userId/promote`.
5. The user is now a DPO. They must enroll TOTP 2FA on next login (forced by the admin login flow).

## How to revoke

1. Settings → Staff → DPO management.
2. Click "Demote" next to the DPO row.
3. Choose the destination role (default: admin). This calls `POST /staff/dpos/:userId/demote`.
4. The audit row records the change.

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

Query the trail:
```sql
SELECT * FROM admin_actions
WHERE action_type IN ('staff_role_promoted_dpo', 'staff_role_demoted_from_dpo')
ORDER BY created_at DESC;
```

## Failure modes

- **DPO seat empty.** `requireDpoRole` still passes super_admin through. Operationally OK, but a violation of segregation; assign a DPO ASAP.
- **Tried to promote a super_admin.** Refused with 409. Demote them to admin first if you really want to formally assign DPO.
- **Tried to promote a deactivated user.** Refused with 409. Reactivate first.
- **Promoted user already DPO.** Idempotent — no-op, no audit row.
