# Money and Compliance Operations

Purpose: how money moves through onService (escrow, commissions, payouts, refunds), the intended PayMongo operation and current E14 launch block, and what BIR and NPC require of us day to day. This is the finance and compliance operating doc for the ops team.

Currency is Philippine pesos (₱). All amounts are stored in centavos in the database; the apps display pesos. Every cutoff time below is Asia/Manila.

Related docs: `09-trust-safety-and-disputes.md` (dispute decisions), `07-provider-support-sop.md` (payout questions), `11-admin-system-training-manual.md` (how to do each action in the admin app), `13-policies-codes-and-templates.md` (cancellation policy summary, templates).

---

## 1. The money model in one paragraph

The intended design is INSTANT-PAY: the customer pays first into escrow, then a provider is matched. The platform holds the money in a single escrow wallet, then releases it to the provider (minus our commission) once the customer confirms the job, or after auto-confirm. We never touch provider funds until the job is done. The internal booking, escrow, wallet-payment, and webhook state machine is implemented. The external hosted PayMongo authorization step for card, GCash, Maya, QR Ph, and wallet top-up is not launch-ready under E14.

> **Set (editable):** the E03 booking/escrow state-machine defect was fixed on 2026-06-19. Do not describe non-wallet PayMongo checkout as live until E14 is resolved with an approved integration and test-mode evidence. _Recommended default. To change it, edit here and anywhere this value is referenced._

E03 fixed the booking/escrow ordering in merged commit `865f55e`: a booking is created before payment and only verified payment can move it to paid/held. That does not prove the external customer authorization screen works. E14 records that the current API invents a hosted URL from a Payment Intent client key, the URL returns 404, and all 12 production top-up attempts inspected on 2026-08-24 remained `awaiting_payment`. See `.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md` for the state-machine history and `.ai-coder/escalations/E14-paymongo-hosted-checkout-flow-2026-08-24.md` for the active launch blocker.

---

## 2. Escrow lifecycle (hold to release)

There is one platform escrow wallet (type `platform_escrow`). Escrow money sits in its `pending_balance` until a job closes. Two sibling platform wallets exist: `platform_revenue` (our commission and service fee) and `guarantee_fund`.

Escrow states: `pending` -> `held` -> `released` (or `refunded` / `partially_refunded`).

| Step | What happens | Trigger |
|---|---|---|
| HOLD | Customer pays. Booking goes `paid`, escrow goes `held`. Money lands in the escrow wallet `pending_balance`. | PayMongo `payment.paid` webhook (card / GCash) or wallet debit (instant for wallet method) |
| RELEASE | Provider wallet gets `service_price - commission`; revenue wallet gets `commission + service_fee - guarantee`; guarantee fund gets 1.5% of the service fee under the current release formula. With the customer service fee currently set to zero, that fee-derived guarantee contribution is also zero. Escrow goes `released`, booking goes `payout_ready`. | Customer confirms the job, OR auto-confirm after 24h |
| REFUND | Internal held funds move according to the approved outcome. A verified historical external payment may also require a PayMongo refund; verify the gateway result before saying it was submitted or completed. Escrow goes `refunded` or `partially_refunded`. | Cancellation or dispute resolution |

Auto-confirm: a booking sitting in `completed_by_provider` for longer than 24h (`escrow_auto_confirm_hours`, admin-tunable) is auto-confirmed, escrow released, booking moved to `payout_ready`. The customer is notified. This currently conflicts with the 48-hour accepted dispute-filing window. E18 is an open money-path hard stop: do not infer that filing after release reverses the provider credit or safely re-holds booking funds.

Escrow release is refused (held for admin) when the provider was suspended mid-booking, when there is no provider on the booking, or when the amounts do not reconcile. That is by design. Resolve it in the admin Booking detail page, Money tab.

---

## 3. Commission per provider tier

Commission is taken off the service price. The provider receives `service_price - commission`. Rates are admin-tunable (admin Settings, Commissions category). These are the current defaults.

| Tier | Commission | Notes |
|---|---|---|
| `founding` | 10% | Invite-only launch batch. First 50 providers per city, 10% for 12 months. |
| `new` | 15% | Default on signup. |
| `verified` | 13% | 5+ jobs, 4.0+ rating. |
| `pro` | 11% | 25+ jobs, 4.5+ rating, no open disputes. |
| `elite` | 9% | 100+ jobs, 4.7+ rating, TESDA-certified, no open disputes. Lowest rate. |

Other fees on top of the service price:

- Service fee: currently 0% with a ₱0 floor (Ken, 2026-06-28; migration 137). New bookings therefore use `total_amount = service_price` unless another approved charge applies. The setting remains admin-tunable; re-enabling it changes customer totals and requires Ken's approval plus money-path testing.
- Guarantee-fund contribution: the release path calculates 1.5% of the service fee and carves it out of platform revenue. At the current zero customer service fee, that contribution is zero. Guarantee wording and claim terms remain subject to E10/F#10 and must not be invented from this accounting rule.
- VAT: 12%, used in internal invoice/tax workpapers, not deducted in the escrow split. E22 holds customer tax-document issuance until the principal-invoice design is approved.

The pricing preview and escrow release use different meanings for a field named
`platformRetains`, but the money-conservation tests show the live release path
balances and allocates 1.5% of the service fee. This naming difference is not a
known ledger mismatch. An accountant still must approve the accounting policy,
and E10/F#10 separately blocks customer-facing guarantee terms.

This affects revenue recognition, not customer-facing amounts.

---

## 4. Payouts to providers

Providers request payouts from their wallet available balance.

> **Set (editable):** payout processing target is 3 business days. _Recommended default. To change it, edit here and anywhere this value is referenced._

Methods and validation:

- GCash / Maya: 11-digit PH mobile, format `09XXXXXXXXX`.
- Bank InstaPay / Bank PESONet: 8 to 16 digit account number.

Rules:

- Minimum withdrawal ₱100.
- Provider must be in `approved` status.
- One payout in flight at a time (`aml_review_pending` / `pending` / `approved` / `processing`). The check is serialized per provider so two simultaneous requests cannot both reserve funds.

Current manual payout path: `pending` -> `approved` -> `completed`, or `rejected`. A large payout (₱500,000 or more, admin-tunable) starts at `aml_review_pending`; a super_admin records why the hold can be cleared before it becomes `pending`, or rejects it directly with a reason and returns the reservation. The legacy `processing` status remains readable and continues to count as in flight, but the launch admin flow does not automatically enter it.

The `aml_review_pending` state is an internal, conservative risk control. It does not determine that onService is a covered person, does not determine that a payout is legally reportable, and does not file a report. Philippine AMLA defines the general covered-transaction amount as **in excess of** ₱500,000 within one banking day for covered persons, while suspicious-transaction duties can apply regardless of amount. Confirm onService's covered-person status, aggregation/reporting obligations, and the production review procedure with Philippine counsel or a qualified AML compliance professional before live payout operations. Primary references: [RA 11521 (LawPhil)](https://lawphil.net/statutes/repacts/ra2021/ra_11521_2021.html) and the [AMLC covered-person guidance](https://www.amlc.gov.ph/covered-persons).

Admin actions (Payouts page, super_admin only):

1. Review the request, provider, amount, method, destination account, wallet reservation, and prior payout state.
2. If it is internally held, complete the review. Record either a clearance reason of at least 10 characters (moves it to pending without approving/sending) or a rejection reason (atomically returns the reserved amount).
3. Approve (reason 10+ chars) or Reject (reason 10+ chars; the transaction returns the full reserved amount to available balance or rolls back without changing either record).
4. After sending the money externally, mark Complete with a reason of at least 10 characters and optionally record the PayMongo transfer ID. Completion refuses to proceed if the payout is not approved or the wallet reservation is short.

> **Set (editable):** the actual external transfer (sending pesos to the provider's GCash or bank) is a manual step at launch; "Complete" in admin only records that it happened, it does not itself move money. Maintain a runbook naming who logs into PayMongo or the bank and sends each batch. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 5. Refunds and cancellations

Cancellation and dispute code can record an internal escrow outcome and, for a verified external PayMongo transaction, attempt a gateway refund. E14 blocks new hosted external authorization, so a redirect or `awaiting_payment` row is not refundable money. If a real gateway refund fails, it is queued in `gateway_retry_queue`; a queued row is evidence of an incomplete refund, not proof the customer was paid.

E18 and E24 are also active. A dispute filed after the current 24-hour release is not backed by re-held funds merely because booking state changes, and direct provider acceptance/partial offers/customer partial acceptance are disabled. Route those cases through super-admin review and do not move money around either hold.

> **Set (editable):** support quotes the LIVE refund money-path numbers, not the displayed policy, until the two systems are reconciled. _Recommended default. To change it, edit here and anywhere this value is referenced._

There are two cancellation systems and their numbers disagree. This is a known open issue (`.ai-coder/decisions/D02-cancellation-policy.md`) that needs a Ken decision to reconcile.

- The LIVE money path (what actually refunds) uses these brackets: over 24h = 100%, 2 to 24h = 100%, 1 to 2h = 90%, 30min to 1h = 80%, under 30min = 70%, provider already arrived = 50%, customer no-show = 0%.
- The DISPLAYED policy (customer-facing page and admin Cancellation Policy editor) shows different tiers: 24h+ = 100%, 4 to 24h = 75%, under 4h = 50%, after scheduled / no-show = 0%.

The customer sees the displayed policy but is refunded by the live brackets. Until reconciled, support uses the live brackets above when quoting an actual refund. See `13-policies-codes-and-templates.md`.

On a customer cancel (live path): the customer gets the bracket-% refund of the service price plus the full service fee back, unless they no-showed (then the platform keeps the service fee). Provider compensation on the booking is the inverse of the customer refund %.

Provider no-show (displayed-policy rule): the customer gets a 100% refund plus a platform-funded apology credit (default ₱200).

---

## 6. PayMongo operations and E14 launch block

PayMongo is the intended external payment provider. Configured method labels include GCash, Maya, card, QR Ph, and bank transfer; internal wallet skips PayMongo. Method configuration is not proof that the customer authorization flow works. E14 blocks launch use of the current external hosted checkout because the API constructs a URL PayMongo did not return.

Until E14 is resolved, do not tell a customer to retry the current hosted link with real money, do not treat a browser redirect as payment, and do not manually mark an `awaiting_payment` attempt paid. The selected replacement must be validated with protected PayMongo test keys and verified webhooks before live mode.

Going live (launch-cutover Item 7, Ken-owned):

- [ ] Submit KYC to PayMongo: SEC/DTI registration, Mayor's permit, BIR registration, beneficial-ownership docs.
- [ ] Set the settlement bank account (where our money lands).
- [ ] Budget standard fees into margins: 3.5% + ₱15 per transaction.
- [ ] Set the webhook to `https://api.onservice.ph/webhooks/paymongo`.
- [ ] Resolve E14 by approving Checkout Sessions or the client Payment Method flow, then implement return/cancel/pending states.
- [ ] Test success, cancel, abandonment, duplicate tap/webhook, webhook-before-return, return-before-webhook, app resume, and desktop browser return in sandbox.
- [ ] Switch to live mode only after test evidence and rotate keys to the live set (`pk_live_`, `sk_live_`, `whs_`).
- [ ] Confirm `PAYMONGO_WEBHOOK_SECRET` is the live webhook secret. A wrong or missing secret means webhooks fail (503/401) and paid bookings never flip to `paid`.

How a future external payment is allowed to complete: a valid PayMongo flow collects authorization, then PayMongo calls our webhook with a paid event. We verify the signature, check the amount matches (a mismatch is treated as tampering, the payment is not applied, and a security event is logged), then flip the booking to `paid` and escrow to `held`. The implemented webhook is idempotent and replay-protected, but the current hosted authorization entry remains invalid under E14.

Reconciliation (admin Financials -> Reconciliation, super_admin):

1. Run reconciliation (compares PayMongo balance vs our expected balance).
2. Review any discrepancy alerts.
3. Acknowledge each discrepancy with a note explaining the cause.

Run reconciliation at least weekly during launch, then settle into the month-end checklist (section 9).

---

## 7. BIR: registration, invoicing, and filing hold

**Compliance hold E22 is active.** The repository does not establish the
company's final taxpayer/entity profile, approved principal document, seller
and tax basis, authorized serial model, cancellation mechanism, or recurring
filing schedule. A Philippine accountant must approve those items before the
app may generate or finalize BIR-labelled documents.

Launch-cutover Item 2 (Ken / accountant):

- [ ] Provide the real entity registration, BIR certificate, books/CAS status,
      and marketplace money flow to the accountant.
- [ ] Approve in writing: VAT/non-VAT status, principal invoice type, seller
      and tax basis, ATP/CAS/e-invoicing route, required fields, authorized
      serial range/reset rules, cancellation/credit treatment, retention, and
      every applicable return/deadline.
- [ ] File the current authority/permit required for that approved route.
- [ ] Keep `BIR_DOCUMENT_ISSUANCE_ENABLED=0`. Closing E22 requires the approved
      tax design and a reviewed code change; an environment value alone cannot
      authorize issuance, and the server rejects deployed writes with 503.

The current `official_receipts` table and `OR-YYYY-MM-######` identifiers are
legacy accounting records. They are retained for audit history but are not
represented as authorized principal invoices. The former `BIR_OR_SERIES_*`
environment variables were never connected to runtime code and are removed.

Admin Financials -> Tax Workpapers (Held):

- Monthly VAT rows are internal reconciliation workpapers, not Form 2550M or
  another tax return. BIR stopped requiring monthly 2550M declarations for
  transactions beginning January 1, 2023; the accountant must approve the
  current 2550Q filing and tax basis.
- Retained 2307 batch data may be viewed, but generation remains held until the
  accountant approves the withholding interpretation and provider cases.
- Historical PDFs may be viewed as audit evidence but must not be presented as
  proof of BIR-authorized invoicing or filing.

Provider withholding: once a provider's year-to-date platform income crosses ₱500,000, we withhold 1% (RR 16-2023) and issue Form 2307 to that provider.

> **Set (editable):** collect a provider's TIN before their first payout (not required at application), and confirm it is on file before the provider's YTD platform income reaches ₱500,000 for BIR withholding. _Recommended default. To change it, edit here and anywhere this value is referenced._ See `05-provider-onboarding-sop.md`.

Records retention: preserve financial transaction evidence and legacy sales
documents while E22 is resolved. The final legal retention period, immutable
archive design, and permitted treatment during a data-erasure request must be
approved by the accountant/DPO and evidenced under launch-cutover Item 8. Do
not claim the currently proposed S3/Object-Lock design is active until its
verifier passes.

> **Set (editable):** BIR registration, RDO, books of account, ATP filing, VAT returns, and the 2307 mechanics are set up and reviewed by a PH accountant. The app generates the numbers; the accountant owns filing and correctness. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 8. NPC / Data Privacy Act obligations

We hold customer phone numbers, addresses, payment records, and provider KYC (government ID, NBI clearance, selfie). RA 10173 applies.

Key roles and contacts:

- DPO (Data Protection Officer) is a real, separate admin role (`dpo`), not just a super-admin. NPC requires the DPO to have independent authority.
- DPO contact shown in-app: `dpo@onservice.ph`. Privacy contact on the public policy: `privacy@onservice.ph`.

> **Set (editable):** the public privacy policy and in-app screens use the placeholder entity name "onService PH" and `privacy@onservice.ph`; once NPC registration is done, Ken replaces these with the exact registered business name/owner and the real DPO name and email. _Recommended default. To change it, edit here and anywhere this value is referenced._ See `docs/LEGAL-REVIEW-2026-06-05.md`.

Launch-cutover Item 1 (NPC DPO registration, Ken or fractional DPO, allow 14 to 30 business days):

- [ ] Compile PIC details: company name, TIN, address, owner.
- [ ] DPO details (recommended `dpo@onservice.ph`).
- [ ] Data categories handled.
- [ ] Public privacy-policy URL (live at `https://app.onservice.ph/privacy`).
- [ ] Submit at privacy.gov.ph/dpo-registration. Record the registration number in `LAUNCH-LIMITATIONS.md §26`.
- Risk if skipped: regulatory action, up to ₱5M penalty per breach.

### 8.1 Data-subject requests (DSRs)

Customers submit DSRs in-app (Download My Data, Correct My Info, Delete My Account). The SLA shown to the user is 15 days. There is also a parallel "Account & Data" self-service export/delete flow with a 30-day cooling-off on deletion.

DSR handling (admin Compliance -> NPC Compliance, or Data Protection Log; DPO/super_admin):

1. Watch the DSR queue. The Dashboard flags overdue and near-due DSRs.
2. Open the request, set status to `in_progress`.
3. For an access/export request: attach the response payload URL on complete.
4. For a correction: make the change, note it, complete.
5. For an erasure: confirm active bookings are closed and the wallet is zero, then complete. Personal identifiers are removed; BIR receipts (10-year retention) survive.
6. To reject: provide a reason (20+ chars, super_admin).
7. To escalate to NPC: record the NPC reference (super_admin).

> **Set (editable):** acknowledge a data-subject request within 2 business days and fulfil it within the NPC-required window (the 15-day legal window, with several days of buffer). _Recommended default. To change it, edit here and anywhere this value is referenced._

### 8.2 Breach response

> **Set (editable):** NPC requires breach notification within 72 hours of knowledge of a notifiable breach; have the DPO and a PH lawyer confirm the threshold and the exact NPC filing path before an incident, not during one. _Recommended default. To change it, edit here and anywhere this value is referenced._

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
- [ ] Export the prior month's internal VAT reconciliation workpaper for the
      accountant. Do not generate/finalize a BIR return in the app while E22 is open.
- [ ] When a quarter closes, have the accountant determine and file the current
      applicable VAT/withholding forms; retained 2307 generation remains held.
- [ ] Reconcile recorded sales, platform revenue, provider amounts, output VAT,
      input VAT, cancellations, and gateway settlement using the accountant-approved tax basis.
- [ ] Check the guarantee fund balance and runway (Financials -> Guarantee Fund). If the replenishment warning is on, escalate to Ken.
- [ ] Confirm financial evidence backups are current. Do not use legacy OR
      sequence continuity as proof of an authorized invoice series.
- [ ] Review any internally held payouts; clear, reject, or escalate with written evidence.
- [ ] Confirm the DSR queue is clear of overdue items.

---

## 10. Copy-paste templates

Payout completed (SMS / push):

```
onService: Your payout of PHP {{amount}} has been sent to {{method}} ({{account}}). It may take up to 3 business days to reflect. Salamat!
```

Refund processed (SMS / push):

```
onService: The approved refund for booking {{bookingId}} is PHP {{amount}}. Recorded destination: {{wallet_or_verified_original_method}}. Status: {{submitted_completed_or_failed}}. Reference: {{reference}}. We will update you when the recorded status changes.
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

Large-transaction hold notice (internal, ops to super_admin):

```
Payout {{payoutId}} for provider {{providerName}} is PHP {{amount}}, at/above the internal review threshold. Held as aml_review_pending. Needs super_admin compliance clearance before processing. This notice does not state that a legal report was filed or required.
```

---

## 11. Quick reference

| Knob | Default | Where to change |
|---|---|---|
| Commission (per tier) | 10 / 15 / 13 / 11 / 9% | Settings -> Commissions |
| Service fee | 0%, ₱0 min (migration 137) | Settings -> Fees; re-enable only with Ken approval |
| Guarantee fund rate | 1.5% of service fee; currently zero contribution while service fee is zero | Settings -> Fees |
| VAT | 12% | Settings -> Fees |
| Auto-confirm window | 24h | Settings -> Escrow |
| Dispute window | 48h | Settings -> Escrow |
| Min withdrawal | ₱100 | platform config |
| Internal large-payout review threshold | ₱500,000 | Settings |
| Min payment | ₱100 | platform config |

All money is in centavos in the database; the admin and apps display pesos. Every privileged money action (escrow release, refund, AML clearance, payout approve/reject/complete, wallet adjust, BIR finalize, reconciliation run, settings edit) is super_admin only and writes an audit row with a typed reason.

---

## Open decisions set in this doc

- The booking/escrow ordering from E03 is implemented, but external hosted PayMongo checkout/top-up is NOT launch-ready until E14 is resolved and proven with test-mode evidence. (editable)
- Guarantee-fund base on the live money path is 1.5% of the service fee; confirm the correct book base with the accountant. (editable)
- Payout processing target is 3 business days. (editable)
- External payout transfer is a manual step at launch; "Complete" only records it. (editable)
- Support quotes the LIVE refund money-path numbers until the two cancellation systems are reconciled. (editable)
- Collect provider TIN before first payout; confirm on file before ₱500,000 YTD. (editable)
- A PH accountant owns BIR filing and correctness; the app only generates the numbers. (editable)
- Replace placeholder entity name and `privacy@onservice.ph` once NPC registration is done. (editable)
- Acknowledge a DSR within 2 business days; fulfil within the NPC-required 15-day window. (editable)
- File a notifiable breach with NPC within 72 hours; DPO and PH lawyer confirm threshold and path in advance. (editable)
