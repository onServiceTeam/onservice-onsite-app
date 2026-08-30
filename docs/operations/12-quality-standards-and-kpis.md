# 12. Quality Standards and KPIs

Purpose: define what "good" means for onService PH (service, providers, support, operations), the numbers that prove it, and where to pull those numbers in the admin app.

How to read this doc:

- Every target below is a starting target. Tune it after 4 to 6 weeks of real Cebu data. Targets marked "tune-able" should be reviewed in the weekly ops review.
- Numbers come from the admin app unless noted. Money is stored in centavos and shown in PHP (₱). Timezone is Asia/Manila.
- Provider tiers and commission rates are admin-tunable in Settings (`commission_rate_<tier>`). The tier rules below are the current defaults from the tier ladder.
- Related docs: `06-customer-support-sop.md` (support workflow), `07-provider-support-sop.md`, `08-dispatch-and-live-operations.md`, `09-trust-safety-and-disputes.md`, `04-provider-vetting-and-filtering.md`, `11-admin-system-training-manual.md`.

Money-flow note (important): onService's target is an instant-pay escrow model. A server-verified payment is held before provider matching. Customer confirmation can release it, and the worker currently auto-releases after 24 hours, but dispute filing remains open for 48 hours. E18 makes that timing pair unsafe and not launch-grade policy. Quality reporting must distinguish provider completion, confirmation, release, and later dispute state instead of treating auto-confirm as undisputed finality. E14 also blocks the external hosted PayMongo authorization entry.

> **Set (editable):** E03's booking/escrow ordering is implemented. Treat checkout-success targets for external methods as provisional until E14 is resolved and test-mode end-to-end evidence exists. Time-to-match begins only from a verified paid/held booking. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 0. What "good" means here (the quality bar in one place)

Before the per-job standards, anchor on what we are aiming for. "Good" is not a feeling, it is three checkable bars that the whole handbook shares. These match Section 0 of `04-provider-vetting-and-filtering.md`; keep them in sync.

| Bar | What it is | The checkable threshold (starting target) |
|---|---|---|
| **Approval bar** | What it takes to get onto the platform | Vetting scorecard 80/100, all hard KYC requirements met, no auto-fail, skills check passed with no safety miss |
| **Staying bar** | What keeps a provider in good standing | 4.5+ average rating, under 2 cancellations in any rolling 30 days, zero confirmed safety incidents, current NBI |
| **Great bar** | The providers we promote, feature, and protect | 4.7+ average rating, 80%+ acceptance, 90%+ on-time, zero open disputes (this is the Pro/Elite gate and the green band below) |

Why this matters for quality: the differentiation strategy relies on vetting rigor, server-backed booking/payment records, Suki loyalty, and the on-app evidence trail. The deferred guarantee product is not a launch claim under E10/F#10. The KPIs in this doc are the instruments that show whether the active controls work. A red number here is a trust problem, not just a metric.

---

## 1. Service quality standards

These describe a single completed job. Pull most of these from the provider's Jobs tab (`/providers/:id` Jobs tab) and the Bookings monitor (`/bookings`).

| Standard | What it means | Starting target (tune-able) | Where to see it |
|---|---|---|---|
| On-time arrival | Provider reaches `provider_arrived` at or before the scheduled window | 90% within +/- 15 min of `scheduled_at` | Booking detail Timeline tab; GPS check-ins on Evidence tab |
| Completion rate | Of dispatched-and-paid jobs, share that reach `confirmed` or `resolved` without a customer-side cancel | 92% | Bookings monitor filtered by status |
| Rating threshold | Job rating left by customer | Average 4.5+, no 1-star without a logged reason | Provider Jobs tab (rating column); Reviews tab |
| Re-do / complaint rate | Jobs that produce a dispute OR a `free_redo` resolution | Under 5% of completed jobs | Disputes queue; Dispute detail resolution type |
| Evidence captured | Before/after photos present (probation policy requires them for first 3 jobs) | 100% for probation jobs | Booking detail Evidence tab |

Notes:

- The 3-job probation with mandatory before/after photos is policy (DECISION-003), not blocked in code. Support and dispatch must spot-check that probation providers actually uploaded photos. See `05-provider-onboarding-and-training.md`.

> **Set (editable):** "On-time" uses a +/- 15 minute window around `scheduled_at`. The app does not define an on-time SLA, so this is an ops target, not a code rule. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 2. Provider quality standards by tier

Tiers are the quality ladder. The rating, job-count, and dispute thresholds below are the tier-progression requirements built into the app. Commission is the reward for moving up. Tier changes are done by a super-admin on the Providers page (Change Tier, reason 10+ chars). There is no automatic promotion writeback today, so an admin must act on the signals.

| Tier | Commission | Min jobs | Min rating | Other gates |
|---|---|---|---|---|
| Founding | 10% | 0 | 0 | Invite-only launch batch. Terminal, parallel to the ladder, not a step. |
| New | 15% | 0 | 0 | Default on signup |
| Verified | 13% | 5 | 4.0 | None |
| Pro | 11% | 25 | 4.5 | Zero open disputes |
| Elite | 9% | 100 | 4.7 | Verified TESDA certification + zero open disputes |

(An "open" dispute is any dispute not in status `resolved`.)

### Rating floor and auto-dispatch exclusion

A provider is pulled out of auto-dispatch only once they have enough reviews to judge them: `total_reviews >= 5` AND `rating < 2.5` (both admin-tunable as `matching_min_rating` and `matching_min_rating_reviews`). New providers with few reviews are never excluded just for being new. This floor is separate from the tier rating gates above.

### What drops or lifts a tier (operations rules)

LIFTS (an admin promotes after confirming the provider clears the next tier's gates):

- [ ] Job count, rating, dispute count, and (for Elite) verified certification all meet the next tier.
- [ ] No suspension in the last 30 days.

DROPS / suspension signals (act through the Providers page):

- [ ] Cancellations: warn at 3 cancellations in 30 days (`providerCancellationWarningThreshold`), auto-suspend signal at 5 in 30 days (`providerCancellationSuspendThreshold`). Counts live on the providers row.
- [ ] A `refund_with_suspension` dispute resolution suspends the provider automatically.
- [ ] Repeated 1-star ratings trigger the `provider_consecutive_one_star` admin alert. Review and consider a tier drop or coaching.
- [ ] NBI clearance expired (provider drops out of trust standard until renewed; the `nbi_expiring` / expired worker warns 30 days out).

Suspending a provider immediately removes them from dispatch (matching only considers `status='approved' AND is_available=TRUE`) and flags any in-flight bookings so escrow cannot release until an admin resolves it. See `07-provider-support-sop.md`.

### Post-approval monitoring: probation, strikes, and review triggers

Approval is the start of the trust relationship. `04-provider-vetting-and-filtering.md` Section 12 owns the full post-approval monitoring SOP; this is the quality-side summary so the weekly and monthly reviews catch the right signals.

- **3-job probation.** A newly approved provider is on probation for their first 3 jobs, with mandatory before/after photos on each (DECISION-003, not code-enforced). Spot-check the Evidence tab. A no-show, dispute, off-platform attempt, or safety lapse on a probation job stops them from taking more jobs until ops decides retrain-or-remove.
- **Strike rule (editable default):** three logged, confirmed conduct or quality problems in a rolling 90 days triggers a suspension review by the Operations Lead. Strike 1 is coaching, strike 2 a formal warning, strike 3 the review. Confirmed safety or trust incidents skip the count and go straight to suspension. Log strikes in admin Notes (category `quality`).
- **Review triggers (open a provider review when any fires):** a confirmed safety/trust incident; the `provider_consecutive_one_star` alert; the cancellation warning (3/30 days) or suspend signal (5/30 days); any dispute, especially a `refund_with_suspension`; dropping below the dispatch rating floor; a probation job that went wrong; NBI expired and ignored; a third strike in 90 days; or a flagged off-platform pattern in chat (`messages.is_flagged`).

A review means: read the provider's recent jobs, ratings, disputes, and Notes, decide coach / warn / suspend / no action, and log the decision. Try coaching before removal for fixable, non-safety issues; recruiting and vetting a replacement costs more than a coaching call.

### Provider quality scorecard (use in monthly reviews)

| Metric | Weight | Green | Amber | Red |
|---|---|---|---|---|
| Average rating | 35% | 4.7+ | 4.3 to 4.69 | Under 4.3 |
| Acceptance rate | 20% | 80%+ | 60 to 79% | Under 60% |
| Cancellation rate (30d) | 20% | 0 to 1 | 2 to 3 | 4+ |
| Dispute rate | 15% | 0% | Up to 5% | Over 5% |
| On-time rate | 10% | 90%+ | 75 to 89% | Under 75% |

> **Set (editable):** The acceptance-rate and on-time bands above are ops targets, not code rules. The app tracks `acceptance_rate` and `response_time_minutes` on the providers row and weights acceptance/reliability at 0.2 in the dispatch score, but it does not enforce a pass/fail band. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 3. Support quality standards

Support runs out of the admin Support Queue (`/support-tickets`). Customers and providers can create and follow cases in the shared in-app Support screens. Email (`support@onservice.ph` for customers, `providers@onservice.ph` for providers) and Facebook Messenger remain staffed channels; an agent creates a ticket on the user's behalf for those external contacts. Support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT. See `06-customer-support-sop.md` and `10-money-and-compliance-ops.md` for the channel and data-handling detail.

### Support SLA targets (tune-able)

| Priority | First response | Resolution target |
|---|---|---|
| Urgent (active job stuck, payment taken no service, safety) | 30 min | 4 hours |
| High (no-provider, payout problem) | 2 hours | 1 business day |
| Medium (account, app bug) | 4 hours | 2 business days |
| Low (general inquiry) | 1 business day | 3 business days |

Other support quality targets:

- Reopen rate: under 8% of resolved tickets reopened within 7 days.
- Ticket statuses to watch: a ticket sitting in `waiting_on_customer` or `waiting_on_provider` does not count against resolution time. Automated reminders and five-day auto-close are not implemented; staff review and follow up manually.
- Resolution notes are mandatory (10+ char minimum enforced) when moving a ticket to `resolved` or `closed`. No empty closes.

### CSAT

- Target: 90%+ satisfied.

> **Set (editable):** CSAT is captured manually at launch. There is no CSAT field built into the ticket system yet, so run a short post-resolution survey by email or SMS and log results in a sheet. Build CSAT capture into Support Tickets later (backlog item), then retire the manual sheet. _Recommended default. To change it, edit here and anywhere this value is referenced._

### Support QA scorecard (grade 5 to 10 tickets per agent per week)

Score each closed ticket 0 to 2 on each line. Pass = 8 of 12 or higher.

| Item | 0 | 1 | 2 |
|---|---|---|---|
| Correct triage (type + priority right) | Wrong | Mostly | Correct |
| First response within SLA | Missed | Close | Met |
| Followed the SOP / decision tree | No | Partly | Yes |
| Money/refund handled correctly (escrow, policy) | Wrong | Minor slip | Correct |
| Tone (plain, calm, no jargon; Bisaya/Tagalog/English as fits) | Poor | OK | Good |
| Resolution note clear + audit-ready | Missing | Thin | Clear |

Anything touching escrow, refunds, payouts, or provider suspension must be checked against `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`. Those actions are super-admin only and write paired audit rows.

---

## 4. Operational KPIs

These are the platform health numbers. Most come from the Dashboard (`/`), Financials (`/financials`), Dispatch Console (`/dispatch`), and the Disputes queue.

| KPI | Definition | Starting target (tune-able) | Source |
|---|---|---|---|
| Match rate | Paid bookings that get a provider (`matched` or further) | 90%+ | Bookings monitor; Dispatch Console counters |
| Time-to-match | Booking paid to provider accepts an offer | Median under 3 min | Booking Timeline; offers run on a 45s cycle, max 10 attempts |
| No-provider rate | Bookings that hit `no_provider_available` | Under 8% | Dashboard alerts; notification type `no_provider_available` |
| Checkout success rate | Payment attempts that reach verified `paid` vs started, by method | Provisional until E14 closes; then 95%+ starting target | Booking/payment records plus gateway reconciliation; never infer from redirect |
| Dispute rate | Disputes filed per 100 confirmed bookings | Under 5 | Disputes queue; Dashboard Pending Disputes |
| Refund rate | Refunded amount as share of GMV | Under 4% | Financials Overview (refunds, net revenue) |
| Escrow aging | Funds stuck in `held` past 48h | Near zero past 168h | Financials Escrow tab (aging buckets) |
| Repeat-customer rate | Customers with 2+ bookings in 30d | 30%+ by month 3 | Dashboard Acquisition Funnel (Registered to First to Repeat) |
| Auto-confirm share | Bookings moved by the current 24h worker vs customer confirm, with later disputes reported separately | Track as E18 risk evidence, not a success target | Bookings; disputes; worker `autoConfirmBookings` |

Why these matter for an instant-pay model: once a booking is verified paid, a high no-provider rate means we are holding money for work we cannot fill, which forces refunds and burns trust. Time-to-match and match rate are the early-warning lights for that; pending or failed authorization attempts are payment reliability, not dispatch demand.

Dispatch-specific watch items (current-state, from the Dispatch Console):

- Providers accepting work vs active bookings. The count is an approved-plus-availability-toggle measure, not app presence or live GPS. If bookings climb while accepting-work supply stays flat, expect no-provider events.
- The 45-second offer cycle: each unanswered offer cascades to the next provider, capped at 10 attempts, then the customer is notified once. Use Dispatch Attention to find unassigned/overdue work, then verify each booking's offer history in Booking 360; the console does not receive a live alert-tail stream. See `08-dispatch-and-live-operations.md`.

City-level health (Dashboard Cities grid, one row per service area):

- [ ] Each active city has enough approved providers set to accepting work during peak hours; separately confirm actual coverage and responsiveness.
- [ ] `city_low_provider_count` alert is clear. If it fires, that city is at no-provider risk and recruiting needs a push (`03-provider-recruiting-sop.md`).

---

## 5. Money and trust-fund KPIs to watch

Escrow is an active money ledger. The retained guarantee-fund wallet is an internal financial record, not an approved customer coverage promise while E10/F#10 remains open. Pull both from Financials, but report them separately.

| KPI | Target | Source |
|---|---|---|
| Guarantee fund runway | Replenishment status green; runway not flagged | Financials Guarantee Fund tab; `guarantee_fund_low` alert |
| Reconciliation discrepancies | Zero unacknowledged | Financials Reconciliation tab |
| Failed payouts | Zero left unresolved | Financials Payouts tab; Payouts queue |
| PayMongo webhook failures | Zero | `paymongo_webhook_failure` admin alert |
| DSR on-time rate | 100% within the NPC-required window | Compliance DSR queue; Dashboard overdue/near-due rows |

The release formula allocates 1.5% of the customer service fee to the guarantee wallet. The current customer service fee is 0%, so the current fee-derived contribution is zero. Guarantee terms remain subject to E10/F#10; do not describe it as insurance or invent coverage wording.

> **Hold (E10/F#10):** There is no approved customer guarantee cap, coverage definition, eligibility rule, clawback policy, or customer-facing claim promise. Do not use the former ₱20,000 draft figure in training, dashboards, support replies, or product copy. Attorney and accountant approval is required before any such policy is adopted.

See `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`.

---

## 6. Weekly ops review

Run this once a week, 45 minutes, whole ops team. Owner: the Operations Lead (see `02-org-structure-and-roles.md`).

Agenda:

1. Pull last 7 days on the Dashboard (set range to 7d).
2. Walk the operational KPIs in section 4. Note any red.
3. Provider health: new approvals, suspensions, tier moves, cancellation warnings, NBI expiries due in 30 days.
4. Support: ticket volume, SLA hits and misses, reopen rate, the week's QA scorecard results.
5. Disputes: open count, stale (48h+) count, resolution mix.
6. Money: escrow aging, refunds, failed payouts, reconciliation, guarantee-fund runway.
7. City health: any `city_low_provider_count` city, any no-provider spikes.
8. Pick 1 to 3 fixes for the week. Assign an owner each. Carry forward last week's.

Copy-paste weekly review template:

```
onService weekly ops review - week of [DATE]
Attendees:

1. Bookings & match
   - GMV: ₱___   Completed: ___   Match rate: ___%   Time-to-match (median): ___ min
   - No-provider events: ___   Worst city: ___
2. Providers
   - New approved: ___   Suspended: ___   Tier moves: ___
   - Cancellation warnings: ___   NBI expiring (30d): ___
3. Support
   - Tickets in: ___  Resolved: ___  SLA met: ___%  Reopen: ___%
   - QA scorecard avg: ___ / 12
4. Disputes
   - Open: ___  Stale 48h+: ___  Refund-with-suspension this week: ___
5. Money
   - Refund rate: ___%  Escrow >168h: ₱___  Failed payouts: ___
   - Guarantee fund runway: ___  Reconciliation discrepancies: ___
6. Top 3 actions for next week (owner each):
   - [ ]
   - [ ]
   - [ ]
```

---

## 7. Dashboards and reports to pull from

| Need | Admin page | Tab / field |
|---|---|---|
| Daily platform pulse | Dashboard `/` | KPI cards, charts, Cities grid, Operational Alerts |
| Bookings + statuses | Bookings `/bookings` | Status filter, escrow column |
| Single-job audit | Booking detail `/bookings/:id` | Timeline, Evidence, Money, Audit |
| Provider quality | Provider detail `/providers/:id` | Jobs, Financials, Reviews, Disputes |
| Live ops | Dispatch `/dispatch` | Counters, saved-location map, Dispatch Attention; verify offer history in Booking 360 |
| Disputes | Disputes `/disputes` | Status + tier filter; risk-pattern flags on detail |
| Money + GMV + reconciliation | Financials `/financials` | Overview, Escrow, Payouts, Guarantee Fund, Reconciliation |
| Payout queue | Payouts `/payouts` | Status filter |
| Support | Support Tickets `/support-tickets` | Status, priority, assignment |
| Quality analytics | Analytics `/analytics` | Quality Scores, Cohort, Churn, Commission tabs |
| Compliance / DSR | Compliance `/compliance` | DSR queue and audit; BIR calendar remains held and non-authoritative under E22 |
| Who did what | Audit Log `/audit-log` | Request + admin-op rows |

Note: the Analytics page has "Quality Scores" and "Churn Prediction" tabs, but metric definitions, source labels, comparison periods, and freshness remain open audit work. Dashboard and Financials summaries need the same verification. Use the underlying booking, dispute, payout, support, and audit records for an operational decision until a metric's definition and freshness are shown in the UI.

---

## 8. Review and tune cadence

- Weekly: section 6 review, support QA scorecards.
- Monthly: provider scorecards (section 2), tier promotions/demotions, re-check every starting target against real data and adjust.
- Quarterly: revisit the standards themselves. As Cebu matures and new cities turn on, what counted as green in month 1 should tighten.

When you change a target, write the new number here and note the date and reason. Do not let stale targets sit unchallenged.

---

## Open decisions set in this doc

- Quality bars (Section 0): approval 80/100; staying 4.5+ rating, under 2 cancellations/30 days, zero safety incidents, current NBI; great 4.7+ rating, 80%+ acceptance, 90%+ on-time, zero open disputes. Mirrors `04-provider-vetting-and-filtering.md` Section 0 (editable).
- Post-approval monitoring (Section 2): 3-job probation with mandatory photos; 3-strikes-in-90-days suspension review; safety incidents skip the strike count. Full SOP in `04-provider-vetting-and-filtering.md` Section 12 (editable).
- Payment KPI assumption: E03 ordering is implemented, but external checkout/top-up metrics remain provisional until E14 closes with an approved integration and test-mode evidence (editable).
- On-time window: +/- 15 minutes around `scheduled_at` (editable).
- Provider scorecard acceptance and on-time bands: ops targets only, not code-enforced (editable).
- CSAT capture: manual post-resolution survey at launch, build into Support Tickets later (editable).
- Guarantee policy: held under E10/F#10; no cap, coverage, eligibility, or clawback promise is approved.
- Support hours: Monday to Saturday, 8:00 AM to 6:00 PM PHT (editable).
