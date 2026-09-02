# Provider Onboarding and Training

Purpose: take an approved provider from "approved" status to a confident first paid job, and set the rules they live by. Covers account activation, profile completion, the provider app walkthrough, payout setup, the buddy/QA check on job one, and the Provider Code of Conduct.

This doc picks up where `04-provider-vetting-and-filtering.md` ends (approval) and hands off to `07-provider-support-sop.md` (ongoing support). See `12-quality-standards-and-kpis.md` for the scorecards and `13-policies-codes-and-templates.md` for the full template library.

---

## 1. Where onboarding starts

Onboarding begins the moment an admin clicks **Approve** on the provider in the admin **Providers** page (`/providers`). At that point:

- The provider row flips from `pending` to `approved`. The server refuses approval unless NBI clearance, government ID front, and selfie are on file. The application policy also requires the government ID back, but the approval API does not yet enforce it; the approving operator must manually verify that fourth file under E36. Do not assume an approved row alone proves the back image was present.
- The system sends an **"Account Approved"** notification to the provider's app.
- The provider lands on the standard tier **new** (15% commission) unless an admin set them to **founding** (10%, invite-only launch batch). Tier is shown in the admin Provider detail page (`/providers/:id`).

Approval does not put a provider into matching yet. A provider enters auto-dispatch only when both conditions are true: `status = approved` AND `is_available = TRUE` (the availability control may say "online" in their app). That toggle means **accepting work**; it is not proof that the app is open or that location is being streamed. The 7-day plan below exists to get them from approved to available and confident.

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
- [ ] Service offerings reviewed against the admin Catalog. Do not train providers to treat their editable base price as the customer booking price while E16 is open; booking creation currently persists the canonical catalog amount, and the provider/catalog price-source decision is unresolved.
- [ ] Service radius set within Admin Settings **Max Service Radius** (50 km at this audit; every later override uses the same live ceiling)
- [ ] Application-created primary service area, exact pin, and radius verified in Provider 360. Later area changes go through the approval queue (`service_area_change_requests`).
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
| Day 3 | Turn on accepting-work availability in a low-volume window | Provider | `is_available = TRUE`, provider confirms they are present and watching offers |
| Day 3 to 5 | First job with buddy/QA on standby | Buddy | Job hits `completed_by_provider` with photos |
| Day 5 | First-job debrief, fix gaps | Buddy | Issues logged, retraining if needed |
| Day 7 | Onboarding review, hand to normal ops | Ops | Checklist fully ticked |

If a provider stalls (no first job by Day 7), flag in `07-provider-support-sop.md` for follow-up. Do not leave a half-onboarded provider set to accepting work.

---

## 4. Provider app walkthrough

Run this live with the provider, ideally screen by screen on their phone. Bisaya, Tagalog, or English, whatever they are comfortable with.

### 4.1 Accepting-work availability

Approved is not the same as available for offers. The provider flips an availability toggle (`is_available`). Only while accepting work do they receive job offers. Teach them to turn it off when they cannot work, so they do not collect offers they will decline. The toggle is not a presence or live-location signal. Decline rate hurts their acceptance score, which feeds dispatch ranking.

### 4.2 How job offers work (the 45-second cycle)

This is the part to get right. When a customer books a fixed-price job near them:

1. The system ranks nearby eligible providers who are set to accepting work and sends the offer to **one provider at a time**.
2. The provider has **45 seconds** to **Accept** or **Decline**. After 45 seconds with no action, the offer **expires** and rolls to the next provider.
3. The system tries up to **10 providers** before giving up and telling the customer "no provider available."

Tell the provider plainly:
- Keep the app open and notifications on. A missed offer is a lost job and a hit to your acceptance rate.
- 45 seconds is short on purpose. Decide fast.
- Declining is fine when you genuinely cannot take it, but a pattern of declines pushes you down the ranking.

### 4.3 How a verified paid offer and escrow work

> NOTE: E03 fixed the instant-pay booking/escrow ordering, but E14 still blocks the current external hosted PayMongo checkout. Train providers on what a real assigned job means: only a booking the server reports as paid/held is funded in escrow. Do not claim every customer payment method is launch-ready or ask a provider to rely on a browser redirect as payment proof.

For an offer the server has actually released to dispatch, the booking is paid and held in onService escrow. The provider should rely on the in-app paid/assigned state, not a customer's screenshot or claim of payment. They are not chasing the customer for cash. Customer confirmation can release the provider share. The worker currently auto-releases after 24 hours while customer filing remains open for 48 hours; E18 records that unsafe contradiction, so do not train the 24-hour timer as a settled protection rule.

Key numbers to share:
- Your commission is flat for your tier (see Section 5). Everything else is yours.
- Tips are 100% yours, no commission. Tips are wallet-funded for now.
- Customer confirmation can release escrow to your wallet. The automatic timer is under the E18 hold because release currently occurs at 24 hours while dispute filing remains open through 48 hours.

### 4.4 Working a job (status flow the provider drives)

Walk them through the buttons in order. The provider advances these statuses from their app:

| Step | Status | What the provider does |
|---|---|---|
| Accept offer | `matched` / `paid` | Tap Accept within 45s |
| Head to site | `provider_en_route` | Tap when leaving |
| Arrive | `provider_arrived` | Tap on site, GPS check-in |
| Start work | `in_progress` | Take BEFORE photos first |
| Finish | `completed_by_provider` | Take AFTER photos, then mark complete |

After "completed by provider," it is the customer's move: they can confirm or file a dispute within 48 hours. The system currently auto-confirms and credits the provider after 24 hours, but that conflicts with the remaining filing window and is tracked by E18. Tell providers that a later accepted dispute may still require staff review; do not promise the 24-hour credit is final while E18 is open.

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
- One payout at a time, including one on an internal large-payout review hold. Wait for the current one to finish or be rejected before requesting another.
- Processing target: 3 business days. Admin records a reason for internal-review clearance where applicable, approval/rejection, and completion; Complete is recorded only after the external transfer was actually sent.
- Large payouts (₱500,000+ by the current setting) get held for an internal compliance review by a senior admin before processing. The hold itself does not mean the provider did anything wrong and does not claim that a legal report was filed or required.

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

The customer service fee is currently 0% and is not deducted from the provider. Its admin-tunable setting and the currently zero fee-derived guarantee contribution are covered in `10-money-and-compliance-ops.md`. Guarantee wording remains subject to legal review; do not expand it during provider training.

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

Probation note: policy is a 3-job probation with mandatory before/after photos (DECISION-003). The buddy stays lightly involved through job 3, not just job 1. The full post-approval monitoring SOP (what clearing probation means, the strike rule, and the signals that trigger a provider review) lives in `04-provider-vetting-and-filtering.md` Section 12. Log probation outcomes there in admin Notes so the tier and quality reviews can see them.

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

**Internal: NBI expiry nudge (use only after manual expiry review; E62 means the automatic push is not reliable)**
```
Hi [Name], your NBI clearance expires on [date]. Please obtain a renewed
copy and reply to your onService support case so we can guide the secure
renewal process. Do not send the document through chat or email. Renewals
can take time, so please start now.
```

Support hours for any follow-up the provider needs: Monday to Saturday, 8:00 AM to 6:00 PM PHT. Urgent safety issues escalate via the on-call path even outside those hours.

---

## 9. Open decisions set in this doc

These are recommended defaults. Ken can override any of them. To change one, edit here and anywhere this value is referenced.

> **Set (editable):** Provider TIN is collected **before first payout**, not at application. The app accepts it as optional today; it must be on file before the provider reaches ₱500,000 YTD platform income, when BIR withholding starts (Form 2307). _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** Train providers that an offer shown by the server as paid/assigned is held in escrow. E03 fixed the internal ordering, but E14 must be resolved before external hosted PayMongo methods are called launch-ready. _Recommended default. To change it, edit here and anywhere this value is referenced._

The provider application now selects an Admin-configured market, verifies the exact operating pin inside its boundary, and creates that market as the provider's primary `provider_service_areas` link in the same transaction as the pending provider. Ops verifies it in Provider 360 rather than recreating it manually. After approval, providers use **Profile > Service Area** to submit a new market, fresh location pin, radius, and reason; current coverage remains active until a super-admin decides the request in Admin **Service Areas**.

> **Set (editable):** The first-job **buddy is a human ops process**, run by an ops person or a trusted senior provider on standby. There is no "buddy" feature in the platform. Adjust the role to your team size. _Recommended default. To change it, edit here and anywhere this value is referenced._
