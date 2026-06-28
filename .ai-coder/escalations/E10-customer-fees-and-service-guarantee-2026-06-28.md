# E10 — Customer fees removed + ₱10,000 Service Guarantee (money + legal)

Date: 2026-06-28
Raised by: AI coder, on Ken's explicit direction
Status: OPEN — needs Ken + attorney sign-off before launch

## What Ken decided (his words)

- "remove any fees to the customer for using the app. customer shouldnt have any
  additional fees to use the app and only benefits like some type of rewards and
  points and incentives like the suki thing and also even some other incentive
  like insurance from the app lets say up to 10,000 peso ... and also the escrow
  working and assurance that the job is done right before any funds are released"

## What I shipped (done, live)

1. **Customer platform fee = 0.** Set `service_fee_rate` and `service_fee_min`
   to 0 in `platform_settings` on the live DB. This zeroes the customer fee in
   BOTH the booking-create path (`booking.service.ts`) and the pricing preview
   (`booking/pricing.service.ts`), and propagates to the app via
   `/api/v1/config` (`getClientConfig` returns `serviceFeeRate`). The mobile
   cold-start default is also set to 0 (`platform.config.ts`).
   - Reversible: an admin can set a fee again from the Settings page.
   - Platform revenue is unaffected — it still comes from provider commission
     (the founding/new/verified/pro/elite tiers), not a customer fee.
2. **Pricing breakdown** no longer shows a "Service fee" line when the fee is 0;
   checkout shows "Platform fee — Free" plus a benefits block (no fees, escrow
   release on confirm, Service Guarantee, Suki points).

## What still needs Ken + an attorney (DO NOT treat as a binding promise yet)

The **₱10,000 Service Guarantee** is currently surfaced in the checkout copy as
"Eligible jobs backed by our Service Guarantee, up to ₱10,000 (subject to terms)".
That is interim wording. Two things are unresolved:

1. **It conflicts with a prior decision.** `.ai-coder/decisions/D04-siguradoshield.md`
   deliberately PULLED the SiguradoShield insurance/coverage claims, and
   `LAUNCH-LIMITATIONS.md §23` records that protection-coverage settings
   (max property damage / theft / injury, claim window) are deferred to v1.1+.
   Re-introducing a ₱10,000 monetary cover claim re-opens that item.
2. **There is no claim/payout mechanism yet.** Escrow + the dispute/refund flow
   already cover "job not done right" (the customer's money is protected and
   refundable). A guarantee that pays out up to ₱10,000 for provider-caused
   damage BEYOND the job price is a new process: claim intake, evidence review,
   eligibility rules, a funding rule (the `guarantee_fund` wallet exists but its
   top-up source and caps are not defined), and attorney-reviewed terms so it is
   a "service guarantee", not regulated insurance.

### Recommended next steps (for Ken)
- Confirm the guarantee is a platform-backed **service guarantee** (not
  insurance), with a written terms page (eligibility, exclusions, the ₱10,000
  cap, claim window, evidence required).
- Decide how the guarantee fund is funded (e.g., a small slice of commission)
  and the per-claim + monthly caps.
- Have the terms attorney-reviewed (this is the same class as the F#10 disclaimer).
- Then I will build the claim intake (customer) + review/payout (admin) and lift
  LAUNCH-LIMITATIONS §23.

Until that is signed off, the checkout copy says "subject to terms" and should be
treated as a marketing intent, not a contractual guarantee.
