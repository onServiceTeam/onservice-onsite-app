# Escalation E01 — `dpo` role: implement or remove

**Date:** 2026-05-02
**From:** AI coder (fixes session)
**Audit refs:** CRIT-M03, MED-O02 (PHASE-M-BATCH-01 §CRIT-M03)
**Dispatch:** D-J15
**Class:** Architectural decision (hard stop per CLAUDE.md §"Hard stops" #3)

---

## What's broken

`packages/api/src/middleware/require-dpo.middleware.ts:15` declares
`DPO_ROLES = new Set(['super_admin', 'dpo'])`. But
`packages/api/src/middleware/auth.middleware.ts:8` types `role` as
`'customer' | 'provider' | 'admin' | 'super_admin'` — `'dpo'` is not
in the enum.

Concrete consequences:

1. JWTs are signed with one of the 4 enum values. A user with role
   `'dpo'` could never receive a JWT, because the auth-issuance code
   doesn't know `'dpo'`.
2. `requireDpoRole` middleware is therefore functionally identical to
   `requireSuperAdminRole` — only super_admins ever pass it.
3. Endpoints intended for DPO-only access (per F04 CRIT-141 spec)
   are gated to super_admin instead. That's a different security
   model: the DPO is supposed to be a separate person from the
   super_admin (segregation of duties for NPC RA 10173 compliance).

The `bootstrap-admin.ts` script also accepts `'dpo'` in its allowed
roles list, so an operator running bootstrap with role=dpo would
write a DB row with role='dpo' that can never log in.

## What this means for compliance

NPC RA 10173 §21 requires a designated Data Protection Officer with
independent authority. If "DPO" and "super admin" are the same
person, the DPO has the authority to override their own DPO duties.
NPC has flagged this in audits before — segregation matters.

## Two paths

### Path A — Implement `'dpo'` as a real role

What changes:
1. Widen `AuthPayload.role` enum in `auth.middleware.ts` to include
   `'dpo'`.
2. Update `auth.service.ts` JWT issuance + login flows to accept and
   sign `'dpo'` JWTs.
3. Add `'dpo'` to the `admin_staff.role` CHECK constraint in DB
   (migration).
4. Wire `requireDpoRole` to actually allow role='dpo' through, not
   just super_admin.
5. Add Settings UI affordance for super_admin to assign a user the
   DPO role.
6. Document DPO duties in the runbook.

Estimate: 1.5 sessions (migration + 4 code paths + admin UI hook + tests).

Trade-off: matches NPC compliance intent. More moving parts. Need to
audit existing super_admin-only routes and decide which should
become DPO-only or DPO+super_admin.

### Path B — Remove `'dpo'` and document super_admin as the DPO

What changes:
1. Remove `'dpo'` from `DPO_ROLES` set in
   `require-dpo.middleware.ts`. Rename the file/middleware to
   `require-super-admin.middleware.ts` so the intent is clear.
2. Remove `'dpo'` from `bootstrap-admin.ts` allowed roles.
3. Add a paragraph to the operations runbook stating: "The acting
   super_admin user is the designated DPO under RA 10173. To assign
   a different DPO, change the super_admin assignment."
4. File a future-work ticket if real role separation is wanted later.

Estimate: 1/2 session.

Trade-off: ships fast, matches what the code actually does today.
Weakens the compliance posture (no formal segregation of duties).
NPC could push back during DPO registration.

## My recommendation

**Path B for v1.0 launch.** Path A is the right end-state but it's
more work than the launch can absorb, and it's correctable post-
launch (adding a role doesn't migrate any existing data). Document
clearly in the runbook that DPO == super_admin until role separation
ships, and file the v1.1 ticket.

## What I need from Ken

Choose A or B (or ask follow-up questions). Reply in chat or write
the answer in `.ai-coder/decisions/D15-dpo-role.md`.

If A, I'll execute the 6-step plan and ship in ~1.5 sessions.
If B, I'll execute the 4-step plan and ship in ~1/2 session.
