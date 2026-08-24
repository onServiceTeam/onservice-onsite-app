# INSURANCE & TRUST — SiguradoShield™

> **PHASE 14 D04 STATUS — 2026-04-30 (Ken decision, Option A pull):**
> SiguradoShield as a customer-facing insurance product has been **pulled
> from v1.0 scope**. The 3-layer architecture described below is the
> v1.1+ roadmap, not v1.0 reality. v1.0 ships with verifiable trust
> claims only (NBI clearance, escrow payment, real-time tracking, masked
> phone numbers, 48-hour dispute window). No platform-provided insurance.
>
> See `LAUNCH-LIMITATIONS.md §23` and
> `.ai-coder/decisions/D04-siguradoshield.md` for the rationale and
> v1.1+ paths (Insurance Commission license + underwriter capital, OR
> licensed-insurer partnership with rep-agent terms).
>
> The strategic narrative below remains as the v1.1+ design reference.
> Read it as "what we will build when the regulatory and underwriting
> prerequisites are in place," not "what onService PH offers today."
>
> **CURRENT E10/F#10 HOLD (2026-08-24):** even the Layer 1 service-guarantee
> classification, contribution narrative, cap, eligibility, and customer
> wording require Philippine counsel. The current zero customer service fee
> also makes the fee-derived contribution zero. Nothing below is approved
> marketing copy, a live benefit, or a legal conclusion.

---

Historical three-layer concept. No layer is authorized as a customer-facing
insurance/guarantee benefit until its legal, underwriting, funding, and
operational prerequisites are approved.

---

## Why this matters

In the Philippines, the dominant home-services competitor is the Facebook-group informal economy. People don't choose your platform because of feature count — they choose it because they trust it more than asking the FB group. Trust signals (insurance, NBI verification, photo evidence, dispute resolution) are your moat.

Your messaging is straight: "Every booking is protected by SiguradoShield. If anything goes wrong, we make it right within 48 hours."

---

## Layer 1 — Platform Guarantee Fund (self-funded, ships with launch)

**What it is:** A reserve account funded by 1.5% of every service fee. Used to pay out claims when a provider damages property, fails to complete work, or is fraudulent.

**Coverage limits per claim:**
- Property damage: up to ₱25,000
- Incomplete work refund: up to ₱25,000
- Theft: up to ₱25,000 (with police report required)

**How claims work:**
1. Customer files dispute within 48h of completion (the dispute window in code)
2. Admin reviews evidence (Phase 07 dispute detail UI)
3. If valid claim and within Layer 1 limits, fund pays customer immediately
4. Platform recovers from provider's wallet, then future payouts, then suspends

**Already in code:**
- `guarantee_fund` wallet type exists
- Service fee collected at booking
- Allocation rate (1.5%) configurable in `platform_settings` (Phase 03)
- Recovery flow in dispute service (verify in Phase 07 audit)

**Admin visibility:**
- Phase 04 dashboard wallet card shows guarantee fund balance + months runway
- Alert if runway < 3 months (replenish from platform revenue)

**Customer-facing:**
- Phase 09 builds the SiguradoShield trust screen
- Visible at checkout: "This booking is protected"
- Dispute flow surfaces "We've got you covered"

---

## Layer 2 — Per-Job Optional Coverage (partner: Igloo + Malayan)

**What it is:** Customer can opt in at checkout for ~₱25-50 extra. Coverage up to ₱250,000 per claim, underwritten by Malayan Insurance, distributed by Igloo.

**Status:** NOT YET WIRED. Requires:
- Partnership agreement with Igloo
- API integration (their embedded insurance API)
- Underwriting approval from Malayan
- Insurance Commission compliance review

**Estimated timeline:** 6-8 weeks of operational + 2-3 weeks of dev work after partnership signed.

**Why it's worth the work:**
- Differentiated trust signal vs every other PH platform
- Revenue share with Igloo on premium
- Higher-value bookings (renovations, major repairs) become viable on-platform
- Pricing power on premium services

**Igloo background:**
- Founded 2016, Singapore-based, operations in PH
- Embedded insurance API for marketplaces
- Partner with Malayan Insurance (large PH insurer)
- Already serving Lazada, Foodpanda, others in PH

**Alternative partners** if Igloo doesn't work:
- Singlife Philippines (via Xendit integration)
- Etiqa Philippines
- AXA Philippines
- FWD
- Pacific Cross

**Recommendation:** Start the Igloo conversation in month 2-3 of operations. Don't gate launch on it.

---

## Layer 3 — Provider Liability Insurance (tiered requirement)

**What it is:** Each provider carries their own general liability insurance, scaled to their tier.

**Tiers:**

| Tier | Liability requirement | Typical premium |
|---|---|---|
| Founding | Optional | n/a |
| New | Optional | n/a |
| Verified | ₱500K-1M coverage | ₱500-1,500/year |
| Pro | ₱1M-3M coverage | ₱1,500-4,000/year |
| Elite | ₱3M+ coverage | ₱4,000-10,000/year |

**Provider cost, not platform cost.** Platform helps provider source via partner program with Singlife or similar.

**Why tiered:**
- Doesn't price-out new providers (no upfront insurance cost to start)
- Pros and Elites doing high-value work (renovations, electrical) carry their own coverage proportional to risk
- Provider has skin in the game (financial responsibility)

**Implementation:**
- Provider profile field for "liability insurance policy number" + expiry
- Verified+ providers can't accept high-value (>₱25K) jobs without active policy on file
- Auto-prompt 30 days before expiry (NBI tracking pattern)

**Status in codebase:** Schema not yet added. Migration in Phase 11 should add `provider_liability_insurance` table.

---

## How the layers stack on a real claim

Example: Cleaner accidentally breaks a ₱40,000 vase during cleaning.

1. Customer files dispute with photos, timestamp, vase receipt
2. Admin reviews evidence (Phase 07)
3. Admin determines valid claim, awards ₱40,000 refund/replacement
4. **Layer 1 fund pays ₱25,000** (its limit)
5. **Layer 2 (if customer opted in) covers the next ₱15,000** — total ₱40,000 to customer
6. Platform recovers from provider's wallet (current balance + future payouts) up to ₱25,000 (Layer 1 reimbursement)
7. **Layer 3 (provider's liability insurance) covers the ₱15,000 reimbursement** to Layer 2 partner
8. If provider has no Layer 3 OR insurance denies, provider account is suspended pending repayment
9. Repeat offenders are terminated and reported to NBI database

**The customer is made whole within 48 hours regardless of how long Layer 2/3 recovery takes.** That's the SiguradoShield promise.

---

## Technical implementation status

| Layer | Schema | Backend | UI | Partner |
|---|---|---|---|---|
| Layer 1 (Guarantee Fund) | ✅ exists | ✅ exists | Phase 04 dashboard, Phase 09 trust screen | n/a (self-funded) |
| Layer 2 (Igloo) | Phase 11 migration | Phase 11 service | Phase 09 checkout opt-in | NOT YET WIRED |
| Layer 3 (Provider liability) | Phase 11 migration | Phase 11 service | Phase 05 provider 360 | Singlife or partner |

---

## Customer-facing communication

The `customer/safety.tsx` screen (Phase 09 makes it complete) tells the story:

```
SiguradoShield™ — Tatlong Layers ng Proteksyon

Layer 1: Platform Guarantee
Every onService booking is backed by our ₱25,000 platform guarantee.
If your provider damages your property, fails to complete the work, or
takes anything that isn't theirs, we cover you — no questions, no
forms beyond a basic incident report.

Layer 2: Optional Premium Protection (₱25-50)
Add premium coverage at checkout for up to ₱250,000 — backed by
Malayan Insurance and distributed by Igloo. Recommended for renovations,
major repairs, or any job over ₱5,000.

Layer 3: Verified Pro Insurance
All Pro and Elite providers carry their own ₱1M+ liability insurance.
Look for the verified pro badge.

Mga karapatan mo:
✓ File a claim within 48 hours of service completion
✓ Get a decision within 24 hours
✓ Receive payment within 48 hours of approved claim
✓ Walk away with peace of mind
```

(The ✓ here are content characters, allowed per constitution.)

---

## What can go wrong (and what to do)

**Risk:** Guarantee Fund runs dry due to a wave of claims.
**Mitigation:** Replenishment alert at <3 months runway. Auto-pause new bookings if fund drops below ₱100K reserve. Top up from platform revenue.

**Risk:** Igloo partnership delayed or falls through.
**Mitigation:** Launch with Layer 1 only. Layer 2 is upside, not blocker. Ship without it.

**Risk:** Provider has no Layer 3 insurance and platform is on the hook for big claim.
**Mitigation:** Tier system gates access to high-value jobs. Auto-suspend providers who let insurance lapse for Verified+ tier. Monthly audit of insurance compliance.

**Risk:** Insurance Commission objects to "SiguradoShield" branding.
**Mitigation:** Layer 1 is a service guarantee, not insurance — legal under PH consumer protection law. If IC questions, rename Layer 1 to "Service Guarantee" and reserve "SiguradoShield" for the Layer 2+3 stack with insurance partner co-branding.

**Risk:** Fraudulent claims (customers gaming the system).
**Mitigation:** Pattern detection (Phase 06 customer 360 already shows "5 disputes in 30 days" warning). Flagged customers go to manual review. Repeated bad-faith disputes → account suspension.
