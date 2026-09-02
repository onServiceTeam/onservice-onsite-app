# Provider Vetting and Filtering

Purpose: the single filtering document for who we let onto the platform, how we score them, what tier they land in, and how we approve, reject, hold, suspend, or remove them. This is the trust gate. Trust is the product.

Related docs: `03-provider-recruiting-sop.md` (where applicants come from), `05-provider-onboarding-and-training.md` (what happens after approval), `07-provider-support-sop.md` (account and payout support after they are live), `10-money-and-compliance-ops.md` (commission, payouts, BIR/NPC), `11-admin-system-training-manual.md` (full admin app walkthrough), `13-policies-codes-and-templates.md` (provider code of conduct, the per-category skills question bank, and the template library).

---

## 0. What a great onService provider is (the quality bar)

Before the checklists and scores, agree on what we are filtering FOR. The funnel below exists to find this person and to keep everyone else off the platform. If a step does not help us tell these two apart, cut it.

A great onService provider is someone we would be happy to send to our own mother's home. In concrete, checkable terms, they are:

- **A real, traceable person.** Government ID and selfie match the same face and the same name on the application. NBI clearance is current (issued within 6 months) and clean of anything that touches a stranger-in-your-home risk (theft, violence, sexual offenses). No identity gaps we cannot explain.
- **Genuinely skilled in the category they claim.** They can answer the per-category skills questions in `13-policies-codes-and-templates.md` correctly, including the safety question, and they can show evidence of past work (photos, a short video, a TESDA or PRC certificate where the trade calls for one). They picked categories they can actually do well, not a long list to catch more jobs.
- **Reliable.** They understand the intended paid-before-match model, that an
  offer expires quickly, and that no-shows leave a customer stranded. E14 means
  support must verify a real paid/held state rather than assuming an external
  browser attempt succeeded. They have a working phone, charged, with
  notifications on. References describe someone who shows up.
- **Professional and safe.** Clear communicator in chat, respects a customer's home, wears the shirt and shows the ID, uses change orders instead of side cash, and stops when a job is beyond their competence. On the electrical and aircon trades, they never give a wrong safety answer.
- **On the platform to stay on the platform.** They get the trust model: escrow, ratings, the dispute window, on-app communication. They are not looking to peel customers off into cash deals.

Make this concrete with three checkable thresholds the team can hold to (each an editable starting target):

> **Set (editable):** the **approval bar** is a vetting scorecard of **80 of 100** (Section 3), every hard requirement in Section 1 met, no auto-fail triggered, and the per-category skills check passed with no safety-question miss. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** the **staying bar** (what keeps a provider in good standing after approval) is an average rating of **4.5+**, fewer than **2** cancellations in any rolling 30 days, **zero** confirmed safety or trust incidents, and a current NBI clearance. Falling below this is what triggers the review and probation rules in Section 12. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** the **great bar** (the providers we promote, feature, and protect) is an average rating of **4.7+**, an acceptance rate of **80%+**, on-time arrival **90%+**, and zero open disputes. This lines up with the Pro and Elite tier gates in Section 5 and the green bands in `12-quality-standards-and-kpis.md`. _Recommended default. To change it, edit here and anywhere this value is referenced._

These three bars are the spine of this document. Section 1 to Section 8 are about clearing the approval bar. Section 12 is about holding the staying bar. The tier ladder in Section 5 is about rewarding the great bar.

---

## 0a. How we win on trust and quality (market differentiation)

We do not compete on being the cheapest place to find a tradesperson. We compete
on being the place a customer can trust without knowing the person. This section
describes the intended trust model. E10/F#10, E14, and the chat limitation below
mean not every historical promise is currently launch-ready; operators must
distinguish implemented controls from held claims.

Who we are beating, and how:

| We beat... | by... |
|---|---|
| The Facebook-group / word-of-mouth informal economy (a stranger who may not show, may not be who they say, takes cash, leaves no record) | ID + NBI review before activation, server-backed paid/escrow status for supported payments, a 48-hour dispute-filing path, and an on-app record of the job. E18 means staff must not claim every accepted case still has held funds. |
| Other booking apps that sign up anyone and let ratings sort it out later | A real vetting gate BEFORE the first job: scored scorecard, identity match, skills check, references, and a 3-job probation with mandatory before/after photos |
| Off-platform cash deals (the thing even a good provider drifts toward) | The trust the customer loses the moment they leave the app: verified payment/escrow records, the dispute path, and suki history. Off-platform attempts can be flagged and are grounds for review/suspension. Do not promise a guarantee amount while E10/F#10 is open. |

The five things that are ours to defend, and what each does for the customer:

1. **Vetting rigor (the front door).** We reject before we admit. A customer never has to be the one who finds out a provider was a fraud, because the scorecard, identity match, NBI check, skills check, and references did it first. This is the single biggest difference from the informal economy and from sign-up-anyone apps. The rest of this document is how we keep this rigorous and honest.
2. **Verified payment and escrow controls.** The intended flow holds a
   server-verified payment before matching and releases it after confirmation or
   the configured auto-confirm. Provider suspension can freeze in-flight
   release for admin resolution. E14 blocks the current external hosted
   authorization entry, so an `awaiting_payment` record or browser redirect is
   not held money.
3. **Documented dispute and evidence path.** Customers can file a dispute and
   attach evidence; support/admin resolve the actual booking and escrow record.
   E10/F#10 prohibits promising a ₱10,000/₱20,000 guarantee, fund contribution,
   insurance classification, or automatic make-whole outcome until Philippine
   counsel approves the exact protection model and wording.

4. **Suki loyalty (repeat trust, both sides).** Customers build a suki history (`new` / `regular` / `suki` / `super_suki`) the more they book. A vetted provider who does good work gets requested again and climbs the provider tier ladder (lower commission as they prove themselves). Trust compounds: the customer trusts the platform, then trusts a specific provider, then keeps coming back. The informal economy cannot offer a verified, rated, repeatable relationship with recourse behind it.
5. **The on-app evidence record (accountability).** Booking state, status events,
   GPS check-in when available, job photos, change orders, and dispute evidence
   create an auditable record. Customer/provider chat sending and photo delivery
   remain unreliable under launch limitation §25, so urgent coordination uses
   the call action and formal evidence uses the job-photo/dispute flows.

What this means for the vetting team: you are the front door for the trust
controls above. Verified payment/escrow, suki history, disputes, and evidence
only help when the person at the customer location was actually vetted. Do not
wave someone through to hit a recruiting number.

---

## 1. The eligibility bar (must-haves)

A provider does not get approved unless every line below is true. The first three are enforced in the admin app itself: the Approve button refuses to fire unless `nbi_clearance_url`, `government_id_front_url`, and `selfie_url` are all on file. The rest are policy we enforce by eye in the review queue.

Hard requirements:

- [ ] Government ID, front and back. Accepted IDs: National ID, Passport, Driver's License, or UMID. Name on the ID matches the application.
- [ ] NBI Clearance, issued within the last 6 months. (The mobile form hints this; we hold the line at review.)
- [ ] Selfie. Used for a visual face-match against the government ID. Note: there is NO automated liveness/face-match in v1.0. An admin compares the selfie to the ID by eye in the Provider Review queue. (Onfido/Persona wiring is a v1.1+ item.)
- [ ] Inside the selected provider market. Submission verifies the exact lat/lng against an Admin-configured active, soft-launch, or recruiting `service_areas` boundary and creates its primary `provider_service_areas` link (Metro Cebu is the default market: Cebu City, Mandaue, Lapu-Lapu, Talisay).
- [ ] At least 1 service category selected (the app allows 1 to 10).
- [ ] Independent Contractor agreement accepted (`icAgreementAccepted: true` at submission, timestamped server-side).
- [ ] Service radius between 1 km and the live **Max Service Radius** in Admin Settings (50 km at the time of this audit, hard-bounded to 5-100 km). The application, provider change request, approval, and direct admin override all enforce the same saved maximum.

**Current enforcement warning:** Provider 360 shows both ID sides, but the API
approval prerequisite checks only NBI, government ID front, and selfie. Until
E36 is resolved, the reviewer must manually stop approval when the ID back is
missing; the enabled approval action is not proof that all four files exist.

Policy requirements from DECISION-003 (not all enforced in code, enforce them here):

- [ ] Skills test passed for each category the provider claims (see Section 4).
- [ ] 2 references collected and at least 1 reached and confirmed.
- [ ] Provider understands the 3-job probation with mandatory before/after photos.

> **Set (editable):** the app does not store a `references` field or a `skills_test_result` field today, and we will not add one for launch. Record both in the provider's admin Notes (category `general` or `quality`) until a dedicated field is built. _Recommended default. To change it, edit here and anywhere this value is referenced._

Optional at application (nice to have, not blocking):

- [ ] NBI Expiry Date entered (lets the expiry-warning worker do its job, see Section 7).
- [ ] Government ID Number entered.
- [ ] TESDA or other certification uploaded (required only for Elite tier).
- [ ] Proof of address, business permit, tax certificate (the `provider_documents` store supports these kinds; collect when the category or city needs them).

### Documents and checks required before you click Approve (the full list in one place)

Use this as the pre-approval checklist. The first three are enforced by the app (the Approve button refuses without them). The rest you enforce by eye and by note.

| Item | Required? | What good looks like | What disqualifies |
|---|---|---|---|
| Government ID, front and back | Yes (app-enforced front) | National ID, Passport, Driver's License, or UMID. Readable, not expired, name matches the application | Unreadable, expired, name mismatch, only one side |
| Selfie / face check | Yes (app-enforced) | Clear face that matches the ID by eye. A live video selfie in the interview if the upload was poor | Different person from the ID, hidden face, refusal to do a live check when the upload was unclear |
| NBI clearance | Yes (app-enforced) | Issued within the last 6 months, name matches, no disqualifying hit | Older than 6 months, name mismatch, theft/violence/sexual-offense hit, forged |
| Proof of skill / certification | Where the trade needs it | Photos or short video of past work for all trades; a TESDA or PRC certificate for electrical work and for Elite tier | No evidence of any past work; a claimed cert that cannot be verified |
| 2 references | Yes (policy) | 2 collected, at least 1 reached and positive, not relatives | Both unreachable, negative, or a relative posing as a customer |
| Skills check passed | Yes (policy) | 4 of 6 per-category questions correct, no safety-question miss | A wrong safety answer, or fewer than 4 correct |
| Inside a service area | Yes | Lat/lng inside a configured market, realistic radius | Outside every operating market with no launch planned |
| IC agreement accepted | Yes (app-enforced) | `icAgreementAccepted: true`, timestamped server-side | Not accepted (cannot submit) |

Selfie/liveness note: there is no automated liveness or face-match in v1.0. The selfie is reviewed by eye against the ID in the Provider Review queue. If the uploaded selfie is at all unclear, do a live face check during the interview (Section 4a, Group 1) before approving. Onfido/Persona automated liveness is a v1.1+ item.

### Red flags (stop and do not approve)

Any one of these is a hard stop. Reject (with the matching reason code from Section 8) or, where it is a document-quality problem, HOLD for a clean re-upload. These are also the auto-fails in Section 3.

- The selfie and the government ID are clearly different people.
- The NBI clearance shows a serious unresolved hit relevant to home-services safety: theft, violence, sexual offenses.
- Any document looks forged, edited, or tampered with (mismatched fonts, altered dates, a recycled image).
- The applicant lies about or hides an NBI record, then it shows up on the clearance.
- A wrong answer on a safety question in the skills check (electrical and aircon especially).
- The applicant pushes for cash up front or for taking customers off-platform during the interview.
- A duplicate application, or an application using someone else's identity or documents.
- References cannot be confirmed, or turn out to be relatives posing as customers, or are negative on honesty/safety.

Softer flags (not an automatic reject, but lower the score and probe harder): a long list of claimed categories with evidence for only one, a casual attitude toward cancelling, a borrowed or shared phone, an address that does not line up with the service area, no proof of any past work.

---

## 2. The vetting funnel (stages)

An applicant moves through these stages in order. Each stage is a gate: if a stage fails hard (an auto-fail), stop and reject. If a stage is just incomplete or unclear, HOLD and request the missing item. Only an applicant who clears every stage gets scored and approved.

```
Application submitted (status = pending, applied_at set)
        |
   [ Stage A ] Application + document completeness  -> missing? HOLD, request docs
        |
   [ Stage B ] Document / identity check            -> ID vs selfie, ID number, name match
        |
   [ Stage C ] NBI clearance check                  -> issued <6 months, name match, no disqualifying hit
        |
   [ Stage D ] Skills + experience evidence         -> per-category skills check, proof of past work, certs
        |
   [ Stage E ] Interview + references               -> interview script (Section 4a), 2 references, 1+ confirmed
        |
   [ Stage F ] Service area + radius                -> inside an operating market, realistic radius
        |
   [ Stage G ] Score the scorecard                  -> Section 3, pass threshold 80/100
        |
   APPROVE -> 3-job probation (Section 12) -> full standing
   REJECT  (reason code R01-R10, Section 8)
   HOLD    (leave at pending, message for the missing item, log in Notes)
```

What is checked at each stage, in one place:

| Stage | What you are checking | Pass condition | Where it scores |
|---|---|---|---|
| **A. Application + documents** | All required fields filled; gov ID front + back, NBI, selfie all uploaded and readable | Nothing missing; images clear enough to judge | Gates the rest. Missing = HOLD |
| **B. Document / identity** | Selfie face matches the ID face (by eye); name on ID matches application; ID not expired; ID number recorded | Same person, same name, valid ID | Criterion 1 (25 pts) |
| **C. NBI clearance** | Issued within 6 months; name matches; no disqualifying hit (theft, violence, sexual offenses) | Current, name matches, clean or explainable | Criterion 2 (25 pts) |
| **D. Skills + experience** | Per-category skills questions from doc 13 answered; proof of past work (photos/video); TESDA/PRC cert where the trade needs it | 4 of 6 skills questions correct, no safety miss; some real evidence of past work | Criterion 3 (20 pts) |
| **E. Interview + references** | Short interview using the Section 4a script; 2 references collected, at least 1 reached and positive | Interview answers consistent and sensible; 1+ reference confirms reliability | Criteria 4 + 6 (10 + 10 pts) |
| **F. Service area + radius** | Provider lat/lng inside a configured market; service radius 1 to 50 km and realistic for where they are | Inside an active or recruiting market | Criterion 5 (10 pts) |
| **G. Score** | Add up the scorecard, apply the pass marks and auto-fails | 80+ and no auto-fail | Section 3 |

An applicant lands in the **Providers** page filtered to `status = pending` (the Dashboard has a "pending providers" link straight to `/providers?status=pending`). Work the queue oldest-first by `applied_at`. The interview and reference calls (Stage E) happen outside the app; schedule them once Stages A to D look clean, so you do not spend time interviewing someone who fails a document check.

---

## 3. Vetting scorecard (the scored approval rubric)

Score each applicant out of 100. This is the rubric that turns the funnel stages into a pass/fail you can defend. Each criterion maps to a stage in Section 2. These weights and the pass mark are starting targets; tune them after the first 50 providers.

| # | Criterion (and the stage it comes from) | Weight | How to score |
|---|---|---|---|
| 1 | Identity verified (Stage B): ID readable, not expired, name matches, selfie matches face | 25 | 25 full match, 12 partial/blurry, 0 mismatch |
| 2 | NBI clearance valid (Stage C): issued <6 months, name matches, clean or explainable | 25 | 25 clean, 10 minor/explained hit, 0 missing or serious hit |
| 3 | Skills + experience evidence (Stage D): skills questions passed, photos/video of past work, certification | 20 | 20 strong (passed skills check + real evidence), 10 some, 0 none or a safety miss |
| 4 | References (Stage E): 2 collected, at least 1 confirmed positive | 10 | 10 both confirmed, 5 one confirmed, 0 none |
| 5 | Service area fit (Stage F): inside an active/soft-launch market, realistic radius | 10 | 10 inside active market, 5 inside recruiting market, 0 outside |
| 6 | Professionalism + reliability signals (Stages E and interview): clear interview answers, complete profile, responsive during application, on-platform mindset, equipment owned | 10 | 10 strong, 5 thin, 0 red flags |

Pass marks (starting targets):

- **80 to 100** - Approve (provided no auto-fail triggered and the skills check had no safety miss). The provider then enters the 3-job probation (Section 12).
- **60 to 79** - Hold, ask for one more thing (better photo, a reference, a clearer NBI, a missing skills answer), then re-score. Holding is not a status; leave them at `pending` and log the reason in Notes.
- **Below 60** - Reject, with a reason code from Section 8.

> **Set (editable):** the approval pass mark is **80 of 100**. This matches the approval bar in Section 0. _Recommended default. To change it, edit here and anywhere this value is referenced._

Auto-fail overrides (any one = reject regardless of total score; these are the Section 1 red flags):

- ID and selfie are clearly different people.
- NBI clearance shows a serious unresolved hit relevant to home-services safety (theft, violence, sexual offenses).
- Document is forged or tampered.
- A wrong answer on a safety question in the skills check.
- The applicant pushed for cash up front or for off-platform deals in the interview.
- Duplicate or identity-fraud application.
- Provider is outside every operating service area and no launch is planned there.

Record the score, the criterion breakdown, and the reason in admin Notes before you act, so the decision is auditable. A one-line note like "Score 84: ID 25, NBI 25, skills 20, refs 5, area 5, prof 4. 1 reference confirmed, other unreachable. Approved." is enough.

---

## 4. Skills verification by category

We do not have an automated skills test in the app. Run this manually and log the result in Notes. The full per-category question bank lives in `13-policies-codes-and-templates.md`; the table below is the quick reference.

| Category | Minimum skills check (starting target) |
|---|---|
| Cleaning | Short video or photos of a past job; confirm they own basic supplies; confirm they understand before/after photos |
| Aircon | Photo proof of a past install/clean; ask 3 troubleshooting questions; TESDA RAC cert is a plus |
| Plumbing | Photos of past work; 3 diagnostic questions (leak, clog, low pressure); ask about tools owned |
| Electrical | Higher bar. Ask for any PRC/TESDA electrical cert; 3 safety questions; reject if safety answers are wrong |

> **Set (editable):** yes, we keep a fixed per-category skills question bank (cleaning, aircon, plumbing, electrical), maintained as a real section in `13-policies-codes-and-templates.md`. The table above stays as the in-context quick reference; the full questions live in doc 13 so they are version-controlled in one place. _Recommended default. To change it, edit here and anywhere this value is referenced._

Certifications: providers can self-add certifications in the mobile app (name, issuing body, default TESDA, certificate number, expiry). The certification stays unverified until an admin marks `is_verified`. A verified certification is mandatory for Elite tier.

---

## 4a. The interview script and application questionnaire (the exact questions to ask)

The application collects documents, categories, market/location, and a vetting questionnaire. Treat those as claims to verify, not a substitute for knowing who the person is. Run a short phone or video interview once Stages A to D look clean (do not interview someone who already failed a document check). Keep it to 15 to 20 minutes. Record the answers in the provider's admin Notes (category `general` or `quality`).

The questions below are grouped by what they reveal, so you know what you are listening for, not just what to ask. You do not have to read them word for word, but cover every group. Bisaya, Tagalog, or English, whatever the applicant is comfortable in.

> **Set (editable):** the interview is a required vetting step (it feeds Stage E and Criteria 4 and 6 on the scorecard). At launch it is a phone or video call by the vetting owner; there is no in-app interview feature. Record answers in admin Notes until a dedicated field exists. _Recommended default. To change it, edit here and anywhere this value is referenced._

### Group 1 - Identity and traceability (confirm they are who the documents say)

1. Please state your full name and your birthday. (Cross-check against the government ID.)
2. What is the address where you currently live, and how long have you been there? (A real, stable address; cross-check against the service area.)
3. Is the phone number you applied with the one you use every day? Do you keep notifications on? (The whole dispatch model depends on this.)
4. Can you do a quick video selfie now, or hold your ID next to your face? (Only if the uploaded selfie was unclear. A live face-match is the strongest signal we have without automated liveness.)

Red flags: name or birthday does not match the ID, evasive about address, a borrowed or shared phone, refusal to do a live face check when the selfie was poor.

### Group 2 - Skills and experience (confirm they can actually do the work)

5. How long have you been doing [category] work, and where did you learn it? (Apprenticeship, TESDA, on the job, family trade. Any honest answer is fine; vagueness is not.)
6. Walk me through the last [aircon clean / outlet repair / deep clean / leak fix] you did. What did you find, what did you do? (You are listening for someone who has actually done the work, not memorized a checklist.)
7. Do you have photos or a short video of past jobs you can send? (Feeds the skills-evidence score.)
8. [Ask 2 to 3 of the per-category skills questions from `13-policies-codes-and-templates.md`, including one safety question.] (The full skills check; a wrong safety answer is a fail.)
9. Which categories did you apply for, and which one are you strongest in? (Listen for someone who picked categories they can do well versus someone casting a wide net.)

Red flags: cannot describe a real recent job, no proof of any past work, wrong answer on a safety question, claims many categories but can only speak to one.

### Group 3 - Reliability (confirm they will show up)

10. How do you decide whether to accept a job? (You want someone who only accepts what they can reach on time, not someone who accepts everything.)
11. A customer booked you for 9:00 AM and you are running 30 minutes late. What do you do? (Right answer: message the customer immediately with a real ETA, through the app.)
12. What would make you cancel a job you already accepted? (Listen for genuine reasons versus a casual attitude to cancelling.)
13. How many jobs a week are you hoping to do, and what other work do you have going on? (Sets expectations and surfaces anyone who cannot realistically be available.)

Red flags: treats cancelling lightly, no plan for being reachable, overcommitted elsewhere, expects to pick and choose far more than accept.

### Group 4 - Professionalism and the platform model (confirm they will represent us well and stay on-platform)

14. The intended model uses a server-verified customer payment held before
    matching, then releases provider earnings after confirmation. How does that
    sound to you? (You want comfort with escrow, not someone who insists on cash
    up front. Do not imply the current E14 external browser flow is live.)
15. A happy customer says "next time just contact me directly, skip the app." What do you say? (Right answer: keep it on the app. This is the off-platform test. A wrong answer here is a serious flag.)
16. The job needs extra work beyond what was booked. How should that be handled? (Right answer: a change order in the app, customer approves and pays first, never side cash.)
17. What do you wear and bring to a job? (Looking for: the onService shirt, visible ID, own basic tools and supplies.)
18. A customer is unhappy with part of the work. What do you do? (Looking for: stay calm, re-do or fix it, escalate through the app if needed, not argue.)

Red flags: wants cash up front, comfortable taking customers off-platform, plans to charge side cash for extras, dismissive about uniform and ID, gets defensive about a complaint.

### Group 5 - Safety and conduct (the non-negotiables)

19. Tell me about a time a job turned out to be unsafe or beyond what you could do. What did you do? (Right answer: stopped, did not improvise, escalated or referred. "I just figured it out" on an unsafe job is a flag.)
20. Is there anything in your NBI record we should know about before we check it? (Gives an honest applicant the chance to explain a minor, unrelated hit. Listen for honesty; a surprise on the NBI after they said "nothing" is its own red flag.)
21. Are you comfortable working in a customer's home, and following their house rules (no smoking inside, ask before moving things, clean up after)? (Sets the baseline of respect for the home.)

Red flags: improvises on unsafe work, hides or lies about an NBI hit, casual about respecting a customer's home or belongings.

### Reference questions (call at least 1 of the 2 references)

Ask a former customer or employer, not a relative. Keep it to four questions:

1. How do you know [applicant], and for how long?
2. What kind of work did they do for you?
3. Did they show up on time and finish the job? Would you hire them again?
4. Was there ever a problem with honesty, safety, or your property?

A reference who hesitates on question 3 or 4, or who turns out to be a relative posing as a customer, does not count as confirmed. Log who you reached and what they said.

---

## 5. Provider tiers and commission rates

Five tiers. Commission is flat per tier (it does not change inside a tier) and is taken off the service price. The provider receives service price minus commission. These are the canonical defaults; they are admin-tunable in **Settings -> Commissions** (`commission_rate_<tier>`), so always confirm the live value there before quoting a provider.

| Tier | Commission | What it means | Requirements to reach it |
|---|---|---|---|
| **Founding** | **10%** | Invite-only launch-batch tier. First 50 providers per city, 10% locked for 12 months. Parallel tier, not a rung on the normal ladder. | Admin-assigned at invite. Never an automatic promotion or a downgrade target. |
| **New** | **15%** | Default tier on signup. | None. Everyone starts here unless invited as Founding. |
| **Verified** | **13%** | Proven on the platform. | 5+ completed jobs, 4.0+ rating. |
| **Pro** | **11%** | Reliable, dispute-free. | 25+ jobs, 4.5+ rating, no open disputes. |
| **Elite** | **9%** | Top tier, lowest commission. | 100+ jobs, 4.7+ rating, a verified certification, no open disputes. |

The standard ladder is New -> Verified -> Pro -> Elite based on completed jobs, rating, verified-certification count, and open-dispute count (open = any dispute not in status `resolved`). Founding sits to the side of the ladder.

Important: the app computes tier eligibility and shows it to the provider, but it does NOT auto-promote. An admin makes the actual tier change (Section 6, the Change Tier action). Build a habit: run a monthly pass on approved providers and promote those who cleared the bar.

Tier also gives a small dispatch matching bonus (Founding 0.5, New 0.0, Verified 0.25, Pro 0.5, Elite 1.0), feeding the dispatch score at a 0.1 weight. Higher tier means a slightly better chance of being offered a nearby job, not a guarantee.

Note: provider tiers are not the same thing as customer Suki loyalty tiers (`new`/`regular`/`suki`/`super_suki`). Do not mix them up.

---

## 6. Approve / Reject / Hold decision rules and the exact admin steps

Provider statuses (the only valid ones): `pending`, `approved`, `rejected`, `suspended`, `deactivated`.

Lifecycle: application -> `pending` -> Approve to `approved` OR Reject to `rejected`. An `approved` provider can be Suspended to `suspended`, then Reactivated back to `approved`. There is no Delete button; removal from active operation is Suspend (or the terminal `deactivated` state, which exists in the system but is not wired to a current button).

Decision rule:

- **APPROVE** when the scorecard is 80+, all four KYC evidence files are on file and reviewed, and no auto-fail triggered. E36 means the ID back is temporarily a manual gate even when the button is enabled.
- **HOLD** when the scorecard is 60 to 79 or a document is unclear. Holding is not a status in the app. In practice you leave the provider at `pending` and message them for the missing item. Log the hold reason in Notes so the next admin knows where it stands.
- **REJECT** when the scorecard is below 60 or any auto-fail triggered.

### How to approve a provider (exact admin steps)

1. Log into the admin app. Note this requires TOTP 2FA, and only `admin`, `super_admin`, or `dpo` roles can enter.
2. Go to **Providers** (`/providers`, Wrench icon in the sidebar). Filter status to **pending**.
3. Click the provider row to open **Provider detail** (`/providers/:id`, the "Provider 360").
4. On the **Profile** tab, review the verification documents: NBI clearance (with expiry), government ID front, government ID back, and selfie. These load through an authenticated admin-only proxy, so you will not see raw storage URLs; that is by design for KYC privacy.
5. Do the identity match by eye: selfie vs ID, name on ID vs application.
6. Check the NBI is within 6 months and the name matches.
7. Confirm service categories and service area look right.
8. Score the scorecard (Section 3). Write the score and notes in the **Notes** tab (category `general` or `quality`).
9. If it passes, go back to the **Providers** list (or use the detail action) and click **Approve**.
   - The system refuses approval if any of `nbi_clearance_url`, `government_id_front_url`, or `selfie_url` is missing, and returns a clean message listing what is missing. It does not yet include `government_id_back_url` in that check. Stop manually if the back image is absent, record the hold in Notes, and follow E36 rather than treating the enabled button as clearance.
   - On success the status flips `pending -> approved`, `reviewed_at` is stamped, an audit row `provider_approved` is written, and the provider gets an "Account Approved" notification.
10. Set the tier if needed. New approvals default to **New** (15%). If this is one of the founding batch, use **Change Tier** to set Founding (reason required, 10+ chars).

### How to reject a provider

1. In **Providers** (or Provider detail), with the provider at `pending`, click **Reject**.
2. Enter a reason. The admin UI requires at least 10 characters. Use a reason code from Section 8 plus a plain-language sentence the provider will actually read.
3. The status flips `pending -> rejected`, the reason is stored, an audit row `provider_rejected` is written, and the provider gets an "Application Declined" notification with your reason.

A rejected provider cannot currently resubmit through the app because the canonical provider row remains on the account and duplicate application is blocked. Do not promise reapplication or collect replacement KYC outside the app. E35 defines the required same-record request-changes/resubmission design.

---

## 7. Document expiry and re-verification

The one that expires on a clock is the NBI clearance.

- The provider row carries `nbi_expiry_date` and `nbi_expiry_notified`.
- A background worker (`checkNbiExpiry`) finds approved providers inside the stored 30-day warning window and marks one shared `nbi_expiry_notified` flag. E62 holds this setting because an early warning prevents the same row from being selected at expiry, while a provider first selected after expiry can be auto-suspended contrary to the manual launch policy.
- In the mobile app the provider sees an NbiStatusBanner that classifies their status as `missing`, `expired`, `expiring`, or `valid`.

Re-verification SOP:

- [ ] When a provider's NBI shows `expiring`, open a support case and request renewal. The approved-provider app does not currently provide a secure NBI renewal submission, so do not promise an in-app upload or collect KYC through chat/email; escalate under E62/E35.
- [ ] When it shows `expired`, the provider should not be taking new jobs. See the auto-suspend decision below.
- [ ] Re-verify a replacement only through the future approved renewal workflow. Provider 360 currently displays the date read-only; do not make an off-platform or direct database update.

> **E62 launch hold:** the intended launch policy is manual chase followed by reasoned manual suspension, but the worker is inconsistent and must not be relied on. Staff review the provider and active-work context manually, open a support case, and escalate suspension. The warning-window setting is read-only until warning, expiry, renewal, and enforcement use separate auditable states.

Other documents (proof of address, business permit, tax certificate, certifications) can also carry an `expires_at` in the document store. Re-check any that are expiry-dated on the same monthly pass you use for tier promotions.

---

## 8. Rejection reason codes

Use a code plus a human sentence. The provider sees your sentence, so keep it kind and specific.

> **Set (editable):** adopt the R01-R10 rejection taxonomy below as the standard set. _Recommended default. To change it, edit here and anywhere this value is referenced._

| Code | Meaning | Re-apply possible? |
|---|---|---|
| R01 | NBI clearance missing or older than 6 months | Yes, with a fresh NBI |
| R02 | NBI clearance shows a disqualifying record | No (case by case) |
| R03 | Government ID unreadable, expired, or incomplete (front/back) | Yes, with a clear ID |
| R04 | Selfie does not match the government ID | Yes, with a correct selfie |
| R05 | Suspected forged or tampered document | No |
| R06 | Outside every operating service area | Yes, when we launch their area |
| R07 | Failed skills check for the claimed category | Yes, after training/cert |
| R08 | References could not be confirmed or were negative | Yes, with new references |
| R09 | Duplicate or fraudulent application | No |
| R10 | Incomplete application after a hold (provider never sent the missing item) | Yes |

The **Re-apply possible?** column is the intended policy classification, not a
current app capability. E35 blocks every rejected canonical provider from
resubmitting today. Do not promise the Yes outcomes until the same-record,
audited resubmission flow exists.

Copy-paste rejection message template (SMS/email, keep under 480 chars):

```
Hi [Name], thanks for applying to onService PH. We can't approve your
application right now because: [plain reason]. The app cannot securely reopen
a rejected application yet, so please do not send ID or NBI files by chat or
email. Reply here or email providers@onservice.ph so we can record your case
and contact you when the in-app correction path is available. - onService PH Team
```

---

## 9. Suspension and removal criteria

Suspension pulls a provider out of dispatch immediately (matching only considers `status = approved` AND `is_available = TRUE`).

When to suspend (starting targets, tune after launch):

- [ ] Confirmed safety or trust incident (theft, harassment, no-show with a customer left stranded).
- [ ] A dispute resolved as `refund_with_suspension` (this auto-suspends as part of the resolution).
- [ ] Repeated cancellations. Config warns at 3 cancellations in 30 days (`providerCancellationWarningThreshold`) and signals auto-suspend at 5 in 30 days (`providerCancellationSuspendThreshold`). Counts live on the provider row.
- [ ] Expired or fraudulent documents discovered after approval.
- [ ] Chronic low ratings (see also the dispatch rating floor below).

What the Suspend action does (important, read this before you click it):

- Flips `approved` (or `pending`) -> `suspended`.
- In the SAME transaction, it flags every in-flight booking for that provider (statuses `provider_en_route`, `provider_arrived`, `in_progress`, `completed_by_provider`) by stamping `provider_suspended_during_booking_at`. That stamp makes the escrow release path refuse to pay out until an admin resolves the booking. So suspending mid-job freezes that job's money on purpose. Resolve those bookings (force-complete, reassign, or dispute path) deliberately; do not leave a customer's money stuck.
- Writes an audit row `provider_suspended` with the count of flagged bookings.

How to suspend (admin steps):

1. **Providers** -> open the provider -> **Suspend**.
2. Enter a reason (required). Be specific, this is audited.
3. Handle any frozen in-flight bookings from the **Bookings** page or **Dispatch Console**.

How to reactivate:

1. **Providers**, filter to `suspended`, open the provider, click **Reactivate**.
2. Status flips `suspended -> approved`, audited as `provider_reactivated`. Confirm the reason for suspension is actually resolved first. For NBI cases, do not reactivate from an emailed/chat document or direct database update; E62 requires an approved renewal and verification workflow first. Other examples include a closed incident with recorded evidence.

Removal: there is no hard delete in the admin UI and we do not delete provider records (they carry financial and audit history). To take someone off the platform for good, suspend them and leave them suspended. The `deactivated` status exists as a terminal state and is filterable, but no current admin button sets it.

Dispatch rating floor (a quieter filter): a provider is dropped from auto-dispatch only once `total_reviews >= 5` AND `rating < 2.5` (both admin-tunable: `matching_min_rating`, `matching_min_rating_reviews`). New providers with few reviews are never filtered out for being new. This is automatic and separate from suspension. If a provider is below the floor, review them for a manual suspension decision rather than relying only on the silent dispatch drop.

---

## 10. Service-area assignment and change requests

A provider is tied to markets through `provider_service_areas` (with an `is_primary` flag) and also carries their own `service_radius_km` plus lat/lng/city/province.

Service-area changes need admin approval (gated since v1.0). The provider opens **Profile > Service Area**, chooses an active or soft-launch market, captures a fresh location pin, selects a radius no higher than the live Admin Settings maximum, and enters a 10-500 character reason. One pending request per provider is allowed. Their current matching coverage remains unchanged while it is pending. The provider may withdraw a mistaken pending request after an in-app confirmation; withdrawal also leaves approved coverage unchanged and allows a corrected request.

The request appears at the top of Admin **Service Areas**. Review the Provider 360 link, current and requested market, old and proposed radius, exact proposed pin, and provider reason. Ordinary support/admin/DPO users may inspect the queue; only `super_admin` may approve or reject. Approval revalidates the current setting and area boundary, then atomically updates the provider's primary area, radius, coordinates, city, and province. If active provider coverage changed after submission, approval fails rather than overwriting the newer state; reject it and request a fresh submission. Rejection leaves all active matching data unchanged. Both outcomes require an operator reason, write the admin audit (`service_area_change_approved` / `service_area_change_rejected`), and notify the provider. Do not promise an instant area switch.

For how many approved providers it takes to flip an area live (5 per launch category to reach `soft_launch`, 8 in the lead category to flip it to `active`), see `03-provider-recruiting-sop.md`.

---

## 11. Daily/weekly vetting checklist

Vetting runs during support hours, Monday to Saturday, 8:00 AM to 6:00 PM PHT.

Daily:

- [ ] Clear the pending queue (`/providers?status=pending`), oldest first.
- [ ] Approve, reject, or hold each, with a Notes entry and a scorecard total.
- [ ] Action any provider whose NBI banner flipped to `expired`.
- [ ] Review service-area change requests.

Weekly:

- [ ] Review providers near a cancellation threshold (3+ in 30 days) and warn them.
- [ ] Review any provider below the rating floor for a suspension decision.

Monthly:

- [ ] Tier promotion pass: promote providers who cleared the next rung (jobs, rating, certs, zero disputes). Remember the app does not auto-promote.
- [ ] Re-check expiry-dated documents (NBI, certifications, permits).

---

## 12. Post-approval quality monitoring (probation, strikes, offboarding)

Approval is the start of the trust relationship, not the end of vetting. A provider holds the **staying bar** from Section 0 (4.5+ average rating, fewer than 2 cancellations in any 30 days, zero confirmed safety incidents, current NBI) to stay in good standing. This section is how we watch for it and what we do when it slips. Most of these signals are visible on the provider's admin detail page and on the Dashboard; the quality KPIs and the monthly scorecard live in `12-quality-standards-and-kpis.md`.

### 12.1 The 3-job probation (the most important early filter)

Every newly approved provider is on probation for their first 3 jobs. This is policy (DECISION-003), not enforced in code, so ops watches it deliberately. See `05-provider-onboarding-and-training.md` for the buddy/QA process.

- [ ] Before/after photos are **mandatory** on all 3 probation jobs. Spot-check that they were actually uploaded (Booking detail, Evidence tab). No photos is a probation fail to address before more jobs.
- [ ] A buddy/QA owner is on standby for the first job and lightly involved through job 3.
- [ ] A serious problem on a probation job (no-show, a dispute, an off-platform attempt, a safety lapse) means stop, do not let them take more jobs, and decide between retraining and removal.

> **Set (editable):** probation is the first **3 completed jobs**, with mandatory before/after photos and a buddy on standby. Clearing probation means all 3 done with photos, no dispute, no safety or off-platform incident. _Recommended default. To change it, edit here and anywhere this value is referenced._

### 12.2 Rating and reliability thresholds (the ongoing watch)

| Signal | Green (good standing) | Watch (review + coach) | Act (suspension decision) |
|---|---|---|---|
| Average rating (after 5+ reviews) | 4.5+ | 4.3 to 4.49, or any 1-star without a logged reason | Below 4.3, or below the 2.5 dispatch floor |
| Cancellations (rolling 30 days) | 0 to 1 | 3 (the warning threshold) | 5 (the auto-suspend signal) |
| Disputes | 0 open | 1 open, or a `free_redo` resolution | A `refund_with_suspension` resolution (auto-suspends) |
| Repeated 1-star ratings | none | the `provider_consecutive_one_star` alert fires | a pattern with confirmed cause |
| NBI clearance | `valid` | `expiring` in the manual queue (worker notice is unreliable under E62) | `expired`; reasoned manual suspension review required |
| On-time arrival | 90%+ | 75 to 89% | under 75% with complaints |

The numbers above are the same ones used by the app's config and by `12-quality-standards-and-kpis.md`. The dispatch rating floor (`total_reviews >= 5` AND `rating < 2.5`) is automatic and silently drops a provider from offers; treat it as a trigger to review for a manual suspension, not as the whole response.

### 12.3 The strike rule (how to be fair and consistent)

Cancellations and ratings already have built-in thresholds. For everything else (rudeness, a minor off-platform nudge that was not a full bypass, sloppy work that did not reach a dispute, repeatedly ignoring the photo rule), use a simple, logged strike rule so the team is consistent and the provider is treated fairly.

> **Set (editable):** **three strikes in a rolling 90 days = suspension review.** A strike is a logged, confirmed conduct or quality problem that is below the bar for an immediate suspension. Strike 1 is a coaching message, strike 2 is a formal warning with a note that the next one triggers review, strike 3 is a suspension review by the Operations Lead. Confirmed safety or trust incidents (theft, harassment, a no-show that stranded a customer, a real off-platform deal) skip the strike count and go straight to suspension. Log every strike in admin Notes (category `quality`) with the date and what happened. _Recommended default. To change it, edit here and anywhere this value is referenced._

### 12.4 What triggers an admin review (the signal list)

Open a provider review when any of these fire. A review means: read the provider's recent jobs, ratings, disputes, and Notes, then decide coach / warn / suspend / no action, and log the decision.

- A confirmed safety or trust incident (always, immediately).
- The `provider_consecutive_one_star` alert.
- Hitting the cancellation warning (3 in 30 days) or suspend signal (5 in 30 days).
- Any dispute filed against them, and especially a `refund_with_suspension` resolution (which auto-suspends).
- Dropping below the dispatch rating floor (5+ reviews, under 2.5).
- A probation job that went wrong (Section 12.1).
- NBI flipped to `expired` and the provider is ignoring the renewal chase.
- A third strike in 90 days (Section 12.3).
- A pattern flagged in chat: repeated off-platform attempts (`messages.is_flagged`).

### 12.5 Offboarding (when to remove someone for good)

There is no hard delete; removal is Suspend-and-leave-suspended (Section 9). Offboard a provider for good when:

- A confirmed serious safety or trust incident (theft, violence, harassment, sexual misconduct).
- A forged document or identity fraud discovered after approval (also a reason to flag for fraud review).
- A real, repeated off-platform-deal pattern after a warning.
- They reach the suspension threshold on cancellations or ratings and do not improve after a warning and a coaching window.

Offboarding steps: suspend with a specific, audited reason (Section 9), resolve any frozen in-flight bookings deliberately so no customer money is stuck, and leave them suspended. Do not re-approve a provider offboarded for a safety, fraud, or theft reason. A provider offboarded for a fixable reason (lapsed NBI, fixable reliability) can be reconsidered later as a fresh review.

### 12.6 Coaching before removal (keep the good ones)

A provider who is genuinely skilled but slipping is worth saving; recruiting and vetting a replacement costs more than a coaching call. Before a suspension review for a non-safety issue, try a coaching message: name the specific problem (late twice this week, two re-dos, photos missing), point to the standard, and offer a fix (retraining on the app flow, a refresher on the skills standard). Log it as the strike-1 coaching step. This does not apply to safety, fraud, or off-platform-deal cases, which skip straight to suspension.

---

## 13. Open decisions set in this doc

- **Quality bars (Section 0):** approval bar 80/100 + all hard requirements + no auto-fail; staying bar 4.5+ rating, under 2 cancellations/30 days, zero safety incidents, current NBI; great bar 4.7+ rating, 80%+ acceptance, 90%+ on-time, zero open disputes. (editable)
- **Protection wording (Section 0a):** E10/F#10 is an external legal hold. No
  guarantee amount, contribution rate, insurance classification, or automatic
  outcome is an editable operations default; counsel must approve it first.
- **Interview is a required vetting step (Section 4a):** phone/video call by the vetting owner, answers logged in admin Notes. (editable)
- **References and skills-test storage:** keep both in the provider's admin Notes for launch (no dedicated `references` or `skills_test_result` field). (editable)
- **Per-category skills question bank:** yes, a fixed bank per category, maintained as a real section in `13-policies-codes-and-templates.md`. (editable)
- **Probation (Section 12.1):** first 3 completed jobs, mandatory before/after photos, buddy on standby. (editable)
- **Strike rule (Section 12.3):** 3 strikes in a rolling 90 days = suspension review; safety/trust incidents skip the count. (editable)
- **NBI expiry handling:** intended policy is manual chase then manual suspend, but E62 holds the inconsistent worker and missing renewal workflow. (held)
- **Rejection reason codes:** adopt the R01-R10 taxonomy in Section 8. (editable)

Each item above is the working default so the team is never blocked. To change one, edit it here and anywhere this doc references it.
