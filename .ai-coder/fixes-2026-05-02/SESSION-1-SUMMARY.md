# Fixes session 1 — 2026-05-02 — summary

## What landed

**14 commits on master, all with passing tests.** Full API suite at 1621/1621 green.

| Commit | CRIT/MED | Title |
|---|---|---|
| f91d660 | CRIT-N14 | sms + payment axios → native fetch (+ MED-N143 dev log fix) |
| 61a8317 | CRIT-N04 | releaseEscrowInTransaction money-conservation guard |
| ec04f6a | CRIT-N11 | tokens removed from admin login response body (4 sites) |
| 91dff53 | CRIT-N16 | settings mutations require super_admin |
| cf8925d | CRIT-N13 | settings update + audit insert in single transaction |
| b24efc2 | CRIT-N09 | createBooking + booking_addons transactional, multi-row INSERT |
| 5609321 | CRIT-N08 | anonymizeUser atomic + delete refresh tokens FIRST + crypto.randomUUID |
| 84aa15f | CRIT-N10 | confirmation uses releaseEscrowInTransaction atomically + OR post-commit |
| 3b77ad6 | CRIT-N12 | OTP codes hashed via scrypt + phone-as-secondary-salt + trx + timing-safe verify |
| cddac8d | CRIT-N03 + N06 | BIR filer identity from platform_settings (3 services + mig 090) |
| 66c2987 | CRIT-N07 | data export actually uploads to S3 (NPC RA 10173 right-to-portability) |
| 5bdbd0b | CRIT-N15 | wire pricing-preview to resolvePromo (Bug 261 closeout) |
| 58d37b0 | CRIT-M04 + M05 + 3 MEDs | server.ts startup secret validation + trust proxy |
| 7fd9525 | (test compat) | update runtime-config-e2e for trx-aware updateSetting |

## Score

- **Wave 1 P0 (launch-blocking):** 11 of 11 DONE
- **Wave 2 P1:** 2 of 14 DONE (D-J12, D-J13)
- **Total CRITs fixed this session:** 13 of 190

## What was added

- `packages/api/migrations/089_otp_code_hash.sql` — adds `otp_codes.code_hash`, drops NOT NULL on legacy `code`
- `packages/api/migrations/090_bir_filer_identity.sql` — seeds 5 platform_settings keys for BIR filer info
- `packages/api/src/services/bir-filer-identity.service.ts` — fail-closed loader for BIR identity

## Operator workflow before launch

1. Apply migrations 089 + 090 in production database.
2. Set environment variables in production:
   - `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `CAPTCHA_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`
   - `AWS_S3_BUCKET`, `AWS_REGION`
   - `TRUST_PROXY_HOPS` (default 1; 0 to disable)
3. Log in as super_admin and set the 5 BIR filer identity values via Settings UI:
   - `bir_filer_company_name`
   - `bir_filer_tin`
   - `bir_filer_address`
   - `bir_filer_ptu_number`
   - `bir_filer_vat_status`
4. Verify the API boots (will refuse if any production-required env var is missing).
5. Verify a test OR PDF generates with the real filer identity (not placeholders).

## Architectural decisions deferred to Ken (hard stops per CLAUDE.md)

The following remaining dispatches require Ken's input — they are
"implement or remove" decisions where the spec is silent:

- **D-J15 (CRIT-M03)** — `dpo` role: implement (build out role-aware
  JWT issuance + DPO_ROLES enforcement) OR remove (drop from
  bootstrap-admin allowed list, drop require-dpo middleware, document
  super_admin as the DPO equivalent).
- **D-J22 (MED-N114, N115)** — recurring booking `auto_charge` flag:
  implement (wire to wallet auto-debit on schedule) OR remove (drop
  from schema and admin UI to stop implying functionality that does
  not exist).

Recommend writing escalation files in `.ai-coder/escalations/` for
these before next session starts.

## Remaining Wave 2 P1

D-J14, D-J16 through D-J26. None are launch-blocking individually
but the cluster represents the production-quality bar for v1.0.

## Next session restart

1. Read `.ai-coder/fixes-2026-05-02/PROGRESS.md` for status.
2. Pick the first non-DONE row from the Wave 2 P1 list.
3. Continue the same fix-test-commit loop.
