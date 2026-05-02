# D15 — DPO role: real implementation (Path A)

**Date:** 2026-05-02
**Decided by:** Ken (chat instruction: maximal effort, no lazy path)
**Resolves:** Escalation E01

---

## Decision

**Path A — Implement `'dpo'` as a real role.** Reject Path B (alias super_admin to DPO).

## Rationale

NPC RA 10173 §21 requires a designated DPO with independent authority. Aliasing DPO to super_admin defeats segregation of duties. Ken's standing instruction (2026-05-02): "I want you to do the maximal effort, not the decision that removes things or takes a lazy route which we have to go back and do later anyways."

## Execution plan

1. Migration: add `'dpo'` to `admin_staff.role` CHECK constraint.
2. Widen `AuthPayload.role` enum in `auth.middleware.ts` to include `'dpo'`.
3. Update `auth.service.ts` JWT issuance + login flows to accept and sign `'dpo'` JWTs.
4. Wire `requireDpoRole` middleware to allow role='dpo' through (currently functionally identical to requireSuperAdmin).
5. Admin Settings UI: super_admin can assign/revoke the DPO role on a staff member.
6. Runbook entry: DPO duties, segregation of duties policy, who currently holds the role.
7. Tests: middleware allows dpo, blocks customer/provider/admin; JWT issued with dpo role validates; bootstrap accepts dpo; super_admin can promote-to-dpo and demote-from-dpo.
