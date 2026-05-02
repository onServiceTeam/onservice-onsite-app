# Fixes session 2 — 2026-05-02 — summary

## What landed

**11 commits on master, all with passing tests.** Full API suite at 1777/1777 green (was 1621 at session 1 close).

| Commit | CRIT/MED | Title |
|---|---|---|
| 044c19b | CRIT-M02 | cacheMiddleware keys by user identity + fail-closed on auth headers |
| a509576 | CRIT-M01 | rate-limit middleware honors live admin-tuned settings |
| b165a21 | MED-N22/N32/N102 | provider tier canonicalization (founding tier across 4 sites) |
| da8b31a | MED-N160 | dispute mutation endpoints require super_admin |
| 5265205 | MED-N89/N97 | photo MIME plumbing + portfolio URL validation |
| 0a84bb3 | MED-N77/N78 | AML threshold for payouts + per-method destination format |
| b2a0077 | MED-N28 | failed-gateway-action retry queue + worker |
| 2e38856 | MED-N73/N74/N75 | provider suspension cascade + KYC pre-approval + tier whitelist |
| e7a72ef | MED-N29/N102 | marketing channels + matching tier bonus admin-tunable |
| 46dd319 | MED-O03 | S3 server access logging on bir-receipts + uploads |
| 7d91d87 | MED-N58/N59/N140 | i18n for notification bodies + Tagalog bypass keywords |

Plus 1 escalation commit (97f5d03) writing E01 + E02 for Ken.

## Score

- **Wave 2 P1 (12 dispatches):** 11 actionable DONE, 2 escalated to Ken
- **Wave 2 P2:** 0 of 4 (D-J27–D-J30 — launch-quality polish, not launch-blocking)
- **Total CRITs/MEDs fixed across both sessions:** ~30 (13 CRITs + ~17 MEDs)

## What was added (session 2 only)

### New migrations
- `091_aml_payout_review.sql` — AML review tracking on payouts table
- `092_gateway_retry_queue.sql` — Failed gateway action retry queue
- `093_provider_suspension_booking_flag.sql` — Cascade flag on bookings
- `094_user_preferred_locale.sql` — User locale for notification i18n

### New services
- `gateway-retry.service.ts` — Enqueue + worker for failed gateway actions
- `i18n.service.ts` — Notification translation catalog (en/tl)

### New terraform
- `infra/terraform/s3-access-log-bucket.tf` — Shared S3 access log bucket + logging on bir/uploads

### New scheduled job
- `gateway-retry` worker job (every 5 min in workers.ts)

### New escalation files
- `.ai-coder/escalations/E01-dpo-role-implement-or-remove-2026-05-02.md`
- `.ai-coder/escalations/E02-recurring-auto-charge-implement-or-remove-2026-05-02.md`

## Operator workflow before launch (cumulative)

See `PROGRESS.md` for the full list. Net-new from session 2:

1. Apply migrations 091, 092, 093, 094 in production.
2. Apply terraform: `s3-access-log-bucket.tf` (creates the shared access-log bucket + attaches logging to bir-receipts and uploads).
3. Optional: tune `aml_large_transaction_threshold_centavos`, `marketing_channels`, `matching_tier_bonus` via Settings UI.
4. Wire admin Compliance dashboard view of `payouts.requires_aml_review=TRUE` and `gateway_retry_queue.status='failed_permanent'`.
5. Mobile UI: add preferred_locale picker in user profile.

## Architectural decisions deferred to Ken (still pending)

- **D-J15 (CRIT-M03)** — `dpo` role: implement or remove. See E01.
- **D-J22 (MED-N114, N115)** — recurring booking `auto_charge`: implement or remove. See E02.

Both escalations recommend **Path B (remove for v1.0, deliver properly in v1.1)** but the choice is Ken's.

## Remaining work

### Wave 2 P2 (4 dispatches, none launch-blocking individually)
- D-J27 — F#3 fixture scripts for Maestro state captures
- D-J28 — Webhook payment.amount mismatch alerting (MED-N155)
- D-J29 — wallet.routes.ts /withdraw delegation to payout.service (MED-N166)
- D-J30 — Reconciliation Slack alerting (MED-N120)

### Beyond Wave 2
The audit identified 190 CRITs + 656 MEDs total. Sessions 1 + 2 closed
the launch-blocking subset (Wave 1 P0) and the production-quality
subset (Wave 2 P1). The remaining CRITs and MEDs are documented in
`.ai-coder/audit-2026-05-01/PHASE-*-BATCH-*.md` and constitute the
v1.1 hardening backlog.

## Next session restart

1. Check `.ai-coder/decisions/` for Ken's responses on E01 (dpo) and
   E02 (auto_charge). If present, execute the chosen path.
2. Otherwise, start D-J27 (Maestro fixture scripts) — the only P2
   item that touches infra Ken should review himself.
3. After P2 is closed, return to the full audit findings list and
   work through remaining MEDs in audit batch order.
