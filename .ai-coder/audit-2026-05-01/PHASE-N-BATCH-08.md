# Phase N Batch 8 — or.service.ts (1 file, 807 lines)

## File fully read
- packages/api/src/services/or.service.ts (807)

## Findings

### CRIT-N03 — Official Receipt PDFs include placeholder TIN, address, and BIR PTU number — non-compliant
**Where found:** packages/api/src/services/or.service.ts:200-243
```ts
doc.fontSize(11).text('OnService Platform Inc.', { continued: false });
doc.fontSize(9).text('TIN: 000-000-000-000');
doc.text('Address: [Placeholder] Makati City, Metro Manila, Philippines');
doc.text('VAT-Registered Taxpayer');
...
doc.fontSize(7).text(
  'This is a system-generated Official Receipt. BIR Permit to Use (PTU) No.: [Placeholder].',
);
```

**Understood:** Every OR PDF generated and uploaded to S3 has:
- TIN: `000-000-000-000` (placeholder)
- Address: `[Placeholder] Makati City, Metro Manila, Philippines`
- BIR PTU: `[Placeholder]`

These are emitted as the issuer's identity on every customer-facing receipt. BIR audit of these receipts will reject them as non-conforming (BIR rules require valid TIN, registered business address, and Permit to Use number from BIR for system-generated receipts).

Customer-facing impact: customers presenting these receipts to their accountants for VAT input claims will have those claims rejected.

Compliance impact: BIR can fine the platform per non-compliant receipt + revoke the OR system permit. Per RR 8-2022 and BIR Form 1907, system-generated ORs require a registered POS/CAS with PTU number.

**Fix scope:**
1. Obtain BIR-issued TIN (15-digit format).
2. Register the OnService POS/CAS system with BIR via BIR Form 1907 → receive PTU number.
3. Hard-fail at startup if `BIR_TIN`, `BIR_BUSINESS_ADDRESS`, `BIR_PTU_NUMBER` env vars are not set in production.
4. Replace hardcoded strings with env vars in buildOrPdf.
5. Re-generate any already-issued OR PDFs (since they're stored in S3 with placeholders) — ideally before the issuance scope at launch is large.
6. This is a Phase F#10 launch-cutover blocker.

### POSITIVE — Atomic OR-number generation
- `INSERT INTO or_sequences ... ON CONFLICT (year, month) DO UPDATE SET last_sequence = last_sequence + 1 RETURNING last_sequence` (line 283-289) is the correct gap-free monotonic-counter pattern.
- Asia/Manila timezone applied via Intl.DateTimeFormat (line 95).
- Format: `OR-YYYY-MM-NNNNNN` (line 108-112).

### POSITIVE — Idempotent issuance
- Line 348-362: existing non-cancellation OR for same booking returns the existing record. No duplicate issuance.

### POSITIVE — Cancellation pattern (BIR-compliant)
- Line 524-640: Cancellation does NOT delete original. Marks original.cancelled_at + cancellation_reason + cancelled_by, then INSERTS a new negative-amounts OR with is_cancellation=TRUE + cancels_or_id=originalId. This matches BIR's "OR numbers never reused or removed" requirement.

### POSITIVE — VAT-inclusive Philippine math
- Line 393: `vat = round(gross * 12/112)`. Net = gross - vat. Matches PH receipt standard (VAT is 12% of net, so VAT-inclusive total = net + 12%).

### POSITIVE — S3 server-side encryption
- uploadPdf calls uploadBirDocument which uses ServerSideEncryption: 'AES256' (verified Phase M).

### POSITIVE — Permission validation on cancel
- Line 532-534: reason min 5, max 500 chars.

## Cumulative Phase N progress: 8 / 104 files (~8,689 lines)
