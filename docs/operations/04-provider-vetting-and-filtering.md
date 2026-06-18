# Provider Vetting and Filtering

Purpose: the single filtering document for who we let onto the platform, how we score them, what tier they land in, and how we approve, reject, hold, suspend, or remove them. This is the trust gate. Trust is the product.

Related docs: `03-provider-recruiting-sop.md` (where applicants come from), `05-provider-onboarding-and-training.md` (what happens after approval), `07-provider-support-sop.md` (account and payout support after they are live), `10-money-and-compliance-ops.md` (commission, payouts, BIR/NPC), `11-admin-system-training-manual.md` (full admin app walkthrough), `13-policies-codes-and-templates.md` (provider code of conduct, the per-category skills question bank, and the template library).

---

## 1. The eligibility bar (must-haves)

A provider does not get approved unless every line below is true. The first three are enforced in the admin app itself: the Approve button refuses to fire unless `nbi_clearance_url`, `government_id_front_url`, and `selfie_url` are all on file. The rest are policy we enforce by eye in the review queue.

Hard requirements:

- [ ] Government ID, front and back. Accepted IDs: National ID, Passport, Driver's License, or UMID. Name on the ID matches the application.
- [ ] NBI Clearance, issued within the last 6 months. (The mobile form hints this; we hold the line at review.)
- [ ] Selfie. Used for a visual face-match against the government ID. Note: there is NO automated liveness/face-match in v1.0. An admin compares the selfie to the ID by eye in the Provider Review queue. (Onfido/Persona wiring is a v1.1+ item.)
- [ ] Inside a service area we operate. Provider lat/lng falls within a configured `service_areas` market (Metro Cebu is the default market: Cebu City, Mandaue, Lapu-Lapu, Talisay).
- [ ] At least 1 service category selected (the app allows 1 to 10).
- [ ] Independent Contractor agreement accepted (`icAgreementAccepted: true` at submission, timestamped server-side).
- [ ] Service radius between 1 and 50 km (onboarding cap; admin can later set up to 200 km on the row, but new applicants come in at 1 to 50).

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

---

## 2. The vetting funnel (stages)

```
Application submitted (status = pending, applied_at set)
        |
   [ Stage A ] Document completeness   -> missing? HOLD, request docs
        |
   [ Stage B ] Identity match          -> ID vs selfie, ID number, name
        |
   [ Stage C ] NBI clearance check     -> issued <6 months, name match, no disqualifying hit
        |
   [ Stage D ] Service area + radius    -> inside an operating market
        |
   [ Stage E ] Skills + references      -> skills test, 2 references (policy)
        |
   [ Stage F ] Score the scorecard      -> Section 3, pass threshold
        |
   APPROVE  /  REJECT  /  HOLD
```

An applicant lands in the **Providers** page filtered to `status = pending` (the Dashboard has a "pending providers" link straight to `/providers?status=pending`). Work the queue oldest-first by `applied_at`.

---

## 3. Vetting scorecard

Score each applicant out of 100. These weights and the pass mark are starting targets; tune them after the first 50 providers.

| # | Criterion | Weight | How to score |
|---|---|---|---|
| 1 | Identity verified (ID readable, not expired, selfie matches face) | 25 | 25 full match, 12 partial/blurry, 0 mismatch |
| 2 | NBI clearance valid (issued <6 months, name matches, clean or explainable) | 25 | 25 clean, 10 minor/explained hit, 0 missing or serious hit |
| 3 | Skills evidence for claimed categories (skills test, photos of past work, certification) | 20 | 20 strong, 10 some, 0 none |
| 4 | References (2 collected, at least 1 confirmed positive) | 10 | 10 both confirmed, 5 one confirmed, 0 none |
| 5 | Service area fit (inside an active/soft-launch market, realistic radius) | 10 | 10 inside active market, 5 inside recruiting market, 0 outside |
| 6 | Professionalism signals (complete profile, clear bio, responsive during application, equipment owned) | 10 | 10 strong, 5 thin, 0 red flags |

Pass marks (starting targets):

- **80 to 100** - Approve.
- **60 to 79** - Hold, ask for one more thing (better photo, a reference, a clearer NBI), then re-score.
- **Below 60** - Reject, with a reason code from Section 8.

Auto-fail overrides (any one of these = reject regardless of total score):

- ID and selfie are clearly different people.
- NBI clearance shows a serious unresolved hit relevant to home-services safety (theft, violence, sexual offenses).
- Document is forged or tampered.
- Provider is outside every operating service area and no launch is planned there.

Record the score and the reason in admin Notes before you act, so the decision is auditable.

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

- **APPROVE** when the scorecard is 80+, all three KYC docs are on file, and no auto-fail triggered.
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
   - The system refuses approval if any of `nbi_clearance_url`, `government_id_front_url`, or `selfie_url` is missing, and returns a clean message listing what is missing. If you see that, the provider has not finished onboarding; set it back to a hold and message them.
   - On success the status flips `pending -> approved`, `reviewed_at` is stamped, an audit row `provider_approved` is written, and the provider gets an "Account Approved" notification.
10. Set the tier if needed. New approvals default to **New** (15%). If this is one of the founding batch, use **Change Tier** to set Founding (reason required, 10+ chars).

### How to reject a provider

1. In **Providers** (or Provider detail), with the provider at `pending`, click **Reject**.
2. Enter a reason. The admin UI requires at least 10 characters. Use a reason code from Section 8 plus a plain-language sentence the provider will actually read.
3. The status flips `pending -> rejected`, the reason is stored, an audit row `provider_rejected` is written, and the provider gets an "Application Declined" notification with your reason.

A rejected provider can re-apply once they fix the issue (for example, get a fresh NBI). Treat a re-application as a new review.

---

## 7. Document expiry and re-verification

The one that expires on a clock is the NBI clearance.

- The provider row carries `nbi_expiry_date` and `nbi_expiry_notified`.
- A background worker (`checkNbiExpiry`) finds approved providers whose NBI expires within the warning window (default 30 days, tunable as `provider.nbi_expiry_warning_days`) and have not been notified yet, sends them "NBI Clearance Expiring Soon" (or "...Expired"), then marks them notified.
- In the mobile app the provider sees an NbiStatusBanner that classifies their status as `missing`, `expired`, `expiring`, or `valid`.

Re-verification SOP:

- [ ] When a provider's NBI shows `expiring`, they should upload a fresh clearance before it lapses.
- [ ] When it shows `expired`, the provider should not be taking new jobs. See the auto-suspend decision below.
- [ ] Re-verify the new NBI the same way you did at application (name match, issued within 6 months), then update `nbi_expiry_date`.

> **Set (editable):** the app does not auto-suspend on NBI expiry. At launch we run a manual chase, then manual suspend. Support contacts the provider when the NBI shows `expired`, holds them off dispatch by toggling availability, and suspends them only if they ignore the chase. _Recommended default. To change it, edit here and anywhere this value is referenced._

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

Copy-paste rejection message template (SMS/email, keep under 480 chars):

```
Hi [Name], thanks for applying to onService PH. We can't approve your
application right now because: [plain reason]. [If re-apply possible:]
You're welcome to re-apply once you've sorted this out. [If you need an
NBI: You can get a fresh NBI clearance at clearance.nbi.gov.ph.] Questions?
Reply here or email providers@onservice.ph. - onService PH Team
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
2. Status flips `suspended -> approved`, audited as `provider_reactivated`. Confirm the reason for suspension is actually resolved first (new NBI uploaded, incident closed, etc.).

Removal: there is no hard delete in the admin UI and we do not delete provider records (they carry financial and audit history). To take someone off the platform for good, suspend them and leave them suspended. The `deactivated` status exists as a terminal state and is filterable, but no current admin button sets it.

Dispatch rating floor (a quieter filter): a provider is dropped from auto-dispatch only once `total_reviews >= 5` AND `rating < 2.5` (both admin-tunable: `matching_min_rating`, `matching_min_rating_reviews`). New providers with few reviews are never filtered out for being new. This is automatic and separate from suspension. If a provider is below the floor, review them for a manual suspension decision rather than relying only on the silent dispatch drop.

---

## 10. Service-area assignment and change requests

A provider is tied to markets through `provider_service_areas` (with an `is_primary` flag) and also carries their own `service_radius_km` plus lat/lng/city/province.

Service-area changes need admin approval (gated since v1.0). A provider's request lands in `service_area_change_requests` (one pending request per provider at a time). Review it the way you would a small re-verification: does the new area make sense for where they actually are? Approve or reject in the admin flow (audited as `service_area_change_approved` / `service_area_change_rejected`). Pre-launch this was instant; it is not anymore, so do not promise providers an instant area switch.

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

## 12. Open decisions set in this doc

- **References and skills-test storage:** keep both in the provider's admin Notes for launch (no dedicated `references` or `skills_test_result` field). (editable)
- **Per-category skills question bank:** yes, a fixed bank per category, maintained as a real section in `13-policies-codes-and-templates.md`. (editable)
- **NBI expiry handling:** no auto-suspend; manual chase by support, then manual suspend if ignored. (editable)
- **Rejection reason codes:** adopt the R01-R10 taxonomy in Section 8. (editable)

Each item above is the working default so the team is never blocked. To change one, edit it here and anywhere this doc references it.
