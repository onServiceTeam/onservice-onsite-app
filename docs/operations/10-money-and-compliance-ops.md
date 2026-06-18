# Money and Compliance Operations

Purpose: how money moves through onService (escrow, commissions, payouts, refunds), how PayMongo runs in live mode, and what BIR and NPC require of us day to day. This is the finance + compliance operating doc for the ops team.

Currency is Philippine pesos (₱). All amounts in the database are stored in centavos; the apps display pesos. Timezone for every cutoff below is Asia/Manila.

Related docs: `09-trust-safety-and-disputes.md` (dispute decisions), `07-provider-support-sop.md` (payout questions), `11-admin-system-training-manual.md` (how to do each action in the admin app), `13-policies-codes-and-templates.md` (cancellation policy summary, templates).

---

## 1. The money model in one paragraph

The intended design is INSTANT-PAY: the customer pays first into escrow, and a provider is matched after. The platform holds the money in a single escrow wallet, then releases it to the provider (minus our commission) once the customer confirms the job, or after auto-confirm. We never touch provider funds until the job is done.

> DECIDE (launch blocker, E03): instant-pay is NOT live on master today. On the current code a customer who reaches checkout creates a booking in `requested` status, then the payment step returns an error ("Cannot pay for a booking in 'requested' status"). The fix exists on branch `fix/e03-instant-pay-money-path` (commit `b6aaa1e`) but is not merged. Tester Jenico Polo De Leon confirmed the bug on 2026-06-16. Until Ken merges the fix, the smooth pay-first flow described here does not work end to end. See `.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`. Do not market instant-pay until merged.

---

## 2. Escrow lifecycle (hold to release)

There is one platform escrow wallet (type `platform_escrow`). Escrow money sits in its `pending_balance` until a job closes. Two sibling platform wallets exist: `platform_revenue` (our commission + service fee) and `guarantee_fund`.

Escrow states: `pending` -> `held` -> `released` (or `refunded` / `partially_refunded`).

| Step | What happens | Trigger |
|---|---|---|
| HOLD | Customer pays. Booking goes `paid` + escrow `held`. Money lands in escrow wallet pending_balance. | PayMongo `payment.paid` webhook (card/gcash) or wallet debit (instant for wallet method) |
| RELEASE | Provider wallet gets `service_price - commission`; revenue wallet gets `commission + service_fee - guarantee`; guarantee fund gets ~1.5% of the service fee. Escrow goes `released`, booking goes `payout_ready`. | Customer confirms the job, OR auto-confirm after 24h |
| REFUND | Money pushed back to customer through PayMongo. Escrow `refunded` or `partially_refunded`. | Cancellation or dispute resolution |

Auto-confirm: a booking sitting in `completed_by_provider` for longer than 24h (`escrow_auto_confirm_hours`, admin-tunable) is auto-confirmed, escrow released, booking moved to `payout_ready`. Customer is notified.

Escrow release is refused (held for admin) when the provider was suspended mid-booking, when there is no provider on the booking, or when the amounts do not reconcile. That is by design. Resolve it in the admin Booking detail page, Money tab.

---

## 3. Commission per provider tier

Commission is taken off the service price. The provider receives `service_price - commission`. Rates are admin-tunable (admin Settings, Commissions category); these are the current defaults.

| Tier | Commission | Notes |
|---|---|---|
| founding | 10% | Invite-only launch batch. First 50 providers per city, 10% for 12 months. |
| new | 15% | Default on signup. |
| verified | 13% | 5+ jobs, 4.0+ rating. |
| pro | 11% | 25+ jobs, 4.5+ rating, no open disputes. |
| elite | 9% | 100+ jobs, 4.7+ rating, TESDA-certified, no open disputes. Lowest rate. |

Other fees on top of the service price:
- Service fee: 10% of service price, floored at ₱25, capped at ₱500. Charged to the customer on top. `total_amount = service_price + service_fee`.
- Guarantee fund: 1.5% of the service fee, carved out of platform revenue on release. Funds the service guarantee (up to ₱25,000 per claim). This is a guarantee, not insurance.
- VAT: 12%, used for invoicing and official receipts, not deducted in the escrow split.

> PROFESSIONAL (accountant): there is a known code discrepancy in how the guarantee-fund base is computed between two services. The path that actually moves money (escrow release) computes guarantee = 1.5% of the service fee and subtracts it from platform revenue. Confirm with the accountant which base is correct for the books, and flag to Ken so the code matches. This affects revenue recognition, not customer-facing amounts.

---

## 4. Payouts to providers

Providers request payouts from their wallet available balance. Withdrawal processing target is 3 business days (starting target, tune later).

Methods and validation:
- GCash / Maya: 11-digit PH mobile, format `09XXXXXXXXX`.
- Bank InstaPay / Bank PESONet: 8 to 16 digit account number.

Rules:
- Minimum withdrawal ₱100.
- Provider must be `approved` status.
- One payout in flight at a time (pending / approved / processing).

Payout statuses: `pending` -> `approved` -> `processing` -> `completed`, or `rejected`. A large payout (₱500,000 or more, admin-tunable) lands in `aml_review_pending` and requires a super_admin to clear the AML review before it can proceed (RA 9160 anti-money-laundering).

Admin actions (Payouts page, super_admin only):
1. Review the request, method, and destination account.
2. Approve (reason 10+ chars) or Reject (reason 10+ chars, rebates the money back to available balance).
3. After sending the money externally, mark Complete (optionally record the PayMongo transfer ID).

> PROFESSIONAL (operations): the actual external transfer (sending pesos to the provider's GCash or bank) is a manual step today. "Complete" in admin records that it happened; it does not itself move money. Build a clear runbook for who logs into PayMongo / the bank and sends each batch.

---

## 5. Refunds and cancellations

Refunds run automatically through PayMongo when a booking with escrow `held` is cancelled or a dispute resolves with a refund. If the PayMongo refund fails, it is queued (`gateway_retry_queue`) and retried, not dropped.

> FLAG (real inconsistency, tell Ken): there are TWO cancellation systems and their numbers disagree.
> - The LIVE money path (what actually refunds) uses these brackets: over 24h = 100%, 2 to 24h = 100%, 1 to 2h = 90%, 30min to 1h = 80%, under 30min = 70%, provider already arrived = 50%, customer no-show = 0%.
> - The DISPLAYED policy (customer-facing page + admin Cancellation Policy editor) shows different tiers: 24h+ = 100%, 4 to 24h = 75%, under 4h = 50%, after scheduled / no-show = 0%.
> The customer sees the displayed policy but gets refunded by the live brackets. This needs a Ken decision to reconcile. See section 12A/12B in the booking ground-truth and `.ai-coder/decisions/D02-cancellation-policy.md`.

On a customer cancel (live path): customer gets the bracket-% refund of the service price plus the full service fee back, unless they no-showed (then the service fee is kept by the platform). Provider compensation on the booking is the inverse of the customer refund %.

Provider no-show (displayed-policy rule): customer gets 100% refund plus a platform-funded apology credit (default ₱200).

---

## 6. PayMongo live-mode operations

PayMongo is our payment provider. Supported methods: GCash, Maya, card, QRPH, bank transfer, plus internal wallet (wallet skips PayMongo).

Going live (launch-cutover Item 7, Ken-owned):
- [ ] Submit KYC to PayMongo: SEC/DTI registration, Mayor's permit, BIR registration, beneficial-ownership docs.
- [ ] Set the settlement bank account (where our money lands).
- [ ] Standard fees: 3.5% + ₱15 per transaction. Budget this into margins.
- [ ] Set webhook to `https://api.onservice.ph/webhooks/paymongo`.
- [ ] Test in sandbox, then switch to live mode and rotate keys to the live set (`pk_live_`, `sk_live_`, `whs_`).
- [ ] Confirm `PAYMONGO_WEBHOOK_SECRET` is the live webhook secret. A wrong/missing secret means webhooks fail (503/401) and paid bookings never flip to `paid`.

How a card/gcash payment completes: PayMongo calls our webhook with `payment.paid`. We verify the signature, check the amount matches (a mismatch is treated as tampering and the payment is NOT applied, a security event is logged), then flip the booking to `paid` + escrow `held`. This is idempotent and replay-protected.

Reconciliation (admin Financials -> Reconciliation, super_admin):
1. Run reconciliation (compares PayMongo balance vs our expected balance).
2. Review any discrepancy alerts.
3. Acknowledge each discrepancy with a note explaining the cause.

Do reconciliation at least weekly during launch, then settle into the month-end checklist (section 9).

---

## 7. BIR: registration, receipts, invoicing

We register and remit as a VAT taxpayer (projected gross sales over ₱3M/yr means VAT from day one).

Launch-cutover Item 2 (Ken / accountant):
- [ ] File BIR Form 1906 (Authority to Print) for official receipts.
- [ ] Serial range from `0000001`, quantity about 50,000. ATP fee about ₱500.
- [ ] Configure production env: `BIR_OR_SERIES_PREFIX=ONS`, plus START and END of the serial range.

How receipts work in the app: on escrow release we issue an official receipt (best-effort) with a sequential OR number. The PDF is stored to the BIR S3 bucket. VAT is 12%. Reconciliation check: VAT should equal sum(OR) x 12/112.

Admin Financials -> BIR Reports (super_admin):
- Monthly VAT (form 2550M): Generate, review, then Finalize.
- Quarterly 2307 withholding batches: Generate and view the per-provider list.
- PDF downloads available.

Provider withholding: once a provider's year-to-date platform income crosses ₱500,000, we withhold 1% (RR 16-2023) and issue Form 2307 to that provider.

Records retention: BIR-required financial records (official receipts) are kept 10 years. The S3 bucket `onservice-bir-receipts-prod` uses Object Lock with a 10-year default retention (launch-cutover Item 8), so receipts cannot be deleted or altered, even by us. This also means a customer "delete my account" request removes personal identifiers but keeps the financial receipts (see section 8).

> PROFESSIONAL (accountant): BIR registration, RDO, books of account, ATP filing, VAT returns, and the 2307 mechanics must be set up and reviewed by a PH accountant. The app generates the numbers; the accountant owns filing and correctness.

---

## 8. NPC / Data Privacy Act obligations

We hold customer phone numbers, addresses, payment records, and provider KYC (government ID, NBI clearance, selfie). RA 10173 applies.

Key roles and contacts:
- DPO (Data Protection Officer) is a real, separate admin role (`dpo`), not just a super-admin. NPC requires the DPO to have independent authority.
- DPO contact shown in-app: `dpo@onservice.ph`. Privacy contact on the public policy: `privacy@onservice.ph`.

> DECIDE: the public privacy policy and in-app screens still use placeholder entity name "onService PH" and `privacy@onservice.ph`. Once NPC registration is done, Ken must replace these with the exact registered business name/owner and the real DPO name and email (`docs/LEGAL-REVIEW-2026-06-05.md`).

Launch-cutover Item 1 (NPC DPO registration, Ken or fractional DPO, allow 14 to 30 business days):
- [ ] Compile PIC details: company name, TIN, address, owner.
- [ ] DPO details (recommended `dpo@onservice.ph`).
- [ ] Data categories handled.
- [ ] Public privacy-policy URL (live at `https://app.onservice.ph/privacy`).
- [ ] Submit at privacy.gov.ph/dpo-registration. Record the registration number in `LAUNCH-LIMITATIONS.md §26`.
- Risk if skipped: regulatory action, up to ₱5M penalty per breach.

### 8.1 Data-subject requests (DSRs)

Customers submit DSRs in-app (Download My Data, Correct My Info, Delete My Account). SLA shown to the user is 15 days. There is also a parallel "Account & Data" self-service export/delete flow with a 30-day cooling-off on deletion.

DSR handling (admin Compliance -> NPC Compliance, or Data Protection Log; DPO/super_admin):
1. Watch the DSR queue. The Dashboard flags overdue and near-due DSRs.
2. Open the request, set status to in_progress.
3. For an access/export request: attach the response payload URL on complete.
4. For a correction: make the change, note it, complete.
5. For an erasure: confirm active bookings are closed and wallet is zero, then complete. Personal identifiers are removed; BIR receipts (10-year retention) survive.
6. To reject: provide a reason (20+ chars, super_admin).
7. To escalate to NPC: record the NPC reference (super_admin).

Starting SLA targets to tune: acknowledge a DSR within 2 business days, resolve within the 15-day legal window with several days of buffer.

### 8.2 Breach response

> PROFESSIONAL (legal + DPO): NPC requires breach notification within 72 hours of knowledge of a notifiable breach. Have the DPO and a PH lawyer confirm the threshold and the exact NPC filing path before an incident, not during one.

Starting breach runbook (tune with the DPO):
1. Contain. Rotate keys, revoke sessions, isolate the affected system.
2. Assess scope. What data, how many subjects, sensitive or not.
3. Notify the DPO immediately. The DPO owns the NPC decision.
4. If notifiable, file with NPC within 72 hours and notify affected data subjects.
5. Log the incident, root cause, and fix. See `09-trust-safety-and-disputes.md` for incident handling.

Consent versions: when the DPO publishes a new material consent version (admin Consent Versions page), affected users re-grant inline at next use.

---

## 9. Month-end finance checklist

Run this in the first 3 business days of each month for the prior month. Owner: Ken or finance lead; super_admin actions noted.

- [ ] Run PayMongo reconciliation (admin Financials -> Reconciliation). Acknowledge or explain every discrepancy.
- [ ] Review escrow aging buckets (Financials -> Escrow). Investigate anything stuck in 48h+ or 168h+. These are usually suspended-provider holds or failed releases.
- [ ] Clear the `gateway_retry_queue` backlog (failed refunds/releases). Confirm none are silently stuck.
- [ ] Review failed payouts (Financials -> Payouts). Re-issue or refund as needed.
- [ ] Generate and Finalize the monthly VAT 2550M report (super_admin). Hand to accountant.
- [ ] Generate the quarterly 2307 withholding batch when the quarter closes; verify per-provider amounts.
- [ ] Confirm VAT reconciliation: sum(OR) x 12/112 matches the VAT report.
- [ ] Check the guarantee fund balance and runway (Financials -> Guarantee Fund). If the replenishment warning is on, escalate to Ken.
- [ ] Confirm BIR receipt S3 bucket is writing (no gap in OR sequence).
- [ ] Review any AML-held payouts; clear or escalate.
- [ ] Confirm DSR queue is clear of overdue items.

---

## 10. Copy-paste templates

Payout completed (SMS / push):
```
onService: Your payout of PHP {{amount}} has been sent to {{method}} ({{account}}). It may take up to 3 business days to reflect. Salamat!
```

Refund processed (SMS / push):
```
onService: Your refund of PHP {{amount}} for booking {{bookingId}} has been processed. It will return to your original payment method within a few business days.
```

DSR acknowledgement (email reply, support handles manually):
```
Subject: Your data request (Ref {{ref}})
Hi {{name}},
We received your request to {{access/correct/delete}} your data on {{date}}.
Under the Data Privacy Act we will respond by {{dueDate}} (15 days).
If we need anything from you to verify your identity, we will reach out.
- onService Data Protection
dpo@onservice.ph
```

AML hold notice (internal, ops to super_admin):
```
Payout {{payoutId}} for provider {{providerName}} is PHP {{amount}}, at/above the AML threshold. Held as aml_review_pending. Needs super_admin AML clearance before processing.
```

---

## 11. Quick reference

| Knob | Default | Where to change |
|---|---|---|
| Commission (per tier) | 10/15/13/11/9% | Settings -> Commissions |
| Service fee | 10%, ₱25 min, ₱500 max | Settings -> Fees |
| Guarantee fund rate | 1.5% | Settings -> Fees |
| VAT | 12% | Settings -> Fees |
| Auto-confirm window | 24h | Settings -> Escrow |
| Dispute window | 48h | Settings -> Escrow |
| Min withdrawal | ₱100 | platform config |
| AML payout threshold | ₱500,000 | Settings |
| Min payment | ₱100 | platform config |

All money is in centavos in the database; the admin and apps display pesos. Every privileged money action (escrow release, refund, payout approve, wallet adjust, BIR finalize, reconciliation run, settings edit) is super_admin only and writes an audit row with a typed reason.
