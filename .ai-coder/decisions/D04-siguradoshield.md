# D04 — SiguradoShield decision (pull vs wire)

**Status:** awaiting Ken's decision.
**Blocking:** all of Dispatch 04 implementation.
**Source spec:** `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-03-04.md` §"Dispatch 04 — SiguradoShield decision implementation".

---

## The question

The audit found six customer-facing surfaces that advertise "SiguradoShield™" insurance with specific peso-amount coverage figures (₱25,000 / ₱50,000 / ₱100,000). The Layer 2 claims service required to honor those claims **does not exist** — no claims pipeline, no insurance partner contract, no Insurance Commission registration.

This is false advertising under RA 7394 (Philippines Consumer Act of 1992) and creates Insurance Commission exposure (RA 11765).

For v1.0 launch, do we **pull** the advertising surfaces (Option A) or **wire** the claims service (Option B)?

---

## Affected surfaces (8 entries — 6 primary + 2 reinforced)

| Bug | File | Surface |
|---|---|---|
| 1168 | `apps/mobile/src/config/platform.config.ts:54-57` | Hardcoded peso-amount constants (root) |
| 860 | `apps/mobile/app/onboarding.tsx` | Slide 2 carousel |
| 889 | `apps/mobile/app/(tabs)/home.tsx` | Tappable banner |
| 920 | `apps/mobile/app/(tabs)/profile.tsx` | First menu item under Help & info |
| 538 | `apps/mobile/app/customer/safety.tsx` | Entire 382-line safety screen (epicenter) |
| 983 | `apps/mobile/app/customer/payment-methods.tsx:82-91` | Escrow info box |
| 686 | `apps/mobile/app/customer/help.tsx` | FAQ entry |
| 834 | misc (search via grep) | Section 6 reference |

Plus a server-side mirror in `packages/api/src/config/platform.config.ts` and `packages/api/src/services/settings.service.ts` (settings keys `max_property_damage_coverage` etc.) that also gets cleaned up under Option A.

---

## Option A — Pull for v1.0

Replace each surface with verifiable trust claims only:

- **NBI clearance** — every active provider has passed an NBI clearance check. Verifiable; the clearance database exists.
- **Escrow payment** — payments held until customer confirms the job. Verifiable; the escrow service exists and works.
- **Real-time tracking** — customer sees provider location en route. Verifiable; the maps integration works.
- **Masked phone numbers** — Twilio integration prevents real-number exposure. Verifiable; works.

**Removed from all 8 surfaces:**
- "SiguradoShield" trademark
- Peso-amount coverage figures (₱25,000 / ₱50,000 / ₱100,000)
- Words like "insurance," "claims," "deductible," "covered up to ₱X"
- Links to a claims service

The `customer/safety.tsx` screen is renamed to `safety-and-support.tsx`, restructured with sections "How we keep you safe," "If you need help" (911 + onService support hotline), and "Tips for safe bookings" (FAQs about disputes, no-shows, damage).

`LAUNCH-LIMITATIONS.md §19` documents the v1.1+ path: partner with a Philippine insurance underwriter, register with the Insurance Commission, build claims pipeline, restore branding.

### Estimated cost

- Engineering: this dispatch (D04) — 1–2 days of one AI coder. Mostly UI rewrites + tests.
- Risk to launch: zero. Dispatch is well-scoped.
- Risk to growth: provider acquisition may be slower; some providers were attracted by the implied insurance umbrella. The fix in D10 onboarding (per spec) explicitly tells providers they need their own personal liability insurance.

### Risk mitigation under Option A

- Insurance Commission of the Philippines doesn't proactively audit unregistered insurance products. The risk is a customer complaint citing "they advertised insurance and didn't honor a claim" → IC inquiry.
- After D04, no such advertising exists. Customer cannot file a complaint about non-honor of advertised insurance because the advertising is gone.
- This neutralizes the regulatory risk for v1.0.

---

## Option B — Wire Layer 2 before launch

Build the claims pipeline and partner contracts before shipping v1.0.

### Required work (months, not days)

1. **Insurance partner LOI signed.** Identify and contract with a Philippine underwriter (PNB Gen, Pioneer, Philam, or a reinsurance facility). 1–3 months including legal.
2. **Insurance Commission registration.** RA 11765 financial product registration. 2–6 months including IC review.
3. **Reinsurance / underwriting capacity.** Negotiate the policy limits, deductibles, and reinsurance backstop. Months.
4. **Claims pipeline engineering.** `POST /claims` endpoint, intake workflow, evidence handling (photos, GPS log, chat history retrieval), settlement vendor integration, payout flow, KYC tied to claims, fraud detection. 2–4 months of API + admin tooling work, or roughly the entire D04 + D05 + D06 + D07 timeline replaced with claims work.
5. **Customer support training.** Staff to handle claims intake, evidence review, dispute resolution per IC consumer-protection rules.
6. **Ongoing operating cost.** Claims handler salaries, reinsurance premiums, audit fees.

### Estimated cost

- Engineering: 4–6 months of equivalent AI/human capacity, replacing every other dispatch in Phase 14.
- Capital: insurance partner setup costs (IC fees, legal, reinsurance reserve); estimate ₱500K – ₱5M depending on partner.
- Risk to launch: v1.0 slips by 1–2 quarters minimum.
- Risk to growth: zero (insurance product is real and can scale).

---

## Recommendation: Option A

**Reasoning:**

1. **The Catalog Parts 2B/2C have already been written assuming Option A.** Reverting to Option B requires rewriting 8 customer-facing screens twice (once for Option A in catalog spec, again for Option B implementation) and then writing the full claims tooling.

2. **Insurance is not core to the marketplace value proposition.** The marketplace works with NBI-cleared providers + escrow payment + real-time tracking + dispute resolution. Insurance is a nice-to-have that customers don't ask for in the on-demand-services category at the price point onService PH targets (₱500–₱5,000 jobs).

3. **The regulatory exposure is asymmetric and one-sided.** Pulling costs nothing if Layer 2 never ships; wiring an unregistered insurance product exposes onService PH to IC enforcement action that can shut down the company. The downside of Option B (false start, then forced unwind) is much worse than the downside of Option A (no insurance at launch, customers don't notice).

4. **Layer 1 (escrow) is functional and is what most customers actually want.** The customer asked "is my money safe?" and escrow answers yes. Insurance answers a different question (am I made whole if the provider damages my house?) that statistically affects <1% of bookings and is well-served by dispute + small-claims-court for the rare case it matters.

5. **v1.1+ is still viable.** If onService PH proves out the marketplace and decides insurance is worth building, the partner search and IC registration can run in parallel with v1.x growth. Restoring the surfaces is a few hours of work once Layer 2 exists.

If Ken approves Option A, Dispatch 04 implementation begins immediately on `phase/14-d04-siguradoshield-pull` per the spec's bug list (1168 → 860 → 889 → 920 → 538 → 983, plus 686 + 834).

---

## Decision

**Decided by:** _(Ken — fill in)_
**Decision date:** _(YYYY-MM-DD)_
**Choice:** _(Option A | Option B)_
**Reason:** _(one sentence)_

After Ken records his decision in this section, the AI coder reads it, marks the escalation resolved, clears `CURRENT-DISPATCH` "blocked" flag, and proceeds with D04 implementation.

If Option B is chosen, the AI coder halts D04, surfaces a re-scoped Phase 14 plan to Ken (Layer 2 work absorbs most of the remaining dispatches), and waits for further direction.
