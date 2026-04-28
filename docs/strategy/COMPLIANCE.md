# PHILIPPINE COMPLIANCE CHECKLIST

What you must do, who you must hire, and what's at stake. **This document is informational. Have a Philippine accountant and lawyer review the actual setup before relying on it.**

---

## The 6 regulatory bodies you deal with

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
4. Get authority to print receipts (sequential OR numbering — Phase 08 implements this)
5. Register VAT if your gross sales will exceed ₱3M/year (you will — register from day one as VAT-registered)

### Ongoing obligations

| Form | Frequency | Description | Due |
|---|---|---|---|
| 2550M | Monthly | VAT return | 20th of following month |
| 1601-EQ | Monthly | Expanded withholding (withheld from providers) | 10th of following month |
| 1701Q | Quarterly | Income tax return for sole prop / OPC | 60 days after quarter end |
| 1701 | Annually | Annual income tax return | April 15 |
| 1604-E | Annually | Alphalist of withholding | January 31 |
| 2307 | Quarterly | Certificate of withholding to each provider | At quarter end |

The platform automation (Phase 08) generates 2307s, 2550M, and OR records. Annual filings need an accountant.

### Withholding on providers (per RR 16-2023)

You withhold 1% of gross income from each provider once their YTD income from your platform crosses ₱500,000. The withheld amount goes to BIR; you issue Form 2307 to the provider showing the withholding.

**Important:** The mechanic of when exactly to withhold (cumulative threshold vs per-payment threshold) has nuances. The Phase 08 code computes it but Ken's accountant must verify before the first 2307 batch is filed.

### VAT mechanics

- Your output VAT is 12% of gross sales (the customer pays this; you remit it to BIR monthly)
- Your input VAT is 12% of qualifying purchases (rent, supplies, professional fees) — credits against output
- Net VAT payable = output - input
- Phase 08 generates the monthly VAT report

### Penalties for getting this wrong
- Late filing: ₱1,000-25,000 surcharge per form
- Underpayment: 25% surcharge + 12% interest annually
- Failure to register: ₱20,000 + criminal liability (in extreme cases)
- Fake or missing receipts: criminal, ₱100K-500K fine + jail

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
- 15-day SLA for DSR response
- Breach notification (72 hours to NPC if breach)
- Reasonable security measures (encryption at rest, access logs, incident response)

### Penalties
- Fines: ₱500,000 - ₱5,000,000 per violation
- Criminal liability: 1-7 years imprisonment for unauthorized processing
- Reputational damage if a breach goes public

### What your code must do
- Don't log raw PII (phone numbers, OTPs, government ID numbers) — Phase 12 SEC-005
- Encrypt government ID images at rest (S3 SSE) — Phase 12 SEC-004
- Audit trail for every PII access (who looked at whose data, when, why) — already in audit log
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

### Boracay (Malay, Aklan)
- Mayor's Permit (Brgy. Manoc-Manoc or wherever office is)
- Brgy. clearance
- Sanitary permit
- Fire safety inspection
- Tourism office compliance (Boracay-specific)
- **Annual renewal**

### Kalibo (Aklan, planned m6)
- Mayor's Permit (Kalibo City Hall)
- Brgy. clearance (wherever office is in Kalibo proper, Numancia, or Banga)
- Sanitary, Fire, BIR clearance
- Annual renewal

### Iloilo City (planned m12)
- Mayor's Permit (Iloilo City Hall)
- Brgy. clearance
- Sanitary, Fire, BIR clearance
- Annual renewal — Iloilo has stricter inspections than provincial cities

Each city: similar structure. Hire a local fixer/agent to handle paperwork — typically ₱5-10K per city per year for the agent + actual permit fees ₱5-15K depending on capitalization.

---

## Insurance Commission

If onService offers insurance products (SiguradoShield Layer 2 — per-job opt-in coverage), you may need an Insurance Brokerage license OR you partner with a licensed broker (Igloo, etc.) and they handle the licensing.

**Recommendation:** Partner with Igloo who has the broker license, integrate via API. You don't need your own IC license.

The Layer 1 self-funded guarantee fund is NOT insurance under PH law — it's a service guarantee. No IC license needed.

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

### Employee compliance (if you hire staff in Boracay HQ)
- SSS, PhilHealth, Pag-IBIG contributions — split with employee
- 13th month pay (mandatory)
- DOLE registration
- Workers compensation insurance

---

## The "before you launch" checklist

Mark each as Done / In Progress / Not Started:

- [ ] Business entity registered (DTI or SEC)
- [ ] BIR registered, RDO assigned, books registered, OR authority issued
- [ ] DPO designated and registered with NPC
- [ ] Privacy notice published in app
- [ ] Customer ToS finalized and lawyer-reviewed
- [ ] Provider IC agreement finalized and lawyer-reviewed
- [ ] Mayor's permit + barangay clearance for HQ city
- [ ] Mayor's permit + barangay clearance for any other operating city
- [ ] Bank account opened (corporate account)
- [ ] PayMongo merchant account approved
- [ ] Igloo/insurance partner agreement signed (if using Layer 2)
- [ ] First 2307 batch reviewed by accountant before filing
- [ ] First VAT return reviewed by accountant before filing
- [ ] First 90-day operations review with lawyer (compliance posture)

---

## Costs (realistic, 6-month launch budget)

| Category | One-time | Monthly | 6-month total |
|---|---|---|---|
| SEC corp registration | ₱15,000 | — | ₱15,000 |
| BIR registration + books | ₱5,000 | — | ₱5,000 |
| DPO / privacy registration | ₱5,000 | — | ₱5,000 |
| Lawyer retainer | — | ₱20-40K | ₱120-240K |
| Accountant (monthly bookkeeping + filings) | — | ₱15-30K | ₱90-180K |
| LGU permits (2 cities) | ₱25,000 | — | ₱25,000 |
| **Total compliance setup + 6 mo** | | | **~₱260-470K** |

Don't skimp on lawyer + accountant. The cost of getting BIR or NPC wrong is multiples of these annual fees.
