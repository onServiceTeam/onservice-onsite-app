# Legal review & drafting (2026-06-05)

Ken asked for "whatever a lawyer would do" on the legal writings. This is what
was reviewed and rewritten. **Honest caveat up front:** I am not a licensed
attorney. These documents are now complete, internally consistent, and grounded
in the relevant Philippine statutes — they are real, usable legal text, not
placeholders. A one-time review by a PH business attorney is still worth doing as
belt-and-suspenders before scaling, but the app is no longer shipping thin or
placeholder legal copy.

## What changed

### 1. Customer Terms of Service — `apps/mobile/app/customer/terms.tsx`
Expanded from 8 thin sections to a complete 20-section agreement:
acceptance/eligibility (18+, e-contract under RA 8792), marketplace-only status
+ independent-contractor relationship, accounts, cancellation (live policy),
bookings/pricing/fees (VAT, BIR receipts), escrow, dispute resolution, **§8
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

### 4. The "no insurance" disclaimer (Audit Finding #10) — finalized
Previously interim placeholder-grade text. Now finalized in all three surfaces
(Terms §8, `help.tsx` FAQ, `safety-and-support.tsx` Q&A), covering the four
required points: marketplace-not-insurer status; the explicit list of platform
protections; independent-contractor liability + the dispute path; and the
recommendation that customers keep their own homeowner's/renter's insurance for
losses beyond escrow. The CI guard (`no-todo-placeholders.test.ts`) still blocks
any return of the placeholder.

## Statutes the text is grounded in
- **RA 10173** — Data Privacy Act (privacy policy, data-subject rights, breach).
- **RA 7394** — Consumer Act (non-waivable consumer rights preserved).
- **RA 8792** — E-Commerce Act (electronic contracts enforceable).
- **Civil Code** — independent-contractor relationship, obligations, indemnity.
- **BIR** rules — VAT, official receipts, 10-year financial-record retention.

## The two things that still need a human (small)
1. **Entity & DPO details.** The Terms/Privacy use `ENTITY = 'onService PH'` and
   `privacy@onservice.ph`. Drop in the exact registered business name, owner, and
   the real DPO name/email once the NPC registration (cutover Item 1) is done.
2. **Optional attorney pass.** Everything is complete and usable. If you want a
   licensed PH attorney to do a final read for jurisdiction-specific nuances
   (~₱5–15K, as the original plan noted), that's a sensible belt-and-suspenders
   step — but it is no longer blocking, and the app is not shipping placeholder
   legal copy.

All changes typecheck and pass the legal-screen tests (customer-terms,
provider-onboarding-terms, no-todo-placeholders, no-siguradoshield).
