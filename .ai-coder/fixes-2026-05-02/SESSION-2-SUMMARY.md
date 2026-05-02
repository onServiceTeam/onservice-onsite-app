# Fixes session 2 — 2026-05-02 — summary

## What landed

**16 commits on master, all with passing tests.** Full API suite at 1835/1835 green (was 1621 at session 1 close).

Sessions 1 + 2 together close ALL launch-blocking + production-quality dispatches (Wave 1 P0 + Wave 2 P1 + Wave 2 P2) except 2 hard-stops awaiting Ken (E01 dpo role, E02 auto_charge).

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
| 734d8dd | MED-N155 | webhook payment.amount mismatch alerting (Sentry + security_events) |
| 195999d | MED-N166 | wallet.routes /withdraw delegates to payoutService.requestPayout |
| eff761c | MED-N120 | reconciliation discrepancy alerts via Sentry + Slack |
| ba5a67e | (handoff D-J27) | F#3 Maestro fixture scripts + /__test API endpoints (gated) |

Plus 1 escalation commit (97f5d03) writing E01 + E02 for Ken.

## Score

- **Wave 1 P0:** 11 of 11 DONE (closed in session 1)
- **Wave 2 P1 (12 dispatches):** 11 actionable DONE, 2 escalated to Ken
- **Wave 2 P2:** 4 of 4 DONE (D-J27 + D-J28 + D-J29 + D-J30)
- **Total CRITs/MEDs fixed across both sessions:** ~36 (13 CRITs + ~23 MEDs)

## What was added (session 2 only)

### New migrations
- `091_aml_payout_review.sql` — AML review tracking on payouts table
- `092_gateway_retry_queue.sql` — Failed gateway action retry queue
- `093_provider_suspension_booking_flag.sql` — Cascade flag on bookings
- `094_user_preferred_locale.sql` — User locale for notification i18n
- `095_payment_amount_mismatch_event.sql` — security_events enum extension

### New services
- `gateway-retry.service.ts` — Enqueue + worker for failed gateway actions
- `i18n.service.ts` — Notification translation catalog (en/tl)
- `slack-alert.service.ts` — Block Kit poster for ops alerts

### New routes
- `test-fixtures.routes.ts` — Maestro state-trigger endpoints (dev-only, gated)

### New terraform
- `infra/terraform/s3-access-log-bucket.tf` — Shared S3 access log bucket + logging on bir/uploads

### New scheduled job
- `gateway-retry` worker job (every 5 min in workers.ts)

### New shell scripts
- `scripts/maestro/force-error.sh`
- `scripts/maestro/seed-empty.sh`
- `scripts/maestro/seed-success.sh`
- `scripts/maestro/README.md`

### New escalation files
- `.ai-coder/escalations/E01-dpo-role-implement-or-remove-2026-05-02.md`
- `.ai-coder/escalations/E02-recurring-auto-charge-implement-or-remove-2026-05-02.md`

## Operator workflow before launch (cumulative)

See `PROGRESS.md` for the full list. Net-new from session 2:

1. Apply migrations 091–095 in production.
2. Apply terraform: `s3-access-log-bucket.tf` (creates the shared access-log bucket + attaches logging to bir-receipts and uploads).
3. Optional: tune `aml_large_transaction_threshold_centavos`, `marketing_channels`, `matching_tier_bonus` via Settings UI.
4. Set `SLACK_ALERT_WEBHOOK_URL` env var in production (incoming webhook URL for the #ops-alerts channel).
5. Wire admin Compliance dashboard view of `payouts.requires_aml_review=TRUE`, `gateway_retry_queue.status='failed_permanent'`, and `security_events.event_type='payment_amount_mismatch'`.
6. Mobile UI: add preferred_locale picker in user profile.
7. NEVER set `ENABLE_TEST_FIXTURES=1` in production (Maestro fixture endpoints are dev-only).

## Architectural decisions deferred to Ken (still pending)

- **D-J15 (CRIT-M03)** — `dpo` role: implement or remove. See E01.
- **D-J22 (MED-N114, N115)** — recurring booking `auto_charge`: implement or remove. See E02.

Both escalations recommend **Path B (remove for v1.0, deliver properly in v1.1)** but the choice is Ken's.

## Remaining work

### Beyond Wave 2 (v1.1 hardening backlog)
The audit identified 190 CRITs + 656 MEDs total. Sessions 1 + 2 closed
the launch-blocking subset (Wave 1 P0), the production-quality subset
(Wave 2 P1), AND the launch-quality polish subset (Wave 2 P2). The
remaining CRITs and MEDs are documented in
`.ai-coder/audit-2026-05-01/PHASE-*-BATCH-*.md` and constitute the
v1.1 hardening backlog.

## Next session restart

1. Check `.ai-coder/decisions/` for Ken's responses on E01 (dpo) and
   E02 (auto_charge). If present, execute the chosen path — only
   work blocking final v1.0 launch.
2. Otherwise, return to `.ai-coder/audit-2026-05-01/PHASE-*-BATCH-*.md`
   and work through remaining MEDs in batch order. All Wave 2 work
   is closed; remaining items are v1.1 hardening (not launch-blocking).
3. Continue same pattern: edit code, write test, run, commit.
