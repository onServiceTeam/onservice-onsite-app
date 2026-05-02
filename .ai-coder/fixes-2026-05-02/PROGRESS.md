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
| d83ef78 | MED-N08+N09 | booking-evidence reads UNION of photo tables, drops dead gps/receipts |
| e2b0fbc | MED-N31+N32+N33+N35 | provider-tools receipt + monthly summary fixes |
| 1b0f558 | MED-N37+N38+N39+N40 | catalog duplicate-slug + business txn + member re-add + user check |
| 07653f8 | MED-N20+N30 | provider TIN column for BIR 2307; parameterize timezone in SQL |
| 5b69028 | MED-N12+N34 | escrow-summary aging buckets accurate; provider pendingEscrow NET |
| d68d270 | MED-N14+N17 | activity endpoints mask IP+UA for junior admin |
| 2f147bd | MED-N05+N41 | real responseScore from booking_quotes; widen contract status enum |
| 859865d | MED-N04+N21 | churn prediction does pagination in SQL; BIR batch is per-provider error-resilient |
| 3e002d6 | MED-N11 | getRevenueByPaymentMethod surfaces degradation via {rows, degraded, message} |
| f319d71 | MED-N02 | admin GET /actions validates adminId UUID + actionType slug |
| 1282bb1 | MED-N62 | independent IP-level OTP lockout (closes phone-rotation bypass) |
| c8486d7 | MED-N86+N96 | log customer self-assigns + require auth on GET /providers/:id |
| d0febd5 | MED-N52+N54+N56 | account-deletion guards for pending escrow + cooling-off race + active dispute |
| dc06517 | MED-N42+N79+N81 | consent atomicity + tighter NPC ref + email uniqueness pre-check |
| 97e2707 | MED-N63+N64+N87+N88+N92 | five transactionality + audit-trail fixes (revokeDevice audit, blockIp re-block, suki UPDATE atomicity, no-show trx, refresh token trx) + mig 098 |
| 131a438 | MED-N57+N60+N68+N72 | push retry queue (mig 099 + new push-retry.service); createNotification preserves caller keys; cancellations_last_30d no double-count; NotificationType union covers all observed types |
| 29b90dc | MED-N13+N99+N128+N130+N131 | availability override Zod schema; review flagged-content extended (URLs + Tagalog profanity + threats); review service length-cap defense-in-depth; staff removeStaffMember soft-delete + audit (mig 100); provider-admin reviews + disputes paginate |
| 3a4615b | MED-N55+N85+N125 | refresh-token device fingerprint binding (mig 101 + new platform setting); publishConsentVersion partial unique index for race (mig 102); account deletion in-progress error specificity |
| 457af2c | MED-N129+N141+N147 | addStaffMember audit + trx (mig 103); messaging sendMessage + conversation update trx; referral generateCode uses crypto.randomBytes (CSPRNG) |
| 826b639 | MED-N133+N142+N146+N150+N151 | slot waitlist dispatches notification; deleteTemplate audit; promotion lifecycle audit (create/update/delete); service-area-change verifies provider exists before applying |
| 04c96eb | MED-N145+N161+N163+N164+N167 | catalog routes super_admin gating; notification-template DELETE super_admin; service-area waitlist rate limit; webhook rate limit; booking status partition invariant + metrics imports canonical sets |
| 60673f9 | MED-N156+N158+N165 | webhook payment.paid trx (escrow + wallet trx-aware variants); wallet payment 4-step trx; business types + payment terms from platform_settings (mig 104) |
| 31bdbe4 | MED-N46+N47+N48+N49 | vat-report TOCTOU race (FOR UPDATE + finalized_at IS NULL guard); pdf_url no longer NULLed during regen; createServiceArea audit + trx; generateSlug fallback uses CSPRNG. MED-N69 confirmed already addressed |
| 3811b33 | MED-N51+N67+N115+N117 | area_waitlist uniqueness includes province (mig 105); saveBookingAddons dead-code removed; recurring filters anonymized users via is_active JOIN; invoice generateMonthlyInvoices fully transactional |
| 0055662 | MED-N82+N84 | admin 2FA setup transactional + admin_actions audit; admin auth (login, 2fa verify, 2fa disable) Zod schemas via validationMiddleware |
| b74b635 | MED-N71+N91+N113+N118 | approveProvider notification type fix; pricing-preview Zod schema; updateRecurringPrice canonical-price band; checkOverdueInvoices CTE JOIN |

**Deferred:** MED-N27 (handleCancellation atomicity) — needs a 9-test
rewrite that's larger than the fix itself; left as the next session's
first item. The legacy entry point still has the multi-trx gap; the
trx-aware variant `handleCancellationInTransaction` (used by the
booking-admin path) is already correct.

**Audit findings remaining (rough counts, v1.1 backlog):**
- MED-N: ~70 of 169 still open (~99 landed across sessions 2+3)
- MED-K, L, M, O batches: not yet touched in fixes phase

## Session 3 final state — 2026-05-02 (cumulative, end of session)

- **Test suite:** 2162/2162 passing (started this session at 2055,
  +107 net new tests).
- **Commits this session (12 fix + 2 docs):** 97e2707, 131a438,
  29b90dc, 3a4615b, 457af2c, 826b639, 04c96eb, 60673f9, 31bdbe4,
  3811b33, 0055662, b74b635 (+ earlier dc06517 + cfd3e6c docs).
- **MED-Ns landed this session:** 51 (across the 12 fix commits).
- **Cumulative v1.1 MEDs landed:** 92 of ~169 (~54%).
- **Net new migrations this session:** 8 (098 device_revoked event
  type, 099 push_retry_queue, 100 admin_staff soft-delete, 101
  refresh_token_fingerprint, 102 consent_version_unique, 103
  staff_added action_type, 104 business_account_config_settings,
  105 area_waitlist province).
- **Net new services this session:** 1 (push-retry).
- **Operator workflow before launch — ADD to existing list:**
  - Apply migrations 098 → 105 in production database.
  - In Settings UI, optionally tune
    `refresh_token_strict_fingerprint` (default FALSE — observe-only),
    `business_account_types`, `business_payment_terms`.
  - Before applying mig 105 (area_waitlist UNIQUE includes province),
    dedupe area_waitlist rows on (phone, city) where province differs
    — the migration is defensive and will RAISE NOTICE rather than
    fail outright, but enforcement is delayed until dedupe lands.

- **Next session priorities:**
  1. Check `.ai-coder/decisions/` for Ken responses on E01 / E02.
  2. Continue v1.1 backlog from MED-N50/65/66/70/71/83/100+ onward.
  3. Tackle MED-N27 (handleCancellation atomicity) when convenient —
     still requires the 9-test rewrite.
  4. Routes calling getProviderActivity / getCustomerActivity should
     forward `req.user.role` for accurate masking (currently default-
     masked).
  5. Admin UI: consumer of GET /financial/revenue/by-payment to
     handle `{rows, degraded, message}` shape with a "schema not
     migrated" banner when degraded=true.
  6. Admin UI: render the new admin_actions audit rows (staff_added,
     staff_removed, config_changed for service_area + promotion +
     notification_template) in the existing audit timeline.

## Session 4 (2026-05-02 cont.) — Hard stops resolved + v1.1 continues

Ken's standing instruction (chat, 2026-05-02): "I want you to do the
maximal effort, not the decision that removes things or takes a lazy
route which we have to go back and do later anyways. it should be
done now." Both hard stops chose Path A (real implementation), not
Path B (delete the feature).

| # | Escalation | Decision | Status | Commit |
|---|---|---|---|---|
| 1 | E01 — DPO role | D15 — Path A (real role) | DONE | (latest) |
| 2 | E02 — recurring auto-charge | D22 — Path A (real PayMongo + wallet) | DONE | (latest) |

### E01 — DPO role (resolved)

NPC RA 10173 §21 segregation-of-duties role implemented end-to-end:

- Migration 106: users.role CHECK widened with 'dpo'; admin_actions
  CHECK widened with staff_role_promoted_dpo + staff_role_demoted_
  from_dpo.
- Type system: UserRole, AuthPayload.role, rbac UserRole all include
  'dpo'. New ADMIN_TIER_ROLES + DPO_AUTHORIZED_ROLES helper sets.
- Admin login flow: /admin/login query widened to admin tier; 2FA
  setup/enable/disable + forced enrollment all admit 'dpo'.
- Service: promoteToDpo, demoteFromDpo, listDpos with SELECT FOR
  UPDATE + audit insert in single trx. Idempotent on re-promote;
  refuses to promote super_admin (segregation), refuses deactivated
  user; refuses demoteTo='super_admin'.
- Routes: GET /staff/dpos, POST /staff/dpos/:userId/promote, POST
  /staff/dpos/:userId/demote (all super_admin-gated).
- Runbook: docs/runbooks/dpo-role.md (NPC registration, audit trail,
  failure modes).
- Decision file: .ai-coder/decisions/D15-dpo-role.md.
- Tests: 26 (e01-dpo-role.test.ts).

### E02 — recurring auto-charge (resolved)

Real PayMongo + wallet auto-charge with admin kill switch:

- Migration 107: recurring_bookings adds payment_method_id (PayMongo
  source token), payment_method_label, auto_charge_status,
  auto_charge_consecutive_failures, auto_charge_suspended_at,
  auto_charge_last_attempt_at. Partial index for the scheduler hot
  path. New audit table recurring_auto_charge_attempts (every
  attempt logged with wallet+paymongo split, payment ID, failure
  reason). platform_settings row for max_consecutive_failures
  (default 3).
- Service: recurring-auto-charge.service.ts (new):
  setAutoChargePaymentMethod / clearAutoChargePaymentMethod
  (customer-side capture/clear with ownership check, idempotent on
  re-set, resets failure counter). attemptAutoCharge (wallet-first
  then PayMongo for the remainder; on success → booking confirmed,
  escrow held, counter reset, succeeded notification; on failure →
  counter incremented, suspended at threshold, failed/suspended
  notifications). chargePaymongoMethod (POST /payments with stored
  source ID; sandbox-friendly). LEDGER_RECONCILE_NEEDED audit-row
  marker for the rare case where PayMongo charged but our DB
  failed. listAttempts for history.
- recurring.service.ts: scheduler calls attemptAutoCharge when
  rb.auto_charge=TRUE, AFTER the recurring clock advances (so a
  charge failure can never block the recurrence). Suppresses
  generic 'recurring_update' notification on auto-charge success.
- notification.service.ts: NotificationType union extended with
  three new lifecycle types.
- Routes: PUT /recurring/:id/auto-charge (capture/replace), DELETE
  /recurring/:id/auto-charge (clear), GET /recurring/:id/auto-
  charge/attempts (history).
- Runbook: docs/runbooks/recurring-auto-charge.md (PCI scope SAQ A
  preserved, reconciliation procedure for LEDGER_RECONCILE_NEEDED,
  kill switches).
- Decision file: .ai-coder/decisions/D22-recurring-auto-charge.md.
- Tests: 32 (e02-recurring-auto-charge.test.ts).

### Numbers (mid-session 4)

- **Tests at session 4 close:** 2242/2242 passing (was 2162 at
  session 3 close; +80 net new — E01 +26, E02 +32, MED-N100-105 +15,
  MED-N106-111 +7).
- **New migrations this session:** 2 (106 dpo_role_e01, 107
  recurring_auto_charge_e02).
- **New services this session:** 1 (recurring-auto-charge).
- **MED-Ns landed this session:** E01 + E02 + N100/101/103/104/105
  + N106/107/109/110/111 = 12 new MEDs (plus 2 escalations resolved).
- **Cumulative v1.1 MEDs landed:** ~104 of ~169 (~62%).
- **Operator workflow before launch — ADD:**
  - Apply migrations 106 + 107 in production.
  - Assign a real DPO via super_admin Settings → Staff → DPO
    management. Register DPO with NPC within 30 days (Circular 17-01).
  - Mobile UI work to wire the auto-charge toggle to the new
    PUT /recurring/:id/auto-charge endpoint with PayMongo capture
    sheet (out of scope for this backend session; tracked in mobile
    backlog).

## RESUME instructions for the next session

1. Both hard stops are resolved. No outstanding architectural
   decisions blocking the v1.1 MED backlog.
2. Return to the full audit findings list under
   `.ai-coder/audit-2026-05-01/PHASE-*-BATCH-*.md` and continue
   through remaining MEDs (~67 still open of 169 v1.1 MED-Ns;
   plus untouched MED-K, L, M, O batches).
3. Continue the same pattern: edit code, write test, run, commit.

Each fix is one self-contained commit. The dispatches do not have
inter-dependencies that force order.
