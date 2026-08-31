# PHILIPPINE COMPLIANCE CHECKLIST

> **PLANNING DRAFT, NOT CURRENT LEGAL OR TAX AUTHORITY (reviewed 2026-08-24).**
> This file contains historical estimates and legal/tax summaries that have not
> been approved for onService's actual entity or launch. Laws, forms, thresholds,
> deadlines, and agency processes can change. A Philippine lawyer, accountant,
> and privacy professional must verify every applicable item before it becomes
> an operating instruction. Current product/launch holds include E10/F#10, E14,
> E16, E22, and the compliance determination for large-payout review. Use
> `docs/runbooks/launch-cutover.md` and `docs/operations/10-money-and-compliance-ops.md`
> for current internal status, without treating either as professional advice.
> E40 additionally holds the final DSR-deadline wording and breach-notification
> classification workflow for Philippine privacy counsel.

Planning outline of what may be required, who may need to help, and what must be
confirmed for the real entity and each active service area.

---

## Initial regulatory-body map (not exhaustive)

1. **BIR** (Bureau of Internal Revenue) — taxes
2. **NPC** (National Privacy Commission) — data privacy (Data Privacy Act)
3. **DTI** (Department of Trade and Industry) — business registration if sole prop
4. **SEC** (Securities and Exchange Commission) — corp registration if corp/OPC
5. **LGU** (each city you operate in) — mayor's permit, sanitary, fire, barangay
6. **Insurance Commission** — if you sell insurance products (relevant for SiguradoShield Layer 2)

Plus:
- **PhilHealth, SSS, Pag-IBIG** if you employ staff
- **DOLE** for labor concerns if employing staff
- **NTC** if you do telecom (you don't)

---

## BIR (taxes) — where most platforms get this wrong

### Registration
1. Get a TIN (Tax Identification Number) for the business
2. Register the business at the RDO (Revenue District Office) covering your principal office
3. Register your books of accounts (or computerized accounting system)
4. Obtain the current authority/permit for the accountant-approved principal
   invoice route. Legacy Phase 08 OR numbering is not an approved series.
5. Have the accountant determine VAT/non-VAT registration and effective timing
   from the entity's expected and actual activity under current BIR rules. Do
   not assume a status from this planning draft.

### Ongoing obligations

No recurring form table is approved for onService yet. The previous table was
unsafe: it listed abolished monthly Form 2550M deadlines, treated quarterly
1601-EQ as monthly, and assumed individual-income-tax Forms 1701/1701Q without
an approved taxpayer profile. Current BIR material identifies Form 2550Q as
quarterly and 1601-EQ as quarterly, but applicability still depends on the
registered entity and transactions. The admin calendar therefore fails closed
under E22 until the accountant supplies a signed schedule.

Phase 08's 2307, monthly VAT, and OR-labelled records are retained internal
data, not proof that a return was filed or an invoice was legally issued.

### Withholding on providers (per RR 16-2023)

Phase 08 encodes a 1% withholding calculation above a ₱500,000 provider YTD
threshold as its interpretation of RR 16-2023. Generation is held under E22;
the accountant must confirm applicability, threshold treatment, tax base, and
certificate/filing mechanics before use.

**Important:** The mechanic of when exactly to withhold (cumulative threshold vs per-payment threshold) has nuances. The Phase 08 code computes it but Ken's accountant must verify before the first 2307 batch is filed.

### VAT mechanics

- The accountant must identify whose sale is being documented and which amount
  is onService's VAT base; do not assume the full marketplace service amount.
- Your input VAT is 12% of qualifying purchases (rent, supplies, professional fees) — credits against output
- Net VAT payable = output - input
- Phase 08 retains an internal monthly reconciliation workpaper. It is not a BIR return.

### Penalties for getting this wrong

Tax penalties and enforcement consequences can be financial and criminal. Do
not rely on historical amounts in a software repository; have Philippine tax
counsel/accounting identify the current exposure for the actual entity and issue.

**Do not skip BIR. Hire an accountant.**

---

## NPC (data privacy) — Data Privacy Act of 2012 + 2024 amendments

### Registration
- Designate a Data Protection Officer (DPO) — can be Ken at start, must be a real role
- Register the DPO with NPC within 30 days of operations
- Register data processing systems (the platform itself counts as a system)

### What you must implement
- Privacy notice (visible in app, mobile, admin) — Phase 09 builds the consent screen
- Granular consent for: data collection, marketing, biometric (face capture for selfie verification)
- Data subject rights — Phase 11 implements DSR queue: access, erasure, correction, portability, objection
- A documented DSR workflow. The current product stores a 15-day internal
  response target; E40 prohibits describing it as an NPC-mandated completion
  SLA until counsel approves the operative wording.
- A breach-assessment workflow that distinguishes suspected incidents from a
  DPO determination that notification is required. E40 holds the final
  classification fields, trigger, deadline wording, and filing workflow.
- Reasonable security measures (encryption at rest, access logs, incident response)

### Penalties
- Fines: ₱500,000 - ₱5,000,000 per violation
- Criminal liability: 1-7 years imprisonment for unauthorized processing
- Reputational damage if a breach goes public

### What your code must do
- Don't log raw PII (phone numbers, OTPs, government ID numbers) — Phase 12 SEC-005
- Encrypt government ID images at rest (S3 SSE) — Phase 12 SEC-004
- Attributable evidence for sensitive PII access (who, whose record, when, and why). Selected DPO searches and decisions are recorded today, but E37 confirms the audit workspace is not yet a complete PII-access trail.
- DSR fulfillment automation — Phase 11

---

## DTI / SEC (business registration)

### Sole proprietorship (DTI)
- Cheap, fast, ~₱500 + city permits
- No personal liability protection
- Tax: business income on Ken's personal 1701
- Recommended only for the very first weeks while testing

### One Person Corporation (OPC) — strongly recommended for onService PH
- ~₱5,000-15,000 to set up via SEC
- Personal liability protection (separate legal entity)
- Tax: corporate income tax (20-25%, lower for small corps)
- Foreign ownership: OPC requires Filipino citizenship for the single owner (this is a **problem** for Ken — see Anti-Dummy below)

### Domestic Corporation (Corp)
- Multiple shareholders (minimum 2, max 15 historically; recent SEC rules eased this)
- Foreign ownership allowed for home services (no nationality restriction in negative list)
- Tax: corporate income tax
- More setup overhead

### What Ken should likely do
Since home services is **not on the foreign investment negative list**, a Domestic Corporation with Ken as foreign shareholder is fully legal. He may need:
- Minimum capitalization: ₱5,000 if domestic market only (under FIA rules), ₱25M if export-oriented
- Filipino board directors: not required for fully foreign-owned
- BOI registration for tax incentives if applicable (usually not for services)

**Strongly recommend: hire a Philippine corporate lawyer to advise on Ken's specific structure.** The Anti-Dummy Law (CA 108) makes nominee structures (using a Filipino as a "front") criminal. Don't go that route — proper foreign ownership in a domestic corporation is legal and clean.

### SEC Beneficial Ownership Rules (effective 2026)
SEC requires disclosure of all beneficial owners (>25% direct or indirect ownership). If Ken uses any nominee or layered structure, BO disclosure forces transparency. Use a clean structure from day one.

---

## LGU (city) permits — per city you operate in

The platform is city-agnostic and the default first market is Metro Cebu. Have
local counsel/accounting confirm whether the business needs a permit in each
service area, only where it maintains an office, or under another current LGU
rule. Configure cities in admin only after the corresponding launch-cutover
sign-off. Typical documents may include a mayor's/business permit, barangay
clearance, fire/sanitary requirements, and business-registration evidence, but
the exact list and renewal cycle come from the relevant LGU, not this file.

---

## Insurance Commission

onService must not offer, market, or imply an insurance or guaranteed-protection
product unless Philippine counsel has classified the exact product and the
Insurance Commission/licensed partner requirements are satisfied. The earlier
claim that a self-funded guarantee is categorically not insurance is not an
approved legal conclusion. E10/F#10 keeps final protection/disclaimer wording on
hold; no Igloo or other insurance-partner agreement is currently evidenced.

---

## Anti-Dummy Law (CA 108)

If Ken is a foreigner (US citizen, etc.) and the business holds title in a Filipino's name as a "front" while Ken really owns it, that's criminal under Anti-Dummy Law. Penalties: ₱5,000-₱15,000 fine + 5-15 years prison.

**The clean way** for Ken:
1. Foreign shareholder in a domestic corporation — legal, transparent, no problem
2. Real Filipino co-founder with real equity and decision-making rights — legal
3. Solo if Ken has dual citizenship or uses an OPC (only if Ken is a Filipino citizen)

**Get a Philippine corporate lawyer to confirm Ken's specific structure.**

---

## Operational compliance

### Customer terms of service
- Drafted version exists (Phase 09 builds the consent screen)
- Reviewed by lawyer recommended
- Versioned (NPC requires re-acceptance on material change)

### Provider agreements
- Independent contractor agreement (NOT employee — DOLE penalties if misclassified)
- Cleaning agreement with each provider, signed at onboarding
- Stored in audit log

### Provider tax responsibilities
- Each provider responsible for their own taxes
- Platform issues 2307 for withholding compliance
- Platform is NOT the employer

### Employee compliance (if you hire staff in a Philippine office)
- SSS, PhilHealth, Pag-IBIG contributions — split with employee
- 13th month pay (mandatory)
- DOLE registration
- Workers compensation insurance

---

## The "before you launch" checklist

Mark each as Done / In Progress / Not Started:

- [ ] Business entity registered (DTI or SEC)
- [ ] BIR registered, RDO assigned, books registered, and the approved principal-invoice authority issued
- [ ] DPO designated and registered with NPC
- [ ] Privacy notice published in app
- [ ] Customer ToS finalized and lawyer-reviewed
- [ ] Provider IC agreement finalized and lawyer-reviewed
- [ ] Mayor's permit + barangay clearance for HQ city
- [ ] Mayor's permit + barangay clearance for any other operating city
- [ ] Bank account opened (corporate account)
- [ ] PayMongo merchant account approved
- [ ] Counsel confirms whether any protection product is offered and, if so,
      the required Insurance Commission/licensed-partner structure is complete
- [ ] First 2307 batch reviewed by accountant before filing
- [ ] First VAT return reviewed by accountant before filing
- [ ] First 90-day operations review with lawyer (compliance posture)

---

## Historical illustrative costs (not a current quote or launch budget)

| Category | One-time | Monthly | 6-month total |
|---|---|---|---|
| SEC corp registration | ₱15,000 | — | ₱15,000 |
| BIR registration + books | ₱5,000 | — | ₱5,000 |
| DPO / privacy registration | ₱5,000 | — | ₱5,000 |
| Lawyer retainer | — | ₱20-40K | ₱120-240K |
| Accountant (monthly bookkeeping + filings) | — | ₱15-30K | ₱90-180K |
| LGU permits (2 cities) | ₱25,000 | — | ₱25,000 |
| **Total compliance setup + 6 mo** | | | **~₱260-470K** |

Obtain current written quotes and a professional compliance schedule for the
actual entity and launch market. Do not budget or file from these historical
figures alone.
