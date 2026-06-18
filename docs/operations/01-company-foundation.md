# Company Foundation

Purpose: the shared starting point for everyone who works at onService. What we are, who we serve, what we promise, and how we decide. Read this first, then move to your role-specific doc.

This is the first doc in the operations handbook. The full set is listed in `docs/operations/README.md`. Where a topic is owned by another doc, this one points you there instead of repeating it.

---

## 1. What onService is

onService is a remote home-services marketplace for the Philippines. A customer opens the app, picks a service (cleaning, aircon, plumbing, electrical, painting, and more), pays into escrow, and we match them with a vetted provider who shows up and does the job. We handle the money, the matching, the safety checks, and the dispute resolution. The provider does the work.

The competitor we are beating is not another app. It is the Facebook-group informal economy: a stranger from a buy-and-sell group who may or may not show up, may or may not be who they say, and takes cash with no record and no recourse. We win on trust. The whole product is built so a customer can say "this person is ID-verified, NBI-cleared, rated, and my money is held until the job is done right."

The build is city-agnostic. Cities are data in the `service_areas` table and are turned on or off from the admin Service Areas page. Adding a market is a settings change, not a code change. See `08-dispatch-and-live-operations.md` for how the live side runs and `11-admin-system-training-manual.md` for the Service Areas page.

### What onService is NOT

- **Not an employer.** Providers are independent contractors. They sign an Independent Contractor agreement at onboarding. They set their own availability, use their own tools, and pay their own taxes. Treating a provider like an employee (fixed schedule, exclusive work, disciplinary control) creates DOLE misclassification risk. See `05-provider-onboarding-and-training.md`.
- **Not an insurer.** We do not provide or broker insurance for property damage, theft, injury, or loss. This is in the customer Terms (§8 "Platform Protections - No Insurance"), the Help FAQ, and the Safety screen. Do not let any staff member tell a customer "you're insured." See the trust model in Section 8 below and `09-trust-safety-and-disputes.md`.
- **Not a cash business.** Customers pay through the app into escrow. We do not arrange or condone off-platform cash deals. The chat system flags attempts to take a deal off-platform (`messages.is_flagged`, "platform bypass detection").
- **Not a same-second dispatch guarantee.** Matching is automatic and fast, but if no provider accepts, the booking can end up unmatched. We handle that case openly (refund, manual reassignment, waitlist), we do not pretend a provider is coming when none is.

---

## 2. Mission (Ken decides)

The mission is one sentence on why we exist. Below are three candidates. Each is grounded in what the app actually does. Ken picks one.

> **DECIDE (mission):** Choose one of the three below, edit the wording, or write your own. Whichever lands here becomes the line we use in recruiting decks, the About page, and provider onboarding.

1. "To make hiring a trusted home-services pro in the Philippines as safe and simple as ordering food." (Plain, consumer-facing, leans on a habit Filipinos already have.)
2. "To replace the risk of hiring a stranger with ID-verified pros, held payments, and real accountability." (Leads with the trust problem we solve. Closest to the strategy docs.)
3. "To give Filipino home-service workers steady, fair-paid jobs and give households a pro they can trust." (Two-sided. Names both the provider and the customer.)

**Recommendation: #2.** It states the problem (hiring a stranger is risky) and the answer (verification, escrow, accountability) in one breath. It also matches the strategy line "Trust is the product."

---

## 3. Vision (Ken decides)

The vision is where we are going in 3 to 5 years if it works. Three candidates:

> **DECIDE (vision):** Pick one, edit, or replace. This sets the tone for fundraising and hiring.

1. "The default way Filipino households book home services, starting in Metro Cebu and reaching every major city." (Geographic, ambitious, simple.)
2. "A Philippines where no one has to gamble on a stranger to fix their home, and where skilled workers earn a fair, steady living doing it." (Outcome-focused, two-sided, emotional.)
3. "The trust layer for home services across Southeast Asia." (Biggest swing. Beyond the Philippines.)

**Recommendation: #1.** It is honest about where we are (Cebu first) and where we are going (every major city) without overpromising a region we have not entered. #3 is a good "someday" line but premature for a pre-launch team.

---

## 4. Company purpose

Mission and vision are aspirational. Purpose is the steady reason the company exists, in plain terms:

**We exist so that a household can hire help for their home without fear, and a skilled worker can earn a fair living without a boss.**

Everything in operations ladders up to that. When a decision is unclear, ask: does this make the customer safer or the provider's living fairer? If it does neither, it is probably not worth doing.

---

## 5. Core values

Five values. Each has a one-line "in practice" so it is testable, not a poster.

| Value | In practice |
|---|---|
| **Trust is the product** | If a trust signal (NBI check, escrow hold, rating, dispute window) is weakened to move faster, stop. The shortcut is not worth it. |
| **The provider eats** | A provider's payout is their income. Pay on time, explain every deduction, and never sit on money we owe without a clear reason logged in admin. |
| **Lead with the bad news** | When a job fails, a payout is late, or we made a mistake, say so first and fix it. No burying problems in a long reply. |
| **One booking, one truth** | The app's booking status and escrow state are the source of truth. Don't tell a customer something the system contradicts. If the system is wrong, escalate it, don't talk around it. |
| **Filipino-first, plainly** | Speak the customer's language (Bisaya, Tagalog, English). No jargon, no corporate filler. A tita in Mandaue should understand every word we send. |

> **ASSUMPTION:** The app does not define a values list anywhere in code. These five are drawn from the strategy docs ("Trust is the product"), the CLAUDE.md communication norms ("lead with the bad news," "speak in human English"), and the money model. Ken can add a sixth or seventh (for example "Safety is non-negotiable") if he wants. Keep it at 5 to 7 so people remember them.

---

## 6. Brand promise

Two audiences, two promises. Keep them short enough to put on a one-pager.

### To customers

> "Every pro is ID-verified and NBI-checked. Your payment is held safely until the job is done right. If something goes wrong, you have 48 hours to dispute and we step in."

What backs each part, so support never overstates it:

- **ID-verified + NBI-checked** - every approved provider has a government ID, NBI clearance, and a selfie reviewed by our team. Approval is blocked in admin until those three are on file (`REQUIRED_KYC_FIELDS`). See `04-provider-vetting-and-filtering.md`.
- **Payment held safely** - money sits in platform escrow from the moment the customer pays until the customer confirms the job, or until auto-confirm after 24 hours. We do not release early. See Section 8 and `10-money-and-compliance-ops.md`.
- **48-hour dispute window** - the customer can file a dispute up to 48 hours after the provider marks the job complete. If the provider does not respond in 48 hours, the dispute resolves in the customer's favor. See `09-trust-safety-and-disputes.md`.

Do not promise insurance, a guaranteed arrival time, or a refund "no matter what." Refunds follow the cancellation and dispute policy, not the loudest complaint.

### To providers

> "Steady jobs, fair commission that drops as you grow, your money paid out fast, and a fair shot if a customer disputes."

What backs each part:

- **Steady jobs** - automatic dispatch sends offers to the best-matched provider first. See `08-dispatch-and-live-operations.md`.
- **Fair commission that drops as you grow** - commission is a flat rate per tier and gets lower as the provider levels up. Exact rates in Section 7.
- **Paid out fast** - providers request a payout (minimum ₱100) from their wallet; target is 3 business days to complete. See `07-provider-support-sop.md` and `10-money-and-compliance-ops.md`.
- **A fair shot in disputes** - the provider sees the customer's claim, can respond within 48 hours, and can accept, contest, or offer a partial. See `09-trust-safety-and-disputes.md`.

---

## 7. Provider tiers and commission (the real numbers)

Commission is taken off the service price. The provider receives the service price minus their tier's commission. These rates are the launch defaults and are admin-tunable in Settings (category Commissions), so treat them as starting numbers, not carved in stone.

| Tier | Commission | How a provider gets here |
|---|---|---|
| **founding** | **10%** | Invite-only launch batch. First 50 providers per city, 10% locked for 12 months. Not a step on the normal ladder, a parallel perk tier. |
| **new** | **15%** | Default tier when a provider is approved. |
| **verified** | **13%** | 5+ completed jobs and a 4.0+ rating. |
| **pro** | **11%** | 25+ jobs, 4.5+ rating, no open disputes. |
| **elite** | **9%** | 100+ jobs, 4.7+ rating, a verified (TESDA) certification, no open disputes. |

Notes for ops:

- Promotion is not automatic. The app shows a provider their progress, but a human (super-admin) sets the tier in the admin Providers page with a reason. See `04-provider-vetting-and-filtering.md` for the tiering SOP.
- Do not confuse **provider tiers** (founding/new/verified/pro/elite) with the customer **Suki loyalty tiers** (new/regular/suki/super_suki). Different system, different table.
- Tipping is 100% to the provider, no commission. Tips are wallet-only for launch.

---

## 8. The trust model: vetted providers + escrow, NOT insurance

This is the most important thing to get right, because getting it wrong is a legal problem, not just a messaging one.

### What we actually offer (each of these is real and verifiable)

1. **Identity + NBI verification.** Government ID, NBI clearance, and selfie collected at onboarding and reviewed by our team before approval.
2. **Escrow.** Customer pays first. The money sits in the platform escrow wallet until the customer confirms the job is done, or auto-confirm releases it after 24 hours. If the provider is suspended mid-job, escrow is frozen until an admin resolves it.
3. **48-hour dispute window.** After a job is marked complete, the customer has 48 hours to dispute. Damage or theft claims require photo evidence.
4. **Rating accountability.** Low-rated providers (below the rating floor, once they have enough reviews) drop out of auto-dispatch. Chronic cancellers get warned then auto-suspended.
5. **A self-funded guarantee fund.** We set aside 1.5% of every service fee into a guarantee fund wallet. This is a **service guarantee, not insurance.** It is our own money used to make a customer whole in specific cases, capped per claim. It needs no Insurance Commission license because it is not an insurance product.

### What we do NOT offer, and why it matters

We removed the old "SiguradoShield" insurance branding on purpose (Ken's decision, 2026-04-30, decision file `D04-siguradoshield.md`). The app once advertised peso coverage figures (₱25,000 / ₱50,000 / ₱100,000) for an insurance product that never existed: no claims pipeline, no insurance partner, no Insurance Commission registration. Advertising it was false advertising under RA 7394 (the Consumer Act) and exposed us under the insurance laws. So it is gone, and a CI guard blocks anyone from putting it back.

**The rule for every staff member:**

> We never say "insured," "insurance," "coverage," or quote a peso coverage amount. We say "ID-verified pros, escrow-held payment, a 48-hour dispute window, and a service guarantee fund." If a customer asks "am I insured?", the answer is: "No, onService is a marketplace, not an insurer. Here is the protection you do have," then list the four real ones.

The exact approved disclaimer wording lives in the customer Terms §8 and the Help FAQ. Use that wording, do not improvise. Full dispute and refund handling is in `09-trust-safety-and-disputes.md` and `13-policies-codes-and-templates.md`.

---

## 9. Market strategy: Cebu first, every city eventually

- **Default and first market is Metro Cebu**: Cebu City, Mandaue, Lapu-Lapu, Talisay. The app centers its map and default pickers on the default service area (seeded to Cebu City).
- **The platform is city-agnostic.** A market is a row in `service_areas` with a status (planned, recruiting, soft_launch, active, paused, retired). We turn a city on from the admin Service Areas page when it has enough providers (default minimum 5 to launch). No code change, no app release.
- **Future markets Ken has in mind:** Boracay, General Santos, Davao, Metro Manila, Bacolod, and others. We add and activate them in admin when each one is recruited and ready. Which cities we actively market is a marketing call, not a platform limit.
- **History note:** an earlier plan led with Boracay. That was superseded by the Cebu-first, multi-city direction on 2026-06-04. Some older strategy files and test fixtures still mention Boracay; treat those as point-in-time history, not current direction.

### Turning on a new city (ops quick-checklist)

This is the foundation-level view. The full recruiting and launch SOP is in `03-provider-recruiting-sop.md` and `08-dispatch-and-live-operations.md`.

- [ ] Create the area in admin Service Areas (name, city, province, region, center lat/lng, radius, min providers to launch).
- [ ] Set status to `recruiting` and start sourcing providers (`03-provider-recruiting-sop.md`).
- [ ] Vet and approve providers until you hit the minimum (default 5) (`04-provider-vetting-and-filtering.md`).
- [ ] Confirm the LGU permit for that city is filed (Mayor's / business permit per city). See `10-money-and-compliance-ops.md`.
- [ ] Move status to `soft_launch`, run a few real bookings, watch dispatch.
- [ ] Move to `active` and, if it should be the home market, `set default`.

---

## 10. Where to go next

| You need... | Read |
|---|---|
| Who does what, org chart, hiring | `02-org-structure-and-roles.md` |
| Finding and signing up providers | `03-provider-recruiting-sop.md` |
| KYC, vetting, tiering, approve/reject | `04-provider-vetting-and-filtering.md` |
| Activating and training providers | `05-provider-onboarding-and-training.md` |
| Helping customers | `06-customer-support-sop.md` |
| Helping providers (payouts, jobs) | `07-provider-support-sop.md` |
| How dispatch and live ops run | `08-dispatch-and-live-operations.md` |
| Disputes, refunds, safety, fraud | `09-trust-safety-and-disputes.md` |
| Escrow, payouts, BIR, NPC, PayMongo | `10-money-and-compliance-ops.md` |
| Using the admin app, page by page | `11-admin-system-training-manual.md` |
| KPIs and quality standards | `12-quality-standards-and-kpis.md` |
| Policies, codes of conduct, templates | `13-policies-codes-and-templates.md` |

---

## 11. Open decisions captured in this doc

- **DECIDE (mission):** pick one of the three mission statements in Section 2. Recommendation: #2.
- **DECIDE (vision):** pick one of the three vision statements in Section 3. Recommendation: #1.
- **ASSUMPTION (values):** the five core values in Section 5 are proposed, not defined in the app. Confirm or adjust.

Once Ken sets the mission, vision, and values, update Sections 2, 3, and 5 in place and remove the DECIDE callouts.
