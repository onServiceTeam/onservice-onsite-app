# Provider Onboarding and Training

Purpose: take an approved provider from "approved" status to a confident first paid job, and set the rules they live by. Covers account activation, profile completion, the provider app walkthrough, payout setup, the buddy/QA check on job one, and the Provider Code of Conduct.

This doc picks up where `04-provider-vetting-and-filtering.md` ends (approval) and hands off to `07-provider-support-sop.md` (ongoing support). See `12-quality-standards-and-kpis.md` for the scorecards and `13-policies-codes-and-templates.md` for the full template library.

---

## 1. Where onboarding starts

Onboarding begins the moment an admin clicks **Approve** on the provider in the admin **Providers** page (`/providers`). At that point:

- The provider row flips from `pending` to `approved`. Approval is refused unless the three KYC fields are already on file: NBI clearance, government ID front, and selfie. So a provider you are onboarding has already cleared document review.
- The system sends an **"Account Approved"** notification to the provider's app.
- The provider lands on the standard tier **new** (15% commission) unless an admin set them to **founding** (10%, invite-only launch batch). Tier is shown in the admin Provider detail page (`/providers/:id`).

Approval does not make a provider visible to customers yet. A provider only enters auto-dispatch when both conditions are true: `status = approved` AND `is_available = TRUE` (the "online" toggle in their app). The 7-day plan below exists to get them from "approved" to "online and confident."

---

## 2. Onboarding checklist (per provider)

Work top to bottom. Boxes are for the ops owner running the onboarding, not the provider.

**Account and identity**
- [ ] Approval confirmed in admin; "Account Approved" notification fired
- [ ] Provider logs in by phone number + OTP (no password). Confirm they can receive the 6-digit code
- [ ] Tier confirmed (new vs founding). If founding-batch, confirm the invite is logged
- [ ] NBI status checked: open the provider's app NBI banner or admin Profile tab. Status must be `valid`, not `expiring`/`expired`/`missing`

**Profile completion**
- [ ] Business name correct (2 to 200 chars)
- [ ] Service categories set (1 to 10): cleaning, aircon, plumbing, electrical, etc.
- [ ] Per-service base price set where the provider offers fixed-price work (validated against the subcategory min/max in the catalog)
- [ ] Service radius set (onboarding caps at 50 km; admin can widen later up to 200 km)
- [ ] Service area assigned and primary area flagged (e.g. Cebu City). Ops sets the primary area during onboarding; later area changes go through the approval queue (`service_area_change_requests`). See the open decision at the end of this doc.
- [ ] Profile photo and short bio added (helps acceptance and ratings)

**Payout setup**
- [ ] Payout method added: GCash, Maya, bank InstaPay, or bank PesoNet
- [ ] Destination validated (GCash/Maya = 11-digit `09XXXXXXXXX`; bank = 8 to 16 digit account number)
- [ ] Provider understands the ₱100 minimum withdrawal and the 3-business-day processing target
- [ ] TIN collected before first payout (format `999-999-999-NNN`). Not required at application; the app accepts it as optional. It is needed before the provider reaches ₱500,000 YTD platform income, when BIR withholding starts (Form 2307). See the open decision at the end of this doc.

**Training and first job**
- [ ] App walkthrough completed (Section 4)
- [ ] Code of Conduct read and acknowledged (Section 7)
- [ ] Buddy/QA owner assigned for first job (Section 6)
- [ ] First job completed with before/after photos
- [ ] Onboarding marked done; provider moved to normal support

---

## 3. The 7-day activation plan

Starting targets. Tune as the team learns what works.

| Day | Goal | Who | Done when |
|---|---|---|---|
| Day 0 | Approve, send welcome, confirm login | Recruiting/Ops | Provider logs in, sees "Approved" |
| Day 1 | Profile, categories, radius, service area | Ops | Profile 100% complete |
| Day 1 | Payout method added and validated | Ops | Test of destination format passes |
| Day 2 | App walkthrough (offers, jobs, completion, wallet) | Ops/Trainer | Provider can explain the 45-second offer in their own words |
| Day 2 | Code of Conduct acknowledged | Ops | Acknowledgement logged |
| Day 3 | Go online for the first time, low-volume window | Provider | `is_available = TRUE`, provider present |
| Day 3 to 5 | First job with buddy/QA on standby | Buddy | Job hits `completed_by_provider` with photos |
| Day 5 | First-job debrief, fix gaps | Buddy | Issues logged, retraining if needed |
| Day 7 | Onboarding review, hand to normal ops | Ops | Checklist fully ticked |

If a provider stalls (no first job by Day 7), flag in `07-provider-support-sop.md` for follow-up. Do not leave half-onboarded providers online.

---

## 4. Provider app walkthrough

Run this live with the provider, ideally screen by screen on their phone. Bisaya, Tagalog, or English, whatever they are comfortable with.

### 4.1 Going online (availability)

Approved is not the same as online. The provider flips an availability toggle (`is_available`). Only when online do they receive job offers. Teach them to go offline when they cannot work, so they do not collect offers they will decline. Decline rate hurts their acceptance score, which feeds dispatch ranking.

### 4.2 How job offers work (the 45-second cycle)

This is the part to get right. When a customer books a fixed-price job near them:

1. The system ranks nearby online providers and sends the offer to **one provider at a time**.
2. The provider has **45 seconds** to **Accept** or **Decline**. After 45 seconds with no action, the offer **expires** and rolls to the next provider.
3. The system tries up to **10 providers** before giving up and telling the customer "no provider available."

Tell the provider plainly:
- Keep the app open and notifications on. A missed offer is a lost job and a hit to your acceptance rate.
- 45 seconds is short on purpose. Decide fast.
- Declining is fine when you genuinely cannot take it, but a pattern of declines pushes you down the ranking.

### 4.3 The money is already paid (instant-pay, escrow)

> NOTE: the fixed-price **instant-pay** model (customer pays first, provider matched after) is now live. It was merged to master and deployed on 2026-06-19 (E03 closed). Train providers on the instant-pay framing because that is how the product works: the job is paid into escrow before they are matched, so when a provider accepts an offer the money is already held.

Under instant-pay, by the time you see the offer the customer has already paid the full amount into onService escrow. The platform holds that money. You are not chasing the customer for cash. When you finish and the customer confirms (or after 24 hours of auto-confirm), escrow releases your share to your wallet automatically. This is the trust pitch: no haggling, no "balik ko next week," the money is real and waiting.

Key numbers to share:
- Your commission is flat for your tier (see Section 5). Everything else is yours.
- Tips are 100% yours, no commission. Tips are wallet-funded for now.
- After the customer confirms, or 24 hours pass without a dispute, escrow releases to your wallet.

### 4.4 Working a job (status flow the provider drives)

Walk them through the buttons in order. The provider advances these statuses from their app:

| Step | Status | What the provider does |
|---|---|---|
| Accept offer | `matched` / `paid` | Tap Accept within 45s |
| Head to site | `provider_en_route` | Tap when leaving |
| Arrive | `provider_arrived` | Tap on site, GPS check-in |
| Start work | `in_progress` | Take BEFORE photos first |
| Finish | `completed_by_provider` | Take AFTER photos, then mark complete |

After "completed by provider," it is the customer's move: they confirm (releases your money), or they file a dispute within 48 hours. If they do nothing for 24 hours, the system auto-confirms and pays you.

### 4.5 Navigation and ETA

There is no in-app phone calling today (the "call" copy on the customer side is aspirational, not built). The live channel is **per-booking chat** (text + photos). Teach the provider to message the customer for ETA, gate codes, parking, and pets. One chat thread per booking; the customer sees read receipts.

Off-platform deals attempted in chat are flagged by the system. Do not do it (Section 7).

### 4.6 Photos (required, not optional)

Before/after photos are mandatory on the 3-job probation and are your defense in a dispute. The provider takes photos in-app on the job:
- BEFORE photos at `in_progress`
- AFTER photos at `completed_by_provider`
- Clear, well-lit, show the actual work area

If a customer files a `damage` or `theft` dispute, they must submit photos too. Your before/after set is what protects you. No photos, weak position.

### 4.7 Change orders (extra work mid-job)

If the job needs work beyond what was booked, the provider raises a **change order** while `in_progress`: description + extra amount + photos. Rules to teach:
- Only during `in_progress`.
- Capped at 50% of the original service price (and a hard ceiling around ₱10,000).
- The customer must approve AND pay before the extra work counts. Approval alone does not move money.
- If the customer approves but does not pay within 24 hours, the change order expires. Do not do the extra work unpaid.

Never do off-the-books extra work for cash. Use the change order.

### 4.8 Wallet and payouts

Earnings land in the provider's in-app wallet (`available_balance`). To cash out they request a payout:
- Minimum ₱100 per withdrawal.
- Methods: GCash, Maya, bank InstaPay, bank PesoNet.
- One payout at a time. Wait for the current one to finish before requesting another.
- Processing target: 3 business days. Admin approves, then marks complete when sent.
- Large payouts (₱500,000+) get held for an AML review by a senior admin before processing. Routine for compliance, not a problem with the provider.

### 4.9 Ratings, reviews, tiers

- Customers rate completed jobs. Average rating and review count show on the provider profile.
- Providers can reply to a review publicly (max 500 chars) and can ask support to contest a fraudulent one.
- Low rating only affects dispatch once a provider has at least 5 reviews and sits below the 2.5 floor. New providers are never excluded for being new.
- Tiers improve commission as the provider proves themselves (Section 5).

---

## 5. Tiers and commission (what the provider keeps)

Commission is flat per tier and comes off the service price. The provider keeps `service price minus commission`, plus 100% of tips. Rates below are the current defaults and are admin-tunable.

| Tier | Commission | How you reach it |
|---|---|---|
| **founding** | 10% | Invite-only launch batch (first 50 per city). Not a step on the ladder, a parallel perk |
| **new** | 15% | Default on signup |
| **verified** | 13% | 5+ jobs and 4.0+ rating |
| **pro** | 11% | 25+ jobs, 4.5+ rating, no open disputes |
| **elite** | 9% | 100+ jobs, 4.7+ rating, a verified certification (e.g. TESDA), no open disputes |

Set expectations clearly: tier promotion is **not automatic**. The app shows the provider their progress toward the next tier, but an admin makes the actual tier change. Tell providers what they are working toward and that ops reviews tier eligibility (cadence per `12-quality-standards-and-kpis.md`).

Service fee (charged to the customer, not deducted from the provider) and the guarantee-fund split are covered in `10-money-and-compliance-ops.md`. The guarantee-fund claim rules (cap, eligibility, clawback) are in `09-disputes-and-resolution.md`.

---

## 6. First-job buddy / QA check

Every provider's first paid job gets a buddy. The buddy is an ops person (or a trusted senior provider) on standby, not on site. The platform has no "buddy" feature today; this is a human ops process. See the open decision at the end of this doc.

**Before the job**
- [ ] Buddy assigned and reachable during the booking window
- [ ] Provider has the address, chat open, and knows to message the customer on the way

**During the job (buddy watches in admin)**
- [ ] Provider tapped `provider_en_route` then `provider_arrived` (GPS check-in present)
- [ ] BEFORE photos uploaded at `in_progress`
- [ ] AFTER photos uploaded at `completed_by_provider`
- [ ] No off-platform contact attempt in chat

**QA scorecard (first job)**

| Item | Pass | Notes |
|---|---|---|
| On time (arrived within window) | [ ] | |
| In onService shirt + visible ID | [ ] | |
| Before/after photos present and clear | [ ] | |
| Polite, professional chat | [ ] | |
| Job done to brief, no unpaid extras | [ ] | |
| Marked complete correctly in-app | [ ] | |
| No off-platform / cash-deal attempt | [ ] | |

**After the job**
- [ ] Debrief within 24 hours (what went well, what to fix)
- [ ] If 2 or more QA items failed, schedule retraining before they take more jobs
- [ ] Log the result so `07-provider-support-sop.md` and tier reviews can see it

Probation note: policy is a 3-job probation with mandatory before/after photos (DECISION-003). The buddy stays lightly involved through job 3, not just job 1.

---

## 7. Provider Code of Conduct

Providers acknowledge this at onboarding (the Independent Contractor agreement is already accepted in-app at application; this is the plain-language behavior version). Acknowledgement is logged. Full legal text lives in the Provider Agreement and `13-policies-codes-and-templates.md`.

**Punctuality**
- Accept only jobs you can actually reach on time.
- Arrive within the booking window. If you are running late, message the customer immediately with a real ETA.

**Uniform and ID**
- Wear the branded onService shirt on every job.
- Carry and show your ID. "ID-verified, NBI-checked pros" is the promise we sell. You are that promise on the doorstep.

**Customer interaction**
- Be polite and professional in chat and in person. Bisaya, Tagalog, or English, whatever the customer prefers.
- Respect the home: ask before moving things, clean up after, no smoking inside.
- Keep all communication on-platform.

**Safety**
- Follow safe work practices for electrical, aircon, and plumbing work.
- Do not take a job you are not competent or equipped to do safely.
- If a situation feels unsafe, stop and contact support.

**No off-platform deals (zero tolerance)**
- Do not solicit cash, "next time book me directly," or contact details to skip the platform. Chat is monitored and off-platform attempts are flagged automatically.
- Off-platform deals leave the customer with no escrow protection, no dispute path, and you with no record if something goes wrong. This is grounds for suspension.

**No-show policy**
- A no-show means a customer paid into escrow and got nothing. It triggers a customer refund plus a platform-funded apology credit, and it counts against you.
- Cancellations are tracked over a rolling 30 days. Starting thresholds: a warning after **3** cancellations in 30 days, **auto-suspension after 5**.
- If you truly cannot make a job, cancel as early as possible so the customer can be rematched. Late cancellations and no-shows are the fastest way to lose your account.

**Honesty on extras**
- Use change orders for any extra work, never side cash. Cap is 50% of the original price; the customer must approve and pay first.

Acknowledgement template (log this):

```
Provider: ____________________   Business name: ____________________
Date: ____________   Onboarding owner: ____________________
"I have read and understood the onService Provider Code of Conduct,
including punctuality, uniform and ID, on-platform only, safety, and
the no-show/cancellation policy. I understand 5 cancellations in 30
days can auto-suspend my account."
Signature / in-app acknowledgement ref: ____________________
```

---

## 8. Copy-paste templates

**SMS / chat: welcome after approval**
```
Welcome to onService! Your account is approved. Open the app and log in
with your number to finish your profile and set up payouts. We will help
you get your first job this week. Reply here if you need anything.
```

**Chat: provider on the way (teach this as the standard opener)**
```
Hi! This is [Name] from onService for your [service] booking. I am on my
way, ETA about [X] minutes. Anything I should know before I arrive
(gate code, parking, pets)? Thank you!
```

**Email: first-job debrief invite**
```
Subject: Quick check-in after your first onService job
Hi [Name], congrats on your first job. Got 10 minutes for a quick call or
chat? We want to hear how it went and make sure payouts and the app are
clear. Reply with a time that works. - onService Ops
```

**Internal: NBI expiry nudge (provider gets an in-app push automatically at 30 days; use this for direct follow-up)**
```
Hi [Name], your NBI clearance expires on [date]. Upload a renewed copy in
the app before then so you can keep getting jobs. Renewals can take time,
so please start now.
```

Support hours for any follow-up the provider needs: Monday to Saturday, 8:00 AM to 6:00 PM PHT. Urgent safety issues escalate via the on-call path even outside those hours.

---

## 9. Open decisions set in this doc

These are recommended defaults. Ken can override any of them. To change one, edit here and anywhere this value is referenced.

> **Set (editable):** Provider TIN is collected **before first payout**, not at application. The app accepts it as optional today; it must be on file before the provider reaches ₱500,000 YTD platform income, when BIR withholding starts (Form 2307). _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** Instant-pay (prepaid-into-escrow) is the framing we train on, and it is now live (merged and deployed 2026-06-19, E03 closed). Providers can be told the job is already paid into escrow when they accept. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** Ops sets the provider's **primary service area during onboarding**. The app does not force it at apply time; later area changes go through the approval queue (`service_area_change_requests`). _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** The first-job **buddy is a human ops process**, run by an ops person or a trusted senior provider on standby. There is no "buddy" feature in the platform. Adjust the role to your team size. _Recommended default. To change it, edit here and anywhere this value is referenced._
