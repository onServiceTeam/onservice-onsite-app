# Phase 08 — Future Bugs

Known limitations and TODOs introduced or perpetuated by Phase 08
(Financial dashboard rebuild + BIR compliance), ordered by likelihood
of biting within 2 weeks of shipping.

## #1 (most likely): Real S3 upload not wired — `pdf_url` is null in production

**Why:** `or.service.ts:256` (`uploadPdf`),
`bir-2307.service.ts` (`uploadPdf` for batches), and
`vat-report.service.ts` (`uploadPdf` for VAT reports) all share the
same shape: if `process.env.AWS_S3_BUCKET` AND `process.env.AWS_REGION`
are set, return the canonical `https://<bucket>.s3.<region>.amazonaws.com/...`
URL; otherwise `logger.warn 'Skipping ... PDF upload'` and return
`null`. **No `aws-sdk` import is added in this phase.** Even if
both env vars are configured in production, `pdfUrl` is computed
purely from string interpolation — no bytes are actually uploaded.

**How it surfaces:** Admin opens the Receipts tab, clicks an OR row,
sees `pdf_url` populated in the JSON — clicks the link — gets a 403
NoSuchKey from S3. Or worse: leaves the env vars unset and every
`pdf_url` is `null`, so the Receipts download link is permanently
greyed out.

**Mitigation now:** HONESTY-CHECK calls out the stub explicitly. The
in-process `buildOrPdf` / `buildVatPdf` / `attachPdfToBatch` calls
DO produce real PDF bytes (pdfkit), so a future S3 hookup only has
to wire the upload — the byte buffer is already in hand.

**Mitigation later:** add `@aws-sdk/client-s3`, replace the stub
return in each `uploadPdf` with a real `PutObjectCommand` call, and
add a backfill cron for any rows persisted with `pdf_url=NULL`
during the stub window.

---

## #2: PayMongo balance fetch deferred — caller-supplied only

**Why:** `runDailyReconciliation` accepts `paymongoBalance` as an
**input parameter**. There is no PayMongo client integration in this
phase; the route handler at `bir-admin.routes.ts:264` simply passes
through whatever value the request body contains. When the value is
absent or `null`, the service correctly suppresses alerts (see
premortem #4) and notes `'PayMongo balance unavailable;
expected_total only'`. This is safe — but it means **today's daily
reconciliation has no actual external check**; it only proves the
on-platform buckets sum to themselves.

**Fix later:** introduce a PayMongo client wrapper that calls
`/v1/balances`, then add a daily cron that calls
`runDailyReconciliation({ paymongoBalance })`. On any PayMongo error
the cron MUST pass `null` (not `0`) — see premortem #4.

---

## #3: BIR 2307 logic uses simplified RR 16-2023 baseline — REQUIRES ACCOUNTANT REVIEW

**Why:** `bir-2307.service.ts` encodes
`WITHHOLDING_THRESHOLD_CENTAVOS = 50_000_000` (₱500,000) and a flat
`WITHHOLDING_RATE = 0.01` (1%). Real RR 16-2023 has edge cases:
- Threshold-crossing quarter applies only to the portion above the
  threshold (the implementation handles this via
  `computeWithholding`).
- Provider-side tax classification (VAT-registered vs non-VAT,
  individual vs corporation) may change the rate.
- Provider-supplied tax declarations / exemption certificates can
  override the platform default.

The platform's interpretation here is the **baseline default** for
providers without overrides. Generated PDFs must be marked DRAFT and
reviewed by an authorized accountant before BIR submission.

**Fix later:** add `provider_tax_profile` rows (TIN, VAT status,
exemption status, accountant-overridden rate) and have
`computeWithholding` consult that profile per provider before
applying the platform default.

---

## #4: VAT `input_vat` hard-coded to 0 (marketplace assumption)

**Why:** `vat-report.service.ts:354` sets `inputVat = 0` when
generating the monthly report (`vatPayable = outputVat - inputVat`).
This treats the platform as if it has no creditable input VAT — true
for a pure marketplace fee, but providers themselves accumulate
input VAT (business expenses, supplies, tools) that may be credited
against their own VAT liability, not ours.

**Fix later:** if/when providers register their own input VAT
through the platform, add a `vat_input_credits` table and adjust
the monthly aggregator to sum credits per provider per month before
computing `vat_payable`. Until then, the accountant overlays the
correct input VAT before BIR submission.

---

## #5: Reconciliation alert dispatch is log-only (no Slack/email)

**Why:** when `Math.abs(discrepancy) > ALERT_THRESHOLD_CENTAVOS`,
`runDailyReconciliation` calls `logger.error` and sets
`discrepancy_alert_sent=true` on the snapshot row. There is no
Slack webhook call, no email send, no PagerDuty trigger. The alert
is visible only to whoever is watching the structured-error log
sink at the time, plus anyone who later opens
`/api/v1/admin/bir/reconciliation/alerts`.

**Fix later:** wire `notification.service` to consume rows where
`discrepancy_alert_sent=true AND ack_at IS NULL` and dispatch to
the appropriate channel.

---

## #6: `payouts` table existence is `to_regclass`-guarded — Payouts tab shows zeros until the table is created

**Why:** `getPayoutsSummary` in `financial-admin.service.ts:607`
probes `to_regclass('public.payouts')` and returns the zeros-payload
shape when the table is absent. No migration in this phase creates
the `payouts` table — so the Financials → Payouts tab will silently
render zeros on every cluster until a separate phase introduces
that table.

**Fix later:** create the `payouts` table (separate phase that owns
the bank-payout pipeline) and remove the guard.

---

## #7: `bookings.completed_at` and `bookings.city` columns are assumed present

**Why:** several aggregations in `financial-admin.service.ts`
reference `bookings.completed_at` (revenue/overview windows) and
`bookings.city` (`getRevenueByCity`). If a legacy migration omits
either column the affected breakdowns will return zeros (revenue) or
fail to group (city). The boundary tests mock these reads, so the
test suite cannot detect the mismatch.

**Fix later:** add an explicit assertion in `verify-master.sh` that
both columns exist on `bookings`, or normalise to a known-present
column (`scheduled_at` for revenue windows; a `service_address.city`
join for the city breakdown).

---

## #8: Sequential OR cancellation shares the next-month sequence number rather than issuing a paired negative number

**Why:** `cancelOR` reserves the **next** monthly OR sequence number
for the cancellation OR (`generateOrNumber` inside the same tx).
This keeps the per-month sequence monotonic + gap-free as the BIR
requires, but it means the cancellation OR's number is not visibly
paired with the original OR's number — a reviewer must follow the
`cancels_or_id` foreign key. Some BIR auditors prefer a separate
"void" register where cancellation entries reuse the original OR
number with a "VOID" suffix.

**Fix later:** add a `void_or_register` view that joins
`official_receipts` to itself on `cancels_or_id` and exposes the
audit-friendly pair, or extend `or_number` formatting for
`is_cancellation=TRUE` rows to encode the original number.
