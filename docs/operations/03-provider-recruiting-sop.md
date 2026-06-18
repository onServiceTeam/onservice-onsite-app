# Provider Recruiting SOP

Purpose: a step-by-step playbook for sourcing and recruiting providers to launch and grow a service area, starting with Metro Cebu (Cebu City, Mandaue, Lapu-Lapu, Talisay).

Related docs: hand applicants to `04-provider-vetting-and-filtering.md` once they apply. Onboarding and first-job support live in `05-provider-onboarding-and-training.md`. Recruiting targets feed the launch readiness tracked in `08-dispatch-and-live-operations.md`. KPIs in `12-quality-standards-and-kpis.md`. Message templates also live in `13-policies-codes-and-templates.md`.

---

## 1. What recruiting has to deliver

We win on trust, not on price. The pitch to every provider is: you join a platform that customers already trust because we ID-verify and NBI-check every pro, hold payment in escrow until the job is confirmed, and let ratings build your reputation. The provider gets steady, pre-paid jobs without chasing payment.

Recruiting is done. Vetting is separate (see `04-provider-vetting-and-filtering.md`). Your job in recruiting is to get qualified people to submit a complete application in the mobile app. Approving them is not your call.

### The INSTANT-PAY model (say this correctly to providers)

Customers pay first, into escrow, and a provider is matched after. A provider never has to collect cash or wait for the customer to pay. When you accept a job, the money is already held. After the job is confirmed (or auto-confirmed 24 hours after you mark it done), your share lands in your in-app wallet, and you withdraw to GCash, Maya, or bank.

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

ASSUMPTION (starting targets to tune, the app does not define per-category headcount):

| Stage | Per launch category | Why |
|---|---|---|
| Soft-launch minimum | 5 approved + online | Matches the default `min_providers_to_launch`; thin but launchable |
| Healthy launch | 8 to 12 approved | Covers no-shows, declines, and the 45-second offer cascade |
| Growth target (90 days) | 20+ approved | Real choice, surge coverage, room to tier up your best |

Notes that come from how dispatch actually works:

- Offers go out one provider at a time, 45 seconds each, up to 10 attempts before the customer is told "no provider available." Thin supply means dead air for the customer. Aim past the floor.
- Only `approved` AND available (online) providers get offers. Recruiting 8 does not mean 8 online. Plan for roughly 60 to 70 percent online at any time. ASSUMPTION, tune against real availability data.
- Recruit a few extra above target because vetting will reject some. Budget for a 50 to 60 percent application-to-approval rate (see the funnel in section 6).

DECIDE (Ken): do we hold an area at `soft_launch` until each launch category hits the healthy 8 to 12, or flip to `active` the moment the 5-floor is met area-wide. Recommendation: hold for at least 5 per category in each launch category, then soft-launch, then go active at 8 in the lead category.

---

## 4. Sourcing channels (Cebu first)

Work these in roughly this order. The first three are highest trust and lowest cost.

### 4.1 Existing-provider referrals (highest quality, build this early)

Once you have even five good providers, they are your best recruiters. Trusted tradespeople know other trusted tradespeople. Referral incentive structure is in section 8.

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

Post in Bisaya or Taglish, not formal English. People skim.

---

## 5. Outreach message templates

Copy-paste and adjust the city and category. Keep it short. Lead with pre-paid jobs and trust.

### 5.1 Facebook group post (Bisaya/Taglish)

```
Naa miy trabaho para sa mga RELIABLE nga [aircon tech / plumber / electrician / cleaner] sa [Cebu City].

onService PH - app nga mo-connect nimo sa mga customer nga nag-book ug
serbisyo. Bayad na daan ang customer (naa sa escrow) bag-o ka i-match,
mao nga dili na ka maglisod ug singil.

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

Nag-launch kami ng onService PH sa Cebu - platform na nagbibigay ng
pre-paid na jobs. Bayad na agad yung customer (nasa escrow) bago ka
i-match, so wala kang habulin na bayad. Lalabas yung kita mo sa wallet,
withdraw mo sa GCash/Maya/bank.

Founding-batch ka pa pwede - 10% commission lang for 12 months instead
ng standard 15%.

Kailangan lang: valid ID, NBI clearance (6 months), at selfie. Approved
agad pag kumpleto.

Gusto mo bang mag-apply? Tutulungan kita.
```

### 5.3 Referral ask to an existing approved provider (SMS, English/Taglish)

```
Hi [name], you've been doing great work on onService. We're looking for
more good [category] pros in [city]. Kung may kakilala kang reliable,
i-refer mo sa amin. May [DECIDE: amount] reward ka pag na-approve sila at
natapos ang first [N] jobs. Reply REFER for details.
```

### 5.4 TESDA / trade-school info-session blurb

```
onService PH is recruiting NBI-cleared, skilled home-service providers in
Metro Cebu (cleaning, aircon, plumbing, electrical). Pre-paid jobs through
the app, weekly payouts to GCash/Maya/bank, and lower commission for our
founding batch. TESDA-certified techs get priority. Bring a valid ID and
NBI clearance. Apply in the onService app.
```

---

## 6. The application funnel and conversion targets

The application happens entirely in the mobile app. You guide people to it and help them complete it. You do not approve anyone.

### What the applicant does (5-step provider onboarding)

1. Role select (provider)
2. Business name + service categories (1 to 10 categories)
3. Documents: Government ID front, Government ID back, NBI clearance (must be within last 6 months)
4. Selfie
5. Terms (accepts the Independent Contractor agreement and submits)

On submit, a provider row is created with status `pending`. It is now in the vetting queue. Hand off to `04-provider-vetting-and-filtering.md`.

### Required to even submit (set expectations up front so people do not bounce)

- [ ] Business name (2 to 200 characters)
- [ ] 1 to 10 service categories chosen
- [ ] Service radius (1 to 50 km) and a location inside the Philippines
- [ ] Government ID front and back images
- [ ] NBI clearance image (issued within last 6 months)
- [ ] Selfie
- [ ] Independent Contractor agreement accepted

Optional but helpful: NBI expiry date and government ID number.

### Funnel stages and starting conversion targets

ASSUMPTION (no funnel rates are defined in the app; these are starting targets to tune against real data):

| Stage | What it means | Target rate |
|---|---|---|
| Contacted -> Interested | Replied, wants in | 30% |
| Interested -> App downloaded | Got the app open | 70% |
| Downloaded -> Submitted | Completed all 5 steps, status `pending` | 60% |
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
- [ ] Daily: chase every `pending` application that is missing docs (you can see who applied; ping them to finish).
- [ ] Daily: confirm the approving admin is clearing the vetting queue so applicants do not go cold.
- [ ] Friday: log the funnel numbers (contacted, interested, submitted, approved) per category in the recruiting tracker. Compare to target.
- [ ] Friday: send referral asks to your best new approved providers.

### Starting weekly targets per launch category (per recruiter)

ASSUMPTION (starting targets, tune after two weeks):

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

DECIDE (Ken, set the peso amounts and rules):

| Lever | Recommendation (PHP) | Notes |
|---|---|---|
| Referrer reward | ₱500 | Paid after the referred provider is approved AND completes their first [N] jobs |
| Referred-provider welcome bonus | ₱300 | Paid after their first [N] jobs; gives the referred person a reason to finish onboarding |
| Qualifying jobs (N) | 3 jobs | Matches the strategic 3-job probation; proves the person is real and active |
| Cap per referrer | 10 paid referrals per month | Stops farming; revisit as supply grows |
| Payout method | Credited to provider wallet | Reuses the existing wallet/withdrawal path; no new money rail needed |

Why pay on completed jobs, not signup: a signup costs us nothing if the person never works. Three completed jobs proves identity, skill, and reliability, and aligns with the 3-job probation policy in vetting.

Recommended copy for the reward terms (provider-facing):

```
Refer a pro, earn ₱[DECIDE]. When someone you refer gets approved and
finishes their first [N] jobs on onService, you get ₱[DECIDE] in your
wallet and they get ₱[DECIDE] too. Up to [cap] referrals a month. They
must pass our ID and NBI checks like everyone else.
```

Note: this provider-to-provider referral reward is a recruiting tool and is separate from any customer-side referral or the customer Suki loyalty program. Do not conflate them.

---

## 9. The founding-provider angle (your strongest close)

Use this in every channel. It is real and it is in the platform.

- The first 50 providers per city can be placed in the **founding** tier: 10 percent commission (versus the standard 15 percent for new providers) for 12 months, featured launch placement, and priority support.
- Founding is invite-only and set by an admin. You flag a strong applicant for founding placement; the admin assigns the tier. Do not promise the tier yourself, promise that you will recommend them for it.

Standard tier and commission ladder, so you can answer questions honestly:

| Tier | Commission | How you get there |
|---|---|---|
| Founding | 10% | Invite-only, first 50 per city, 12 months |
| New | 15% | Default on approval |
| Verified | 13% | 5+ jobs, 4.0+ rating |
| Pro | 11% | 25+ jobs, 4.5+ rating, no open disputes |
| Elite | 9% | 100+ jobs, 4.7+ rating, verified TESDA certification, no open disputes |

Plain-language pitch: start at New (15 percent), or get into the Founding batch at 10 percent if you are early. Do good work and your commission drops as you climb to Verified, Pro, and Elite. Commission is flat within a tier, it does not change job to job.

---

## 10. Hand-off to vetting (where recruiting stops)

The moment an applicant submits (status `pending`), recruiting is done and screening begins. Do not coach anyone on how to pass a check, and never accept or photograph documents yourself. The mobile app collects them directly and securely.

Hand-off checklist:

- [ ] Applicant submitted in-app (status `pending`)
- [ ] All three required documents uploaded (NBI clearance, government ID front, selfie are the hard requirements admin checks at approval)
- [ ] Categories and service area look right for where we are recruiting
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
- Healthy launch per category: 8 to 12 approved (ASSUMPTION, tune).
- Required docs to submit: government ID front + back, NBI clearance (within 6 months), selfie.
- Status after submit: `pending`. Approval is an admin action, not yours.
- Founding tier: first 50 per city, 10 percent commission, 12 months, admin-assigned.
- Referral reward: pay on approval + first 3 completed jobs (DECIDE amounts).
- Money model: customer pays into escrow first, provider matched after, payout to wallet then GCash/Maya/bank.
