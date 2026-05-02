# Phase N Batch 9 — bir-2307.service.ts (1 file, 842 lines)

## File fully read
- packages/api/src/services/bir-2307.service.ts (842)

## Findings

### CONFIRMS CRIT-N03 — BIR Form 2307 PDFs ALSO have placeholder TIN/address
**Where found:** packages/api/src/services/bir-2307.service.ts:236-238
```ts
doc.text('Name: OnService Platform Inc.');
doc.text('TIN: 000-000-000-000');
doc.text('Address: [Placeholder] Makati City, Metro Manila, Philippines');
```
**Understood:** Same issue as or.service.ts. BIR 2307 (Certificate of Creditable Tax Withheld) is filed with BIR by the provider as proof of withholding. With placeholder TIN, the form is functionally a forgery. The DRAFT footer (line 272 — "DRAFT — CONSULT BIR-FORM 2307 AUTHORIZED PRINTER FOR OFFICIAL FILING") provides some operator awareness but providers receiving these PDFs may not understand they're not real.

### MED-N20 — Provider TIN not captured; PDF always shows "[Provider TIN — pending]"
**Where found:** packages/api/src/services/bir-2307.service.ts:245
```ts
doc.text(`TIN: ${provider.tin ?? '[Provider TIN — pending]'}`);
```
**Understood:** PdfProvider type accepts an optional `tin` field but the provider info loaded from the DB (loadProviderInfo at line 415-424) doesn't query a TIN column. There's no `providers.tin` column referenced. So every BIR 2307 PDF says "[Provider TIN — pending]" for the payee. Without provider TIN, the form cannot be used to claim creditable withholding tax — the payee can't link the withholding to their own BIR records.
**Fix:** Add `tin` column to providers table via new migration. Capture during onboarding (ic_agreement step). Update query to SELECT it. Required before BIR 2307 can be functionally used.

### MED-N21 — Quarterly batch generation processes providers serially without overall transaction
**Where found:** packages/api/src/services/bir-2307.service.ts:562-627
**Understood:** The for-loop processes providers one at a time. Each batch INSERT is a separate query. If the loop crashes mid-way (server restart, OOM), some providers have batches persisted, others don't. Re-running the function would skip the persisted ones (idempotency check at line 573) and continue from where it left off — but the operator gets no signal that the run was incomplete.
**Fix:** Track `result.batchesAttempted` separately from `result.batchesCreated`. If the loop catches an error per-provider, log and continue. Return the count of failures alongside successes.

### POSITIVE — RR 16-2023 threshold math (computeWithholding)
- Line 324-345: Correct logic for threshold-crossing quarter. If priorYtd >= threshold: full quarter withholdable. Else: only the excess above threshold this quarter is withholdable.
- 1% withholding rate applied via Math.round.
- Returns null when no batch should be created (clean signal to caller).

### POSITIVE — Idempotency
- Per-provider check at line 573: existing batch for (provider, year, quarter) skipped.
- ON CONFLICT DO NOTHING at line 588 catches race conditions.

### POSITIVE — Asia/Manila timezone math
- Line 111-130: quarterWindow handles UTC ↔ PHT conversion via Date.UTC with -8 hour offset. Correct since PH has no DST.

### POSITIVE — DRAFT footer + accountant warning
- Line 268-273: Red "DRAFT — CONSULT BIR-FORM 2307 AUTHORIZED PRINTER FOR OFFICIAL FILING" footer. Operator awareness.
- Comment at line 13-15: documents threshold/rate constants are platform's interpretation; accountant verification required.

### POSITIVE — Force-regenerate path
- regenerate2307ForProvider (line 646): admin-driven UPSERT. Wipes pdf_url and re-issues. Audit row 'bir_2307_regenerated'.

### POSITIVE — S3 upload with SSE-AES256
- Same uploadBirDocument helper as or.service.ts.

## Cumulative Phase N progress: 9 / 104 files (~9,531 lines)
