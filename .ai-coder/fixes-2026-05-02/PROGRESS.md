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

## Wave 2 P1 — COMPLETE (10 of 12 actionable; 2 escalated)

| # | Dispatch | CRIT/MED | Status | Commit |
|---|---|---|---|---|
| 12 | D-J12 — wire pricing-preview to resolvePromo | CRIT-N15 | DONE | 5bdbd0b |
| 13 | D-J13 — server.ts trust proxy + startup secret validation | CRIT-M04/M05 + MED-N66/N95/N169 | DONE | 58d37b0 |
| 14 | D-J16 — cacheMiddleware key by user + fail-closed | CRIT-M02 | DONE | 044c19b |
| 15 | D-J14 — rate-limit middleware live settings | CRIT-M01 | DONE | a509576 |
| 16 | D-J17 — provider tier canonicalization (founding tier) | MED-N22/N32/N102 | DONE | b165a21 |
| 17 | D-J26 — dispute mutation endpoints super_admin | MED-N160 | DONE | da8b31a |
| 18 | D-J21 — photo MIME plumbing + portfolio URL validation | MED-N89/N97 | DONE | 5265205 |
| 19 | D-J19 — AML threshold for payouts + per-method format | MED-N77/N78 | DONE | 0a84bb3 |
| 20 | D-J18 — gateway-action retry queue + worker | MED-N28 | DONE | b2a0077 |
| 21 | D-J24 — provider suspension cascade + KYC + tier whitelist | MED-N73/N74/N75 | DONE | 2e38856 |
| 22 | D-J23 — marketing channels + tier bonus admin-tunable | MED-N29/N102 | DONE | e7a72ef |
| 23 | D-J25 — S3 server access logging on bir + uploads | MED-O03 | DONE | 46dd319 |
| 24 | D-J20 — notification i18n + Tagalog bypass keywords | MED-N58/N59/N140 | DONE | 7d91d87 |

### Escalated to Ken (HARD STOPS per CLAUDE.md)

- **D-J15** (CRIT-M03, MED-O02) — `dpo` role: implement or remove.
  See `.ai-coder/escalations/E01-dpo-role-implement-or-remove-2026-05-02.md`.
- **D-J22** (MED-N114, N115) — recurring booking `auto_charge`: implement or remove.
  See `.ai-coder/escalations/E02-recurring-auto-charge-implement-or-remove-2026-05-02.md`.

Both have Path A (implement) + Path B (remove) laid out with effort
estimates and recommendations. Awaiting Ken's choice in chat or in
`.ai-coder/decisions/D15-*.md` and `.ai-coder/decisions/D22-*.md`.

## Operator workflow before launch (cumulative — sessions 1 + 2)

1. Apply migrations 089 → 094 in production database.
2. Set production environment variables:
   - `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `CAPTCHA_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`
   - `AWS_S3_BUCKET`, `AWS_REGION`
   - `TRUST_PROXY_HOPS` (default 1)
3. Log in as super_admin and set the 5 BIR filer identity values.
4. Apply terraform: `s3-access-log-bucket.tf` (creates the shared
   access-log bucket + attaches logging to bir-receipts and uploads).
5. Optional: tune `aml_large_transaction_threshold_centavos`,
   `marketing_channels`, `matching_tier_bonus`, `rate_limit_*` via
   Settings UI.
6. Wire admin Compliance dashboard view of `payouts.requires_aml_review=TRUE`
   and `gateway_retry_queue.status='failed_permanent'`.
7. Mobile UI: add preferred_locale picker in user profile.

## Wave 2 P2 — COMPLETE

| # | Dispatch | CRIT/MED | Status | Commit |
|---|---|---|---|---|
| 25 | D-J28 — webhook payment.amount mismatch alerting | MED-N155 | DONE | 734d8dd |
| 26 | D-J29 — wallet.routes /withdraw delegates to payoutService | MED-N166 | DONE | 195999d |
| 27 | D-J30 — reconciliation Slack alerting | MED-N120 | DONE | eff761c |
| 28 | D-J27 — F#3 fixture scripts + /__test endpoints | (handoff) | DONE | ba5a67e |

## Session 2 final state — 2026-05-02

- **Test suite:** 1888/1888 passing.
- **Commits this session:** 25+ (from 044c19b through 647b4e4).
- **All Wave 1 P0 + Wave 2 P1 + Wave 2 P2 dispatches DONE** except 2
  hard-stops (D-J15 dpo role, D-J22 recurring auto_charge) which
  await Ken's choice in escalation files E01 + E02.

## v1.1 hardening backlog progress (session 2 continuation)

After Wave 2 P2 closed, kept going into the v1.1 audit findings.
Landed:

| Commit | MED | Title |
|---|---|---|
| 98963b3 | MED-N25/N26 | releasePartialEscrow money math guards |
| 37e9146 | MED-N10 | forceCompleteBooking releases escrow when held |
| 45f6b02 | MED-N19 | dispute auto-resolve refund is transactional |
| 24cf86b | MED-N15 | flag_fraud uses correct action_type + queryable boolean |
| d3690b8 | MED-N16 | fraud-pattern thresholds admin-tunable |
| 647b4e4 | MED-N18+N24 | noshow window tunable + remove dismissed status |
| 46971df | MED-N06+N07 | commission optimization reads live rate + recognizes founding |

**Deferred:** MED-N27 (handleCancellation atomicity) — needs a 9-test
rewrite that's larger than the fix itself; left as the next session's
first item. The legacy entry point still has the multi-trx gap; the
trx-aware variant `handleCancellationInTransaction` (used by the
booking-admin path) is already correct.

**Audit findings remaining (rough counts, v1.1 backlog):**
- MED-N: ~140 of 169 still open
- MED-K, L, M, O batches: not yet touched in fixes phase

## Session 2 final state — 2026-05-02 (final)

- **Test suite:** 1895/1895 passing.
- **Commits this session:** 28+ total (Wave 2 P1 + P2 + 9 v1.1 MEDs + escalations + docs).
- **Net new tests:** +274 (started at 1621 in session 1 close).
- **Net new migrations:** 7 (089–095 + 096) all compatible with prod schema.
- **Next session priorities:**
  1. Check `.ai-coder/decisions/` for Ken responses on E01 / E02.
  2. If no decisions, tackle MED-N27 with the test rewrite (8-test
     transition to dbTransactionMock pattern), then continue v1.1
     backlog from MED-N04 (memory-loaded churn pagination) onward.

## RESUME instructions for the next session

1. Check `.ai-coder/decisions/` for Ken's responses on E01 (dpo) and
   E02 (auto_charge). If present, execute the chosen path.
2. Otherwise, return to the full audit findings list under
   `.ai-coder/audit-2026-05-01/PHASE-*-BATCH-*.md` and start
   working through remaining MEDs in audit batch order. The
   launch-blocking subset (Wave 1 P0) and production-quality subset
   (Wave 2 P1 + P2) are now closed; what's left is the v1.1
   hardening backlog.
3. Continue the same pattern: edit code, write test, run, commit.

Each fix is one self-contained commit. The dispatches do not have
inter-dependencies that force order.
