# Fixes 2026-05-02 — Progress tracker

This file tracks real fixes applied to the codebase from the audit findings in `.ai-coder/audit-2026-05-01/`.

**Convention:** Each fix is a single commit on master with its own `it('Bug NNNN — ...')` test block. Mark a fix DONE only when:
- Code change landed
- New test in place that exercises the actual fix (not file-existence)
- Test runs green locally (npm test in the relevant package)
- Commit pushed

## Wave 1 P0 — Launch-blocking dispatches

Order chosen smallest-surface-first to build momentum + verify the fix-and-test pipeline works.

### Status

| # | Dispatch | CRIT | Status | Commit |
|---|---|---|---|---|
| 1 | D-J10 — sms + payment services axios → native fetch (+ MED-N143) | CRIT-N14 | DONE | f91d660 |
| 2 | D-J08 — releaseEscrowInTransaction money-conservation guard | CRIT-N04 | DONE | 61a8317 |
| 3 | D-J07 — remove tokens from admin login response body (4 sites) | CRIT-N11 | DONE | ec04f6a |
| 4 | D-J11 — settings.routes super_admin gating | CRIT-N16 | DONE | 91dff53 |
| 5 | D-J09 — settings.service updateSetting + audit transactional | CRIT-N13 | DONE | cf8925d |
| 6 | D-J05 — createBooking + booking_addons transactional | CRIT-N09 | DONE | b24efc2 |
| 7 | D-J04 — anonymizeUser transactional + delete refresh tokens first | CRIT-N08 | DONE | 5609321 |
| 8 | D-J06 — confirmation flow uses releaseEscrowInTransaction + OR post-commit | CRIT-N10 | DONE | 84aa15f |
| 9 | D-J01 — hash OTP codes in DB (migration 089 + scrypt + trx) | CRIT-N12 | DONE | 3b77ad6 |
| 10 | D-J02 — BIR filer identity in platform_settings (mig 090 + 3 services) | CRIT-N03+N06 | DONE | cddac8d |
| 11 | D-J03 — implement S3 upload in data-export | CRIT-N07 | DONE | 66c2987 |

## ✅ Wave 1 P0 — ALL 11 launch-blocking CRITs DONE

11 commits (each a self-contained CRIT fix with its own test, plus
migrations 089 + 090 + new bir-filer-identity service):

| CRIT | Commit | Summary |
|---|---|---|
| CRIT-N14 | f91d660 | sms + payment axios → native fetch (+ MED-N143 dev log fix) |
| CRIT-N04 | 61a8317 | releaseEscrowInTransaction money-conservation guard |
| CRIT-N11 | ec04f6a | tokens removed from admin login response body (4 sites) |
| CRIT-N16 | 91dff53 | settings mutations require super_admin |
| CRIT-N13 | cf8925d | settings update + audit insert in single transaction |
| CRIT-N09 | b24efc2 | createBooking + booking_addons transactional, multi-row INSERT |
| CRIT-N08 | 5609321 | anonymizeUser atomic + delete refresh tokens FIRST + crypto.randomUUID |
| CRIT-N10 | 84aa15f | confirmation uses releaseEscrowInTransaction atomically + OR post-commit |
| CRIT-N12 | 3b77ad6 | OTP codes hashed via scrypt + phone-as-secondary-salt + trx + timing-safe verify |
| CRIT-N03 + N06 | cddac8d | BIR filer identity from platform_settings (3 services + mig 090) |
| CRIT-N07 | 66c2987 | data export actually uploads to S3 (NPC RA 10173 right-to-portability) |

**Operator workflow before launch:**
1. Apply migrations 089 (otp_code_hash) + 090 (bir_filer_identity).
2. Set the 5 BIR filer identity values via super_admin Settings UI:
   bir_filer_company_name, bir_filer_tin, bir_filer_address,
   bir_filer_ptu_number, bir_filer_vat_status.
3. Verify AWS_S3_BUCKET + AWS_REGION env vars set in production for
   data-export delivery.

## Next session — Wave 2 P1 (remaining dispatches from audit closeout)

The audit closeout (`.ai-coder/audit-2026-05-01/AUDIT-CLOSEOUT-FINAL.md`)
lists D-J11 through D-J26 as P1 priority. Of those, D-J11 (CRIT-N16) is
already DONE in this session. The remaining P1 dispatches are:

- **D-J12** Wire pricing-preview to resolvePromo (CRIT-N15)
- **D-J13** server.ts trust proxy + startup secret validation (CRIT-M04, M05, MED-N66, N95, N169)
- **D-J14** Promote rate-limit middleware to live settings (CRIT-M01)
- **D-J15** Decide 'dpo' role: implement or remove (CRIT-M03, MED-O02)
- **D-J16** Cache middleware: key by user identity (CRIT-M02)
- **D-J17** Provider tier name canonicalization (MED-N22, N32, N102)
- **D-J18** Failed-gateway-refund retry queue (MED-N28, N57)
- **D-J19** AML threshold for payouts (MED-N77, N78)
- **D-J20** i18n for notification bodies (MED-N58, N59, N140)
- **D-J21** Photo MIME plumbing + portfolio URL validation (MED-N89, N97)
- **D-J22** Recurring booking auto_charge: implement or remove (MED-N114, N115)
- **D-J23** Marketing channel + tier weights admin tunability (MED-N29, N102, N126)
- **D-J24** Provider suspension cascade + KYC pre-approval + tier whitelist (MED-N73-75)
- **D-J25** Server access logging on S3 buckets (MED-O03)
- **D-J26** Dispute /resolve, /escalate, /assign super_admin gating (MED-N160)

Plus D-J27 through D-J30 (P2 polish).

## RESUME instructions for the next session

1. Read this file to find the first non-DONE row in the next-session
   list above. (Wave 1 is complete; pick from Wave 2 D-J12 onward.)
2. Read the relevant CRIT/MED description in
   `.ai-coder/audit-2026-05-01/PHASE-N-BATCH-*.md` and the matching
   dispatch description in
   `.ai-coder/audit-2026-05-01/AUDIT-CLOSEOUT-FINAL.md`.
3. Continue with the same pattern: edit code, write test, run, commit.

Each fix is one self-contained commit. The dispatches do not have
inter-dependencies that force order.
