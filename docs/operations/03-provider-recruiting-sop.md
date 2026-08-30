# Provider Recruiting SOP

Purpose: a step-by-step playbook for sourcing and recruiting providers to launch and grow a service area, starting with Metro Cebu (Cebu City, Mandaue, Lapu-Lapu, Talisay).

Related docs: hand applicants to `04-provider-vetting-and-filtering.md` once they apply. Onboarding and first-job support live in `05-provider-onboarding-and-training.md`. Recruiting targets feed the launch readiness tracked in `08-dispatch-and-live-operations.md`. KPIs live in `12-quality-standards-and-kpis.md`. Message templates also live in `13-policies-codes-and-templates.md`.

---

## 1. What recruiting has to deliver

We win on trust, not on price. The pitch to every provider is simple: you join a platform that ID-verifies and NBI-checks every pro, records server-verified paid/held booking state, and lets ratings build your reputation. Do not promise steady volume or claim every external payment method is live; E14 still blocks the current hosted PayMongo authorization link. Do not describe the current 24-hour release timer as a settled protection rule while the customer filing window remains 48 hours under E18.

Recruiting and vetting are separate jobs. Your job in recruiting is to get qualified people to submit a complete application in the mobile app. Approving them is not your call (see `04-provider-vetting-and-filtering.md`).

### The escrow model (say this correctly to providers)

When the app offers a real paid/assigned job, the server has already verified payment and recorded it held in escrow. A provider does not collect cash from the customer. Customer confirmation can release the provider share; the worker also currently releases after 24 hours, but E18 records that this is earlier than the 48-hour dispute-filing deadline. Recruiters must not promise that the 24-hour credit is final. Once an amount is available in Earnings, the provider may submit a manual withdrawal request to GCash, Maya, InstaPay, or PESONet. E03 fixed the initial ordering; E14 still blocks the current external hosted checkout entry.

Do not promise instant cash in hand. Money moves through the app.

---

## 2. How a service area opens for recruiting

Markets are data, not code. An admin creates the area in the admin **Service Areas** page and moves it through statuses. Recruiting starts when an area is in `recruiting` status.

Status path (from the Service Areas ground truth): `planned` -> `recruiting` -> `soft_launch` -> `active` (also `paused`, `retired`).

Each area carries a `min_providers_to_launch` value (default 5, settable 1 to 50 in admin). That number is the floor to flip the area to `active`. Recruiting targets below are built to clear that floor per category, not just per city.

Before you start outreach in a new area, confirm with the admin/ops lead:

- [ ] The area exists in Service Areas and is in `recruiting` status
- [ ] `min_providers_to_launch` is set (default 5)
- [ ] Which service categories we are launching first (cleaning, aircon, plumbing, electrical are the usual starters)
- [ ] Who the approving admin is for this batch (so applications do not sit)

---

## 3. How many providers to launch a category in an area

The platform floor is `min_providers_to_launch` (default 5) for the whole area. That is the minimum to turn the area `active`. It is not enough to give customers a real choice or to cover demand peaks. Use these working targets.

The app does not define per-category headcount, so these are starting targets to tune against real data.

| Stage | Per launch category | Why |
|---|---|---|
| Soft-launch minimum | 5 approved + online | Matches the default `min_providers_to_launch`; thin but launchable |
| Healthy launch | 8 to 12 approved | Covers no-shows, declines, and the 45-second offer cascade |
| Growth target (90 days) | 20+ approved | Real choice, surge coverage, room to tier up your best |

Notes that come from how dispatch actually works:

- Offers go out one provider at a time, 45 seconds each, up to 10 attempts before the customer is told "no provider available." Thin supply means dead air for the customer. Aim past the floor.
- Only `approved` AND available (online) providers get offers. Recruiting 8 does not mean 8 online. Plan for roughly 60 to 70 percent online at any time (tune against real availability data).
- Recruit a few extra above target because vetting will reject some. Budget for a 50 to 60 percent application-to-approval rate (see the funnel in section 6).

> **Set (editable):** hold an area at `soft_launch` until each launch category reaches at least 5 approved providers, then flip the area to `active` once the lead category reaches 8 approved. The 5-floor area-wide alone is not enough to go `active`. _Recommended default. To change it, edit here and anywhere this value is referenced._

These go-live numbers (5 to soft-launch a category, 8 in the lead category to go active) mirror the area go-live rule used across the handbook. Keep them in sync.

---

## 4. Sourcing channels (Cebu first)

Work these in roughly this order. The first three are highest trust and lowest cost.

### 4.1 Existing-provider referrals (highest quality, build this early)

Once you have even five good providers, they are your best recruiters. Trusted tradespeople know other trusted tradespeople. The referral incentive structure is in section 8.

### 4.2 Barangay and community referrals

- Talk to barangay officials and barangay halls in the launch cities. Ask for known, reliable tradespeople (electricians, plumbers, aircon techs, cleaners) in their area.
- Condo and subdivision admins, building maintenance offices, and homeowners-association groups know who already does good work in their buildings.
- Sari-sari store owners and hardware stores are informal hubs; tradespeople buy supplies there.

### 4.3 Trade schools and TESDA

- TESDA-accredited training centers and assessment centers in Cebu graduate certified techs in RAC (refrigeration and aircon), electrical, plumbing, and housekeeping. A verified TESDA certification is also what unlocks the Elite provider tier later (see section 9), so TESDA grads are high-value.
- Ask for graduate lists, post on their job boards, and offer to do a short info session.
- Target programs: RAC NC II (aircon), Electrical Installation and Maintenance NC II, Plumbing NC I/II, Housekeeping NC II.

### 4.4 Facebook groups and marketplace

The informal Facebook economy is our main competitor and our main hunting ground. Find providers already advertising services there and pitch them on trust plus pre-paid jobs.

- Cebu buy-and-sell, services, and "hanap raket" groups
- City-specific groups (Cebu City, Mandaue, Lapu-Lapu, Talisay)
- Aircon-cleaning, plumbing, and "labandera/cleaning services" groups
- Marketplace listings for the categories we are launching

Post in Bisaya or Taglish, not formal English. People skim. Until E14 closes, lead with verification, on-app records, commission, and manual withdrawal rather than claiming a working prepaid-job supply.

---

## 5. Outreach message templates

Copy-paste and adjust the city and category. Keep it short. Lead with pre-paid jobs and trust.

### 5.1 Facebook group post (Bisaya/Taglish)

```
Naa miy trabaho para sa mga RELIABLE nga [aircon tech / plumber / electrician / cleaner] sa [Cebu City].

onService PH - app nga mo-connect nimo sa mga customer nga nag-book ug
serbisyo. Kung makita nimo ang paid/assigned nga trabaho sa app, gi-verify
na sa system ang bayad ug naa sa escrow, mao nga dili ka maningil og cash.

Kinahanglan:
- Valid government ID
- NBI clearance (within 6 months)
- Selfie para sa verification

10% lang ang commission para sa unang 50 providers sa siyudad (founding batch).

Interesado? PM lang or download ang onService app ug mag-apply as provider.
```

### 5.2 Direct message to a provider already advertising (Taglish)

```
Hi [name], nakita ko yung post mo for [aircon cleaning] sa Cebu. Maganda
yung work mo.

Nag-launch kami ng onService PH sa Cebu - platform para sa verified home
service bookings. Kapag paid/assigned na ang job sa app, verified at nasa
escrow ang bayad, kaya hindi ka maniningil ng cash. Lalabas ang kita sa
wallet at puwede kang mag-request ng withdrawal sa GCash/Maya/bank.

Founding-batch ka pa pwede - 10% commission lang for 12 months instead
ng standard 15%.

Kailangan lang: valid ID, NBI clearance (6 months), at selfie. I-review ang
application once kumpleto; walang fixed approval time.

Gusto mo bang mag-apply? Tutulungan kita.
```

### 5.3 Referral ask to an existing approved provider (SMS, English/Taglish)

```
Hi [name], you've been doing great work on onService. We're looking for
more good [category] pros in [city]. Kung may kakilala kang reliable,
i-refer mo sa amin. May ₱500 reward ka pag na-approve sila at natapos
ang first 3 jobs. Reply REFER for details.
```

### 5.4 TESDA / trade-school info-session blurb

```
onService PH is recruiting NBI-cleared, skilled home-service providers in
Metro Cebu (cleaning, aircon, plumbing, electrical). Verified paid/assigned
jobs use escrow, providers can request manual withdrawals to GCash/Maya/bank,
and our founding batch has a lower commission. TESDA-certified techs get
priority. Bring a valid ID and NBI clearance. Apply in the onService app.
```

---

## 6. The application funnel and conversion targets

The application happens entirely in the mobile app. You guide people to it and help them complete it. You do not approve anyone.

### What the applicant does (role choice, six application steps, then status screens)

1. Role select (provider)
2. Business name + service categories (1 to 10 categories)
3. Admin-configured provider market, exact operating location, and radius
4. Vetting questionnaire
5. Documents: government ID front, government ID back, NBI clearance
6. Selfie
7. Terms (accepts the Independent Contractor agreement and submits)

After submission, Review Pending and Background Check Status show the server-backed application state. They are status screens, not extra application promises or approval stages.

On submit, a provider row is created with status `pending`. It is now in the vetting queue. Hand off to `04-provider-vetting-and-filtering.md`.

### Required to even submit (set expectations up front so people do not bounce)

- [ ] Business name (2 to 200 characters)
- [ ] 1 to 10 service categories chosen
- [ ] An Admin-configured active, soft-launch, or recruiting market
- [ ] Exact operating location inside that market and a radius within the live Admin **Max Service Radius**
- [ ] Government ID front and back images
- [ ] NBI clearance image (issued within last 6 months)
- [ ] Selfie
- [ ] Independent Contractor agreement accepted

Optional but helpful: NBI expiry date and government ID number.

### Funnel stages and starting conversion targets

No funnel rates are defined in the app, so these are starting targets to tune against real data.

| Stage | What it means | Target rate |
|---|---|---|
| Contacted -> Interested | Replied, wants in | 30% |
| Interested -> App downloaded | Got the app open | 70% |
| Downloaded -> Submitted | Completed all 6 application steps, status `pending` | 60% |
| Submitted -> Approved | Passed vetting (admin) | 50 to 60% |
| Net: Contacted -> Approved | End to end | ~8 to 12% |

Plan recruiting volume backward from this. To get 10 approved providers, expect to start real conversations with roughly 80 to 120 people. Tune the multiplier once you have two weeks of live numbers.

### Where applicants drop and how to save them

- Stuck on NBI clearance: most common blocker. Many tradespeople do not have a current one. Keep a short "how to get an NBI clearance" guide ready (online appointment at nbi-clearance.gov.ph, valid ID, fee). This is the single biggest funnel leak.
- Bad document photos: the selfie and IDs are reviewed by a human admin (no automated check in v1.0). Coach applicants to shoot in good light, flat, no glare.
- Categories confusion: tell them to pick only categories they can actually do well. They can add more later.

---

## 7. Weekly recruiting cadence and target numbers

Run recruiting as a weekly loop per area. Numbers below are per recruiter per week and are starting targets to tune.

### Weekly cadence checklist

- [ ] Monday: pull the week's targets per category from the area's gap (target minus current approved). Plan channel mix.
- [ ] Mon to Fri: post in 3 to 5 Facebook groups, send 20+ direct messages, work 2+ barangay or trade-school contacts.
- [ ] Daily: follow up with applicants who report that they are still completing the form. Admin sees submitted provider records, not a durable in-progress draft queue; E35 tracks that gap.
- [ ] Daily: confirm the approving admin is clearing the vetting queue so applicants do not go cold.
- [ ] Friday: log the funnel numbers (contacted, interested, submitted, approved) per category in the recruiting tracker. Compare to target.
- [ ] Friday: send referral asks to your best new approved providers.

### Starting weekly targets per launch category (per recruiter)

Starting targets, tune after two weeks of live numbers.

| Activity | Weekly target |
|---|---|
| New conversations started | 25 to 40 |
| Applications submitted (`pending`) | 6 to 10 |
| Net new approved | 3 to 5 |

A single recruiter pushing one category at these rates clears the 5-floor in about 2 weeks and reaches the healthy 8 to 12 in 3 to 4 weeks. Scale recruiters or weeks for multiple categories or multiple cities.

### Pacing a new city

| Week | Goal |
|---|---|
| 1 | Area in `recruiting`. First 25+ conversations per launch category. NBI guide and templates ready. |
| 2 | First applications land. Hit 5 approved in the lead category. |
| 3 to 4 | 8 to 12 approved in lead category, 5+ in each other launch category. Soft-launch. |
| 5 to 8 | Turn area `active`. Push lead category toward 20. Referral engine running. |

---

## 8. Referral incentive structure

Existing-provider referrals are the cheapest, highest-quality channel. Reward on a real outcome, not just a signup, so people do not farm the bonus.

> **Set (editable):** ₱500 to the referrer plus a ₱300 welcome bonus to the new provider, both paid after the new provider completes 3 jobs, capped at 10 paid referrals per referrer per month. _Recommended default. To change it, edit here and anywhere this value is referenced._

| Lever | Value (PHP) | Notes |
|---|---|---|
| Referrer reward | ₱500 | Paid after the referred provider is approved AND completes their first 3 jobs |
| Referred-provider welcome bonus | ₱300 | Paid after their first 3 jobs; gives the referred person a reason to finish onboarding |
| Qualifying jobs | 3 jobs | Matches the 3-job probation; proves the person is real and active |
| Cap per referrer | 10 paid referrals per month | Stops farming; revisit as supply grows |
| Payout method | Credited to provider wallet | Reuses the existing wallet/withdrawal path; no new money rail needed |

Why pay on completed jobs, not signup: a signup costs us nothing if the person never works. Three completed jobs proves identity, skill, and reliability, and aligns with the 3-job probation policy in vetting.

Recommended copy for the reward terms (provider-facing):

```
Refer a pro, earn ₱500. When someone you refer gets approved and finishes
their first 3 jobs on onService, you get ₱500 in your wallet and they get
₱300 too. Up to 10 referrals a month. They must pass our ID and NBI checks
like everyone else.
```

Note: this provider-to-provider referral reward is a recruiting tool and is separate from any customer-side referral or the customer Suki loyalty program. Do not conflate them.

---

## 9. The founding-provider angle (your strongest close)

Use this in every channel. It is real and it is in the platform.

- The first 50 providers per city can be placed in the **Founding** tier: 10 percent commission (versus the standard 15 percent for new providers) for 12 months, featured launch placement, and priority support.
- Founding is invite-only and set by an admin. You flag a strong applicant for founding placement; the admin assigns the tier. Do not promise the tier yourself; promise that you will recommend them for it.

Standard tier and commission ladder, so you can answer questions honestly:

| Tier | Commission | How you get there |
|---|---|---|
| Founding | 10% | Invite-only, first 50 per city, 12 months |
| New | 15% | Default on approval |
| Verified | 13% | 5+ jobs, 4.0+ rating |
| Pro | 11% | 25+ jobs, 4.5+ rating, no open disputes |
| Elite | 9% | 100+ jobs, 4.7+ rating, verified TESDA certification, no open disputes |

Plain-language pitch: start at New (15 percent), or get into the Founding batch at 10 percent if you are early. Do good work and your commission drops as you climb to Verified, Pro, and Elite. Commission is flat within a tier; it does not change job to job.

---

## 10. Hand-off to vetting (where recruiting stops)

The moment an applicant submits (status `pending`), recruiting is done and screening begins. Do not coach anyone on how to pass a check, and never accept or photograph documents yourself. The mobile app collects them directly and securely.

Recruit toward the approval bar, not just toward a submission. The vetting team approves only applicants who clear a scored scorecard (80 of 100), an identity and NBI check, a per-category skills check, an interview, and 2 references, then complete a 3-job probation. The full bar and the interview script are in `04-provider-vetting-and-filtering.md` (Sections 0, 3, and 4a). The practical recruiting takeaway: target genuinely skilled, NBI-cleared, reliable tradespeople. Sending volume that cannot pass the skills or NBI check just drops your submitted-to-approved rate (Section 11).

Hand-off checklist:

- [ ] Applicant submitted in-app (status `pending`)
- [ ] All four evidence files are visible in Provider 360: NBI clearance, government ID front, government ID back, and selfie. The server currently blocks approval for missing NBI, ID front, or selfie but not missing ID back; reviewers must enforce the fourth file manually under E36.
- [ ] Categories and service area look right for where we are recruiting
- [ ] Provider 360 shows the selected primary market, exact operating pin, and radius captured by the application
- [ ] Flagged for founding-tier consideration if they are an early, strong applicant
- [ ] Logged in the recruiting tracker

Then: `04-provider-vetting-and-filtering.md` owns the screening scorecard, KYC document checks, approve/reject, and tiering. `05-provider-onboarding-and-training.md` owns what happens after approval.

---

## 11. Recruiter scorecard (weekly)

Track per recruiter, per area, per category. Targets are starting points to tune.

| Metric | Starting target |
|---|---|
| Conversations started | 25 to 40 / week |
| Applications submitted | 6 to 10 / week |
| Net new approved | 3 to 5 / week |
| Submitted-to-approved rate | 50 to 60% |
| Referral applications generated | 2+ / week once you have 5+ providers |
| Days to fill an area's 5-floor (per launch category) | under 14 |

If submitted-to-approved drops below 50 percent, the problem is upstream: you are sending people who cannot pass NBI or ID checks. Fix targeting and the NBI guide before pushing more volume.

---

## 12. Quick reference

- Floor to launch an area: `min_providers_to_launch` (default 5), set in admin Service Areas.
- Healthy launch per category: 8 to 12 approved (starting target, tune).
- Go-live rule: 5 approved per launch category to soft-launch, 8 in the lead category to go active.
- Required docs to submit: government ID front + back, NBI clearance (within 6 months), selfie.
- Status after submit: `pending`. Approval is an admin action, not yours.
- Founding tier: first 50 per city, 10 percent commission, 12 months, admin-assigned.
- Referral reward: ₱500 to referrer + ₱300 to new provider, paid after the new provider's first 3 completed jobs, capped at 10/month.
- Money model: a provider acts only on a server-verified paid/assigned job and relies on the booking/earnings record. Customer confirmation can release escrow; the current 24-hour worker conflicts with the 48-hour filing window under E18 and must not be promised as final. The provider submits manual withdrawal requests. External hosted checkout remains E14 until approved and tested.

---

## Open decisions set in this doc

- **Area go-live threshold (section 3):** hold at `soft_launch` until each launch category has 5 approved providers, then go `active` once the lead category reaches 8 approved. (editable)
- **Referral incentive (section 8):** ₱500 to the referrer + ₱300 welcome bonus to the new provider, both paid after the new provider completes 3 jobs, capped at 10 paid referrals per referrer per month. (editable)
