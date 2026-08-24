# Escalation E22 — BIR invoice numbering and fake launch verifiers

**Date raised:** 2026-08-24
**Status:** OPEN — launch blocker; requires Ken's Philippine accountant or tax counsel

## Bad news first

The launch runbook and its two BIR verification scripts describe a system that
does not exist in the application:

- `BIR_OR_SERIES_PREFIX`, `BIR_OR_SERIES_START`, and
  `BIR_OR_SERIES_END` are not read by any runtime code.
- `/internal/bir/next-or-number` and `/internal/test/issue-or` do not exist.
- The verifier queries `bir_receipts(amount_cents, vat_cents, pdf_s3_key)`,
  but the actual table is `official_receipts(gross_amount, vat_amount,
  pdf_url, ...)`.
- The application generates `OR-YYYY-MM-######` numbers from a monthly
  `or_sequences` counter. It does not enforce an ATP-authorized start/end
  serial range.

The old scripts could therefore report Item 2 or Item 12 as passed without
proving that the application issued a legally usable document. They now fail
closed until this escalation is resolved.

The admin filing calendar also encoded an obsolete or unapproved taxpayer
profile:

- It treated Form 1601-EQ as monthly and due on the 10th. BIR describes
  1601-EQ as a quarterly return due on the last day of the month following
  the quarter.
- It generated Form 2550M monthly deadlines even though BIR stopped requiring
  monthly VAT declarations for transactions beginning January 1, 2023;
  current VAT filing is quarterly on Form 2550Q.
- It hardcoded individual-income-tax Forms 1701 and 1701Q even though the
  repository has no approved company taxpayer/entity profile proving those
  are onService's forms.

The calendar now returns a 503 compliance hold instead of publishing false
deadlines. Monthly VAT rows are retained only as internal reconciliation
workpapers and are not represented as tax returns.

## Current BIR conflict

BIR's post-EOPT rules treat an Invoice as the principal sales document and an
Official Receipt as a supplementary document. The current application calls
its principal document an `OFFICIAL RECEIPT`, stores it in
`official_receipts`, and says that a PTU number makes it legally issuable.
That contract needs professional review before any naming, sequence, tax-point,
or PDF wording is changed.

Primary BIR references:

- [Revenue Regulations No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf)
- [RMC No. 77-2024 digest](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2077-2024%20Digest.pdf)
- [BIR Form 1906, January 2024: Application for Authority to Print Invoices](https://bir-cdn.bir.gov.ph/BIR/pdf/1906%20January%202024%20ENCS_final.pdf)
- [RMC No. 5-2023: monthly VAT declaration removed beginning January 1, 2023](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No.%205-2023.pdf)
- [BIR Form 2550Q, April 2024](https://bir-cdn.bir.gov.ph/BIR/pdf/2550Q%20%20April%202024%20ENCS_Final.pdf)
- [BIR 2025 tax calendar](https://bir-cdn.bir.gov.ph/BIR/pdf/2025%20Tax%20Calendar.pdf)

## Decision needed

Ken's accountant or Philippine tax counsel must provide:

1. Whether onService must issue a VAT Invoice, Non-VAT Invoice, or another
   approved principal document for each marketplace transaction.
2. Whether the company will use ATP-printed invoices, loose-leaf/CAS, or BIR's
   electronic invoicing route, and which permit/authority number belongs on
   the generated PDF.
3. The approved document title, required fields, serial format, first and last
   authorized serial, and whether numbering may reset monthly.
4. The correct seller/tax base for a marketplace transaction: the full
   customer service amount, only onService's commission/service revenue, or a
   split-document arrangement involving the provider.
5. The approved cancellation/credit-note mechanism and retention requirements.
6. The company's registered taxpayer/entity profile and accountant-approved
   recurring filing forms, deadlines, and responsible operator.

## Implementation after approval

Once those answers exist, implement the approved document model and an atomic
sequence bounded by the authorized range, migrate historical rows without
renumbering them, update the admin BIR screens/PDF text, and build a real
end-to-end verifier against the actual API/table/storage path. Do not rename or
renumber existing financial records before the migration and rollback plan are
reviewed.
