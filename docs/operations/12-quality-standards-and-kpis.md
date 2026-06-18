# 12. Quality Standards and KPIs

Purpose: define what "good" means for onService PH (service, providers, support, operations), the numbers that prove it, and where to pull those numbers in the admin app.

How to read this doc:
- Every target below is a STARTING target. Tune it after 4 to 6 weeks of real Cebu data. Targets marked "tune-able" should be reviewed in the weekly ops review.
- Numbers come from the admin app unless noted. Money is stored in centavos and shown in PHP (₱). Timezone is Asia/Manila.
- Provider tiers and commission rates are admin-tunable in Settings (`commission_rate_<tier>`). The tier rules below are the current defaults from the tier ladder.
- Related docs: `06-customer-support-sop.md` (support workflow), `07-provider-support-sop.md`, `08-dispatch-and-live-operations.md`, `09-trust-safety-and-disputes.md`, `04-provider-vetting-and-filtering.md`, `11-admin-system-training-manual.md`.

IMPORTANT money-flow note: onService runs an instant-pay escrow model. The customer pays first into the platform escrow wallet, then a provider is matched and dispatched. Money is held in escrow until the customer confirms completion or the 24-hour auto-confirm fires. So "completion" for quality purposes means the booking reached `confirmed` (or auto-confirmed), not just that the provider marked it done.

DECIDE: The instant-pay path (`requested` to `payment_pending`) is fixed on a branch but NOT merged to master yet (E03). Until Ken merges it, customers hitting checkout get a 409 error. The quality targets below assume instant-pay is live. If launch happens before the merge, the "checkout success rate" and "time-to-match" numbers will be wrong because bookings stall at `requested`. Ken must decide the merge timing before these KPIs mean anything.

---

## 1. Service quality standards

These describe a single completed job. Pull most of these from the provider's Jobs tab (`/providers/:id` Jobs tab) and the Bookings monitor (`/bookings`).

| Standard | What it means | Starting target (tune-able) | Where to see it |
|---|---|---|---|
| On-time arrival | Provider reaches `provider_arrived` at or before the scheduled window | 90% within +/- 15 min of scheduled_at | Booking detail Timeline tab; GPS check-ins on Evidence tab |
| Completion rate | Of dispatched-and-paid jobs, share that reach `confirmed` or `resolved` without a customer-side cancel | 92% | Bookings monitor filtered by status |
| Rating threshold | Job rating left by customer | Average 4.5+, no 1-star without a logged reason | Provider Jobs tab (rating column); Reviews tab |
| Re-do / complaint rate | Jobs that produce a dispute OR a `free_redo` resolution | Under 5% of completed jobs | Disputes queue; Dispute detail resolution type |
| Evidence captured | Before/after photos present (probation policy requires them for first 3 jobs) | 100% for probation jobs | Booking detail Evidence tab |

Notes:
- The 3-job probation with mandatory before/after photos is policy (DECISION-003), not blocked in code. Support and dispatch must spot-check that probation providers actually uploaded photos. See `05-provider-onboarding-and-training.md`.
- ASSUMPTION: "on-time" uses a +/- 15 minute window. The app does not define an on-time SLA, so this is a recommendation to tune.

---

## 2. Provider quality standards by tier

Tiers are the quality ladder. The rating, job-count, and dispute thresholds below are the tier-progression requirements built into the app. Commission is the reward for moving up. Tier changes are done by a super_admin on the Providers page (Change Tier, reason 10+ chars). There is no automatic promotion writeback today, so an admin must act on the signals.

| Tier | Commission | Min jobs | Min rating | Other gates |
|---|---|---|---|---|
| Founding | 10% | 0 | 0 | Invite-only launch batch. Terminal, parallel to the ladder, not a step. |
| New | 15% | 0 | 0 | Default on signup |
| Verified | 13% | 5 | 4.0 | none |
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

### Provider quality scorecard (use in monthly reviews)

| Metric | Weight | Green | Amber | Red |
|---|---|---|---|---|
| Average rating | 35% | 4.7+ | 4.3 to 4.69 | under 4.3 |
| Acceptance rate | 20% | 80%+ | 60 to 79% | under 60% |
| Cancellation rate (30d) | 20% | 0 to 1 | 2 to 3 | 4+ |
| Dispute rate | 15% | 0% | up to 5% | over 5% |
| On-time rate | 10% | 90%+ | 75 to 89% | under 75% |

ASSUMPTION: acceptance-rate and on-time bands are recommendations. The app tracks `acceptance_rate` and `response_time_minutes` on the providers row and uses acceptance/reliability at weight 0.2 in the dispatch score, but does not set a pass/fail band.

---

## 3. Support quality standards

Support runs out of the admin Support Tickets page (`/support-tickets`). There is no in-app ticket screen for customers or providers today, so tickets come in by email (support@onservice.ph for customers, providers@onservice.ph for providers) and an agent creates the ticket on the user's behalf. Hours are Mon to Sat, 8am to 8pm PHT. See `06-customer-support-sop.md` and `10-money-and-compliance-ops.md` for the channel and data-handling detail.

### Support SLA targets (tune-able)

| Priority | First response | Resolution target |
|---|---|---|
| Urgent (active job stuck, payment taken no service, safety) | 30 min | 4 hours |
| High (no-provider, payout problem) | 2 hours | 1 business day |
| Medium (account, app bug) | 4 hours | 2 business days |
| Low (general inquiry) | 1 business day | 3 business days |

Other support quality targets:
- CSAT: 90%+ satisfied. ASSUMPTION: there is no CSAT capture built in the app yet. Until one exists, run a short post-resolution survey by email or SMS and log results in a sheet. DECIDE: whether to build CSAT capture into support tickets, or keep it manual for launch.
- Reopen rate: under 8% of resolved tickets reopened within 7 days.
- Ticket statuses to watch: a ticket sitting in `waiting_on_customer` or `waiting_on_provider` does not count against resolution time, but auto-close it after 5 days of no reply (manual for now).
- Resolution notes are mandatory (10+ char minimum enforced) when moving a ticket to resolved or closed. No empty closes.

### Support QA scorecard (grade 5 to 10 tickets per agent per week)

Score each closed ticket 0 to 2 on each line. Pass = 8 of 12 or higher.

| Item | 0 | 1 | 2 |
|---|---|---|---|
| Correct triage (type + priority right) | wrong | mostly | correct |
| First response within SLA | missed | close | met |
| Followed the SOP / decision tree | no | partly | yes |
| Money/refund handled correctly (escrow, policy) | wrong | minor slip | correct |
| Tone (plain, calm, no jargon; Bisaya/Tagalog/English as fits) | poor | ok | good |
| Resolution note clear + audit-ready | missing | thin | clear |

Anything touching escrow, refunds, payouts, or provider suspension must be checked against `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`. Those actions are super_admin-only and write paired audit rows.

---

## 4. Operational KPIs

These are the platform health numbers. Most come from the Dashboard (`/`), Financials (`/financials`), Dispatch Console (`/dispatch`), and the Disputes queue.

| KPI | Definition | Starting target (tune-able) | Source |
|---|---|---|---|
| Match rate | Paid bookings that get a provider (`matched` or further) | 90%+ | Bookings monitor; Dispatch Console counters |
| Time-to-match | Booking paid to provider accepts an offer | Median under 3 min | Booking Timeline; offers run on a 45s cycle, max 10 attempts |
| No-provider rate | Bookings that hit `no_provider_available` | Under 8% | Dashboard alerts; notification type `no_provider_available` |
| Checkout success rate | Bookings that reach `paid` vs created | 95%+ | Bookings monitor (see E03 DECIDE above) |
| Dispute rate | Disputes filed per 100 confirmed bookings | Under 5 | Disputes queue; Dashboard Pending Disputes |
| Refund rate | Refunded amount as share of GMV | Under 4% | Financials Overview (refunds, net revenue) |
| Escrow aging | Funds stuck in `held` past 48h | Near zero past 168h | Financials Escrow tab (aging buckets) |
| Repeat-customer rate | Customers with 2+ bookings in 30d | 30%+ by month 3 | Dashboard Acquisition Funnel (Registered to First to Repeat) |
| Auto-confirm share | Bookings closed by the 24h auto-confirm vs customer confirm | Track, no hard target | Bookings; worker `autoConfirmBookings` |

Why these matter for an instant-pay model: the customer has already paid before a provider exists. A high no-provider rate means we are holding money for jobs we cannot fill, which forces refunds and burns trust. Time-to-match and match rate are the early-warning lights for that.

Dispatch-specific watch items (live, from the Dispatch Console):
- Providers online count vs active bookings. If bookings climb while online providers stay flat, expect no-provider events.
- The 45-second offer cycle: each unanswered offer cascades to the next provider, capped at 10 attempts, then the customer is notified once. Watch the live alert tail for repeated cascades in one city. See `08-dispatch-and-live-operations.md`.

City-level health (Dashboard Cities grid, one row per service area):
- [ ] Each active city has providers online during peak hours.
- [ ] `city_low_provider_count` alert is clear. If it fires, that city is at no-provider risk and recruiting needs a push (`03-provider-recruiting-sop.md`).

---

## 5. Money and trust-fund KPIs to watch

Escrow and the guarantee fund are part of the trust promise. Pull from Financials.

| KPI | Target | Source |
|---|---|---|
| Guarantee fund runway | Replenishment status green; runway not flagged | Financials Guarantee Fund tab; `guarantee_fund_low` alert |
| Reconciliation discrepancies | Zero unacknowledged | Financials Reconciliation tab |
| Failed payouts | Zero left unresolved | Financials Payouts tab; Payouts queue |
| PayMongo webhook failures | Zero | `paymongo_webhook_failure` admin alert |
| DSR on-time rate | 100% within the 15-day NPC SLA | Compliance DSR queue; Dashboard overdue/near-due rows |

The guarantee fund is funded by about 1.5% of every service fee and covers up to ₱25,000 per claim. It is a service guarantee, not insurance. Do not describe it as insurance anywhere customer-facing. See `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`.

---

## 6. Weekly ops review

Run this once a week, 45 minutes, whole ops team. Owner: the ops lead (see `02-org-structure-and-roles.md`).

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
| Live ops | Dispatch `/dispatch` | Counters, map, alert tail |
| Disputes | Disputes `/disputes` | Status + tier filter; risk-pattern flags on detail |
| Money + GMV + reconciliation | Financials `/financials` | Overview, Escrow, Payouts, Guarantee Fund, Reconciliation |
| Payout queue | Payouts `/payouts` | Status filter |
| Support | Support Tickets `/support-tickets` | Status, priority, assignment |
| Quality analytics | Analytics `/analytics` | Quality Scores, Cohort, Churn, Commission tabs |
| Compliance / DSR | Compliance `/compliance` | DSR queue, audit, BIR calendar |
| Who did what | Audit Log `/audit-log` | request + admin-op rows |

Note: the Analytics page has a "Quality Scores" tab and a "Churn Prediction" tab. Confirm with engineering which are live vs feature-flagged before you rely on them in a review. The Dashboard, Financials, Disputes, and Bookings pages are the dependable sources for the KPIs above.

---

## 8. Review and tune cadence

- Weekly: section 6 review, support QA scorecards.
- Monthly: provider scorecards (section 2), tier promotions/demotions, re-check every "starting target" against real data and adjust.
- Quarterly: revisit the standards themselves. As Cebu matures and new cities turn on, what counted as green in month 1 should tighten.

When you change a target, write the new number here and note the date and reason. Do not let stale targets sit unchallenged.
