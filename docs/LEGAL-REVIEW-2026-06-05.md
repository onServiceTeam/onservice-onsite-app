# Legal review & drafting (2026-06-05)

> **HISTORICAL DRAFTING RECORD, NOT ATTORNEY APPROVAL.** This file records the
> June 2026 internal drafting pass. Its earlier conclusion that the disclaimer
> was finalized and non-blocking was superseded by E10/F#10. Current launch
> authority requires attorney-reviewed final disclaimer/guarantee wording,
> exact registered-entity and DPO details, and reconciliation with the actual
> money and protection model. Do not cite this file as legal sign-off.

Ken asked for "whatever a lawyer would do" on the legal writings. This is what
was reviewed and rewritten. **Honest caveat up front:** I am not a licensed
attorney. The drafting pass expanded the documents, but completeness,
enforceability, current statutory accuracy, and consistency with the final
business model require Philippine counsel. Interim text must not be described as
attorney-approved or as a promised insurance/guarantee benefit.

## What changed

### 1. Customer Terms of Service — `apps/mobile/app/customer/terms.tsx`
Expanded from 8 thin sections to a complete 20-section agreement:
acceptance/eligibility (18+, e-contract under RA 8792), marketplace-only status
+ independent-contractor relationship, accounts, cancellation (live policy),
bookings/pricing/fees (the June draft's VAT/BIR receipt promise is now removed
under E22), escrow, dispute resolution, **§8
Platform Protections — No Insurance (finalized, see below)**, user conduct,
provider obligations, **disclaimer of warranties**, **limitation of liability**
(capped at service fees / escrow held), **indemnification**, intellectual
property, suspension/termination + survival, data privacy, **consumer rights
(RA 7394 non-waivable)**, changes to terms, **governing law & venue
(Philippines / Cebu City)**, and general/severability/entire-agreement.

### 2. Privacy Policy — same file, Privacy tab
Expanded from 6 to 10 sections to a proper RA 10173 notice: data controller +
DPO, what we collect, **legal basis for processing** (contract / legitimate
interest / legal obligation / consent), sharing, **sensitive identity documents**
(private, proxy-only — matches the §35a KYC work), **security + breach
notification**, retention (incl. BIR 10-year), **data-subject rights**, children
(18+), and NPC contact.

### 3. Provider Independent-Contractor Agreement — `apps/mobile/app/provider-onboarding/terms.tsx`
Expanded from 7 to 12 clauses, adding the ones a lawyer would insist on to
protect the platform and clarify the relationship: **taxes & the provider's own
insurance**, **liability & indemnification** (provider responsible for damage
they/their team cause), **compliance/licenses + no-circumvention**, **team-member
responsibility** (ties to the staff feature), and **data confidentiality (RA
10173)**, plus survival on termination.

### 4. The "no insurance" disclaimer (Audit Finding #10) — ATTORNEY HOLD
The June pass put interim marketplace/no-insurance wording on the customer
surfaces and added a CI guard against placeholder copy. E10/F#10 later confirmed
that the final disclaimer and any guarantee/protection language require
attorney review. The existing text is an interim risk-reduction measure, not a
final legal conclusion or authority to advertise a protection limit.

## Statutes the text is grounded in
- **RA 10173** — Data Privacy Act (privacy policy, data-subject rights, breach).
- **RA 7394** — Consumer Act (non-waivable consumer rights preserved).
- **RA 8792** — E-Commerce Act (electronic contracts enforceable).
- **Civil Code** — independent-contractor relationship, obligations, indemnity.
- **BIR** rules — VAT, principal-invoice/document requirements, numbering authority, and financial-record retention. The June draft's “official receipt” wording is superseded by E22 and requires accountant/counsel review against current BIR rules before issuance is enabled.

## Human work still required before launch
1. **Entity & DPO details.** The Terms/Privacy use `ENTITY = 'onService PH'` and
   `privacy@onservice.ph`. Drop in the exact registered business name, owner, and
   the real DPO name/email once the NPC registration (cutover Item 1) is done.
2. **Required attorney pass (E10/F#10).** Philippine counsel must approve the
   final disclaimer/guarantee language and check the Terms, Privacy Policy, and
   provider agreement against the registered entity, real payment flow,
   provider relationship, dispute process, data processing, and launch markets.
3. **Operational reconciliation.** After counsel supplies final text, update
   every duplicated app/help/support surface and keep the CI consistency guard.

The June changes passed the then-current legal-screen tests. Those tests prove
rendering and consistency only; they do not prove legal sufficiency.

On 2026-08-24, safe operational corrections removed promises that the app was
currently issuing authorized BIR Official Receipts or accepting external
PayMongo payments. The screen now states the E22/E14 holds and describes the
implemented deletion cooling-off/anonymization behavior without claiming
complete physical erasure. This was not attorney approval; E10/F#10, E21, and
E22 remain open.
