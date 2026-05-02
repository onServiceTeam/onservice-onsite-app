# Phase B Findings Part 8 — Invoice, OR, BIR-2307, VAT Report (Financial / BIR services)

Files added in this batch:
- `services/invoice.service.ts` (498) — B2B monthly invoicing
- `services/or.service.ts` (807) — Official Receipt (BIR)
- `services/bir-2307.service.ts` (842) — Quarterly withholding tax certificate (RR 16-2023)
- `services/vat-report.service.ts` (645) — Monthly VAT report (BIR Form 2550M)

**Phase B running total: ~11,391 lines fully read** (was 8,599; +2,792 this batch).

---

## CRITICAL bugs (continuing from CRIT-38)

### CRIT-39 — Monthly invoice bulk insert is non-atomic across two queries
**File:** [packages/api/src/services/invoice.service.ts:175-282](packages/api/src/services/invoice.service.ts#L175)
The Phase 13 D-E refactor batched inserts via UNNEST — good for perf — but the two bulk INSERTs (line 206 invoices + line 267 items) are NOT wrapped in a transaction. If the items INSERT fails after the invoices INSERT commits, **customers are billed for ₱X with no breakdown**. They see an invoice number, total amount, but no line items.

**Fix dispatch:**
```
1. Wrap both INSERTs in db.transaction(async (client) => { ... }).
2. The intermediate Map building (invoiceByAccount) and array projections happen in JS — no DB cost — they should be inside the transaction's callback to ensure rollback consistency.
3. Notification dispatch stays OUTSIDE the transaction (best-effort, doesn't block billing).
4. Test: simulate items INSERT failure → assert invoices INSERT rolled back (no orphan invoice rows).
```

### CRIT-40 — markInvoicePaid has no payment verification + no audit row
**File:** [packages/api/src/services/invoice.service.ts:399-417](packages/api/src/services/invoice.service.ts#L399)
```ts
export async function markInvoicePaid(invoiceId, paymentReference) {
  const result = await db.query<InvoiceRow>(
    `UPDATE business_invoices SET status='paid', ... WHERE id = $2 AND status IN ('sent','overdue')`,
    [paymentReference, invoiceId],
  );
}
```
- No verification that `paymentReference` corresponds to a real PayMongo payment.
- No verification that the payment amount equals the invoice total.
- No `admin_actions` audit row.
- Combined with CRIT-23 (RBAC ignores staff perms), any user with role='admin' can mark any B2B invoice paid with a made-up reference string. Real money loss for the platform — provider gets paid out (since downstream services see invoice status='paid').

**Fix dispatch:**
```
1. Caller MUST be either:
   - Webhook handler (after PayMongo confirms payment), OR
   - Admin with verified payment_intent_id + admin_actions audit
2. Add a paymentIntentId parameter; verify status='succeeded' AND amount === invoice.total_amount AND metadata.invoice_id matches.
3. INSERT admin_actions(admin_id, 'invoice_marked_paid', 'business_invoice', invoiceId, {amount, paymentReference, ...}, reason).
4. Test: invoice marked paid without matching payment intent → 400.
5. Test: amount mismatch → 400.
6. Test: missing audit fails the operation (transaction rollback).
```

### CRIT-41 — BIR PDFs ship with placeholder TIN, address, BIR PTU number
**Files:**
- [or.service.ts:200-202](packages/api/src/services/or.service.ts#L200) — OR PDF: TIN `000-000-000-000`, address `[Placeholder] Makati City`
- [or.service.ts:241-243](packages/api/src/services/or.service.ts#L241) — `BIR PTU No.: [Placeholder]`
- [bir-2307.service.ts:236-238](packages/api/src/services/bir-2307.service.ts#L236) — Withholding agent block: same placeholders
- [vat-report.service.ts:228-229](packages/api/src/services/vat-report.service.ts#L228) — Filer block: same placeholders

If a customer downloads an OR with TIN `000-000-000-000`, BIR penalties apply. Same for VAT report and BIR-2307. **Production launch blocker.**

**Fix dispatch:**
```
1. Add platform_settings entries:
   - bir_company_name = 'OnService Platform Inc.' (or actual registered name)
   - bir_tin = '<actual TIN>' (from BIR registration)
   - bir_address = '<actual registered address>'
   - bir_ptu_number = '<actual Permit to Use number>'
   - bir_atc_code = 'WI158' (or actual ATC for online platform service income)
2. Replace hardcoded strings in or.service.ts:200-202, 241-243; bir-2307.service.ts:236-238; vat-report.service.ts:228-229 with await getSetting('bir_company_name'), etc.
3. Add a bir-config-validation startup check: if NODE_ENV=production and any bir_* setting is missing OR has placeholder value, REFUSE TO START.
4. Add tests: get OR PDF buffer, parse text, assert no '[Placeholder]' or '000-000-000-000' substrings.
5. Tracked in D14 ops items — confirm in launch-cutover.md runbook.
```

### CRIT-42 — Invoice generation uses platformConfig.vatRate (in-memory), not DB settings
**File:** [packages/api/src/services/invoice.service.ts:180](packages/api/src/services/invoice.service.ts#L180)
```ts
const taxAmount = Math.round(afterDiscount * platformConfig.vatRate);
```
Same root cause as CRIT-13 — in-memory constants instead of DB-tunable settings. If admin changes `vat_rate` in DB (e.g., BIR adjusts VAT rate), invoices generated by this monthly cron continue using the old rate.

**Fix:** read from `await getSettingPercent('vat_rate')` or wrap into a settings cache lookup. Consolidate with CRIT-13 fix.

### CRIT-43 — BIR-2307 withholding threshold + rate hardcoded as constants
**File:** [packages/api/src/services/bir-2307.service.ts:75-78](packages/api/src/services/bir-2307.service.ts#L75)
```ts
const WITHHOLDING_THRESHOLD_CENTAVOS = 50_000_000;  // P500K
const WITHHOLDING_RATE = 0.01;  // 1%
```
If BIR raises threshold or rate (RR 16-2023 amendments are common), code redeploy required. Should be platform_settings.

**Fix dispatch:**
```
1. Add platform_settings:
   - bir_withholding_threshold_centavos = 50000000
   - bir_withholding_rate_percent = 1.0
2. Read at start of generateQuarterly2307Batches and regenerate2307ForProvider.
3. Document the BIR regulatory reference (RR 16-2023) in the setting description so operations knows the source of truth.
```

---

## MEDIUM bugs

### MED-48 — Invoice number generation uses Math.random
**File:** [packages/api/src/services/invoice.service.ts:66-71](packages/api/src/services/invoice.service.ts#L66)
6-char base-36 random. ~2.2B combinations per month, low collision risk but Math.random is predictable. Use `crypto.randomBytes(3).toString('hex')` for slightly better entropy.

### MED-49 — Invoice payment terms missing 'net_30' case
**File:** [packages/api/src/services/invoice.service.ts:73-81](packages/api/src/services/invoice.service.ts#L73)
Switch handles 'net_15', 'net_60', else default. If account has `payment_terms='net_30'`, falls through to `platformConfig.invoiceDefaultDueTermsDays`. Verify this is intentional (net_30 IS the default) and matches default constant. Otherwise it's silent bug.

### MED-50 — OR S3 upload fails silently if not configured (production)
**File:** [packages/api/src/services/or.service.ts:259-267](packages/api/src/services/or.service.ts#L259)
If `S3_BIR_BUCKET` env not set, `uploadBirDocument` returns null → OR.pdf_url stays null. In production this is a BIR audit gap: receipt issued but no PDF for the customer to download or the auditor to verify.

**Fix:** in production, throw if S3 not configured. Use the same pattern as PAYMONGO_WEBHOOK_SECRET validation.

### MED-51 — admin_actions admin_id NULL constraint risk for system-issued ORs
**File:** [packages/api/src/services/or.service.ts:478-501](packages/api/src/services/or.service.ts#L478)
Comment says "admin_actions.admin_id NOT NULL constraint may reject — we log + continue". If migrations enforce NOT NULL on admin_id, EVERY system-issued OR fails to write the audit row. Verify in Phase G.

**Fix:** verify migration 055 (or related) makes admin_id nullable for system actions. If not, fix the migration.

### MED-52 — Invoice notifications run sequentially after both INSERTs
**File:** [packages/api/src/services/invoice.service.ts:287-315](packages/api/src/services/invoice.service.ts#L287)
For 1000 B2B accounts with monthly invoices, this is 1000 sequential notification dispatches. Each can take 50-200ms. Should be parallelized via `Promise.all` or queued.

### MED-53 — Overdue invoice notification has N+1 owner lookup
**File:** [packages/api/src/services/invoice.service.ts:433-455](packages/api/src/services/invoice.service.ts#L433)
Per-invoice query for owner_user_id. Comment notes "bounded daily cron" but at scale this is slow. Better: include owner_user_id in the RETURNING via JOIN.

### MED-54 — vat-report DOES correctly handle PHT timezone — note for fix to CRIT-12
**File:** [packages/api/src/services/vat-report.service.ts:116-142](packages/api/src/services/vat-report.service.ts#L116)
Both `manilaYearMonth` (Intl.DateTimeFormat parts) and `monthWindow` (Date.UTC with -8h shift) are correct PHT handling. **This is the pattern that should replace the broken toLocaleString roundtrip in `pricing.service.ts:282-285` (CRIT-12 in B02).** The CRIT-12 fix should reuse these helper patterns.

---

## LOW / INFO

- **or.service.ts is excellent BIR-compliant code:**
  - Atomic, gap-free OR numbering per (year, month) via INSERT ... ON CONFLICT DO UPDATE on `or_sequences` (line 283-291). Correct BIR requirement.
  - VAT-inclusive math (line 392-394): `vat = round(gross * 12/112)`, `net = gross - vat`. CORRECT for PH.
  - Cancellation creates NEW negative OR (line 524-640) instead of deleting. CORRECT BIR append-only semantics.
  - Idempotency (line 347-362) prevents double issuance.

- **bir-2307.service.ts handles threshold-crossing quarter correctly** (line 332-341) — only the excess above P500K is withheld in the crossing quarter.

- **vat-report.service.ts finalize lock** (line 469-474, 486-492): can't overwrite finalized reports. Race-safe via `WHERE finalized_at IS NULL` clause in UPDATE.

- **All three BIR services correctly ignore cancellation OR rows** when summing income (`is_cancellation = FALSE`).

- **PDF generation is best-effort outside transactions** in all services — correct pattern (money-relevant rows committed first).

---

## What's still NOT read in money path

- `services/booking-admin.service.ts` (1,143)
- `services/financial-admin.service.ts` (1,065)

These are admin-side services that wrap the same flows for admin operations. Read in next batch.
