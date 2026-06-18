# 13. Policies, Codes and Templates

Purpose: one reference pack for the ops team. Plain-language cancellation and refund rules, the customer and provider codes of conduct, and a copy-paste template library for recruiting, support, disputes, vetting, QA, shift handover, and incident reports.

Related docs: cancellation/refund money mechanics live in `10-money-and-compliance-ops.md`; provider conduct detail and onboarding in `05-provider-onboarding-and-training.md`; support flows in `06-customer-support-sop.md` and `07-provider-support-sop.md`; disputes in `09-trust-safety-and-disputes.md`; admin page how-to in `11-admin-system-training-manual.md`; KPIs and the scorecards in `12-quality-standards-and-kpis.md`.

All money in this doc is PHP (₱). Times are Asia/Manila (PHT). All numbers marked "starting target" are meant to be tuned once we have real volume.

---

## 1. Cancellation policy (plain language)

We run an instant-pay escrow model. The customer pays first into the platform escrow wallet, then a provider is matched. So almost every cancellation involves money already held in escrow, and the refund is computed automatically.

> IMPORTANT for the team: there are TWO cancellation systems in the app right now, and they do not match. Tell customers what the app actually charges (System A below), not what the policy page shows (System B).

**System A - what actually moves the money (live).** When a paid booking (escrow held) is cancelled, the app reads the hours until the scheduled time and applies these brackets. These are admin-tunable in admin Settings (`cancel_refund_*` keys).

| Time before scheduled start | Customer refund of service price | Service fee |
|---|---|---|
| More than 24 hours | 100% | refunded |
| 2 to 24 hours | 100% | refunded |
| 1 to 2 hours | 90% | refunded |
| 30 min to 1 hour | 80% | refunded |
| Under 30 min | 70% | refunded |
| Provider already arrived | 50% | refunded |
| Customer no-show | 0% | fee kept by platform |

On a customer cancel the customer gets the refund percentage of the service price PLUS the full service fee back, except a no-show where we keep the fee. The provider compensation is the inverse of the customer refund percentage.

**System B - what the policy page and the admin Cancellation Policy editor show (display only).** This is the versioned tier table at `/settings/cancellation-policy`. It currently shows: 24+ hours 100% refund, 4 to 24 hours 75%, under 4 hours 50%, after scheduled / no-show 0%. It is NOT wired to the actual refund. It is the customer-facing text only.

DECIDE: System A and System B disagree (for example 2-to-24h is 100% in A but 75% in B). Ken needs to pick one set of brackets and make them match, then we point both at it. Until then, the team must quote System A for real refund amounts.

**Provider no-show.** Separate rule. The customer gets a 100% refund plus a platform-funded apology credit (default ₱200, `provider_no_show_credit_php`). This is goodwill from us, not from the provider.

---

## 2. Refund policy (plain language)

Refunds come out of escrow and are pushed back to the customer through PayMongo. They land on the original payment method (GCash, Maya, card, QRPH) or as wallet balance if they paid from wallet. Bank-card refunds can take a few business days on PayMongo's side; tell customers 5 to 7 business days as a starting target.

When a refund happens:
- **Cancellation** - auto-computed per System A above.
- **Dispute** - resolved by admin. Resolution types: full refund, partial refund (you set a percent), no refund, free redo, refund with warning, refund with suspension, split decision. Full refund / refund with warning / refund with suspension are all 100%. Any remaining escrow after a partial refund still goes to the provider.
- **Unresponded dispute** - if the provider does not respond within 48 hours, it resolves in the customer's favor (full refund).
- **No-provider-available** - if dispatch never finds a provider, the booking expires (72h cap) and the customer is refunded in full.

Dispute filing window is 48 hours after job completion. Damage and theft disputes require photo evidence. See `09-trust-safety-and-disputes.md` for the full decision tree.

---

## 3. Customer Code of Conduct

By booking on onService, the customer agrees to:

- [ ] Give an accurate address, contact number, and honest job description.
- [ ] Be reachable on the in-app chat around the scheduled time (we have no masked calling yet, so chat is the channel).
- [ ] Provide safe access to the work area and a safe working environment.
- [ ] Treat providers with respect. No harassment, discrimination, threats, or unwanted advances.
- [ ] Pay only through the app. Asking a provider to go off-platform (cash deal, direct booking) is a violation and voids all platform protections.
- [ ] Cancel as early as possible. Late cancels and no-shows reduce the refund per the brackets above.
- [ ] Approve or decline change orders honestly, and only confirm completion when the work is actually done.
- [ ] File disputes in good faith with real evidence. Repeated bad-faith disputes get the account flagged (the dispute screen tracks a 90-day risk pattern: OK / REVIEW_REQUIRED / AT_RISK).

Consequences for violations: account flagged for fraud review, suspension, or closure (admin Customers page actions: Suspend, Flag for fraud review).

---

## 4. Provider Code of Conduct (summary)

Full version lives in `05-provider-onboarding-and-training.md`. Short form for reference:

- [ ] Show up on time, in the branded onService shirt, for the job you accepted.
- [ ] Keep NBI clearance current. We warn 30 days before expiry; an expired NBI blocks you from dispatch.
- [ ] Do the work to standard. Take before and after photos (mandatory during the 3-job probation).
- [ ] Stay on-platform. No asking the customer for cash, no swapping numbers to book direct. Chat messages that look like off-platform attempts get flagged.
- [ ] Use change orders for any extra work and price (capped at 50% of the original service price). Never demand cash on site.
- [ ] Do not cancel jobs you accepted. We warn at 3 cancellations in 30 days and auto-suspend at 5.
- [ ] Treat customers and their homes with respect. Damage, theft, or harassment leads to suspension and possible removal.
- [ ] Respond to disputes within 48 hours. Silence resolves the dispute against you.

Commission by tier (flat per tier, taken off the service price): Founding 10%, New 15%, Verified 13%, Pro 11%, Elite 9%. Tier requirements: Verified = 5+ jobs and 4.0+ rating; Pro = 25+ jobs, 4.5+ rating, no open disputes; Elite = 100+ jobs, 4.7+ rating, TESDA-certified, no open disputes. Founding is invite-only.

---

## 5. Template library

Copy-paste ready. Replace `[bracketed]` fields. Bilingual (English / Bisaya or Tagalog) where it helps reach providers and customers.

### 5.1 Provider outreach (recruiting)

**SMS / Messenger first contact:**
> Hi [Name], this is [You] from onService PH. We're a home-services app launching in [City] and we're looking for vetted [trade, e.g. aircon] pros. Steady jobs, you keep most of the pay, weekly payouts to GCash/Maya. Interested? Reply YES and I'll send the next steps.

> Bisaya: Maayong adlaw [Name]! Si [You] ni gikan sa onService PH. App mi para sa home services, mangita mi og kasaligan nga [trade] dinhi sa [City]. Naa'y kanunay'ng trabaho, dako imong kita, weekly payout sa GCash/Maya. Interesado ka? Reply YES.

**Follow-up after interest:**
> Salamat [Name]. To apply you'll need 3 things ready: a valid government ID, your NBI clearance (issued within the last 6 months), and a selfie. The app walks you through it in about 10 minutes. Here's the link: [link]. Questions? Message me here.

### 5.2 Provider approval message

(The app also sends an automatic "Account Approved" notification. Use this for a personal touch.)
> Congrats [Name], you're approved on onService as a [tier] provider. Your commission is [X]% per job. Keep your NBI current and your ratings up to move to the next tier. First jobs will start coming through as offers (about 1 minute to accept). Welcome aboard.

### 5.3 Provider rejection message

(Reason is required and stored. Be specific and kind.)
> Hi [Name], thanks for applying to onService. We can't approve your application right now because: [specific reason, e.g. "the NBI clearance uploaded is older than 6 months"]. You're welcome to re-apply once that's sorted. If you think this is a mistake, reply here and we'll take another look.

### 5.4 Customer support macros

**Booking help:**
> Hi [Name], thanks for reaching out. I can see your booking [#bookingID] is currently [status]. [Explain plainly what that status means and what happens next.] Anything else I can help with?

**Refund (cancellation):**
> Hi [Name], I've processed the cancellation for booking [#bookingID]. Based on the timing, your refund is ₱[amount] ([X]% of the service price) plus your service fee, going back to your [GCash/Maya/card/wallet]. Card and bank refunds can take 5 to 7 business days; GCash and wallet are usually faster. I'll keep an eye on it.

**Apology + goodwill:**
> Hi [Name], I'm sorry about [what went wrong]. That's not the experience we want. I've [action taken], and I've added a ₱[amount] credit to your account as an apology. Thank you for your patience, and please give us another chance.

**Dispute update:**
> Hi [Name], an update on your dispute for booking [#bookingID]. Status: [under review / escalated / resolved]. [If resolved: Our decision is (resolution type). Your refund of ₱(amount) is on its way to your (method).] [If pending: We've asked the provider to respond; they have until (date/time). If they don't respond by then, it resolves in your favor.] We'll message you the moment there's news.

### 5.5 SMS templates (short)

- **OTP issue:** `onService: Having trouble logging in? Make sure you used +63 9XX XXX XXXX. Code is 6 digits and resends after a short cooldown. Still stuck? Email support@onservice.ph.`
- **Provider en route:** `onService: Your provider for booking [#ID] is on the way. Track and chat in the app.`
- **No provider found:** `onService: We couldn't find an available provider for booking [#ID] right now. Your payment is fully refunded. Sorry for the trouble, please try again shortly.`
- **Payout sent (provider):** `onService: Your payout of ₱[amount] has been sent to your [GCash/Maya/bank]. Salamat sa imong trabaho!`

### 5.6 Vetting scorecard template

Use during provider review (admin Provider detail, Profile tab). Pass mark is a starting target; tune it.

| Item | Check | Pass? |
|---|---|---|
| Government ID front + back | Clear, name matches application | [ ] |
| NBI clearance | Uploaded, issued within 6 months, not expired | [ ] |
| Selfie | Matches the ID photo (visual review, no auto-verification in v1.0) | [ ] |
| NBI expiry date recorded | Entered so the 30-day warning works | [ ] |
| Skills test | Passed (policy: required) | [ ] |
| References | 2 references contacted (policy: required) | [ ] |
| Service categories | Sensible for their skills | [ ] |
| IC agreement | Accepted at application | [ ] |

Decision: Approve / Reject (with specific reason ≥10 chars) / Hold for more info. Approval is blocked by the app unless NBI, gov ID front, and selfie are all on file.

ASSUMPTION: skills test and 2-reference checks are written policy (STRATEGIC-DECISIONS-LOG DECISION-003) but are not enforced by the app, so the team tracks them manually until built. Mark them in the provider's admin Notes (category: quality).

### 5.7 Support QA scorecard template

Score a sample of agent interactions weekly. Each line 0, 1, or 2 (0 = miss, 2 = great). Starting passing target: 16/20.

| Criterion | Score |
|---|---|
| Greeted and identified the customer/booking correctly | [ ] |
| Diagnosed the real issue (used the right admin page) | [ ] |
| Quoted the correct policy (System A refund brackets, real windows) | [ ] |
| Took the right action or escalated correctly | [ ] |
| Wrote a clear reason in any audited action (≥ required length) | [ ] |
| Tone: warm, plain language, no jargon | [ ] |
| Set expectations (timeframes, next steps) | [ ] |
| Followed up / closed the loop | [ ] |
| Logged it (support ticket created/updated in admin) | [ ] |
| No off-policy promises (no insurance claims, no off-platform deals) | [ ] |

Note: customers and providers cannot open tickets in the app. Agents create the ticket in the admin Support Tickets page on the user's behalf (from email or chat).

### 5.8 Shift handover template

Copy at end of shift, post in the ops channel.

```
SHIFT HANDOVER - [date] [shift, e.g. 8am-4pm PHT]
Outgoing: [name]   Incoming: [name]

OPEN BOOKINGS NEEDING EYES:
- [#bookingID] - [status] - [what's pending]

NO-PROVIDER / REASSIGN WATCH:
- [#bookingID] - [city] - [attempts so far]

OPEN DISPUTES (tier / age):
- [#disputeID] - tier [n] - [next action, who owns it]

PAYOUTS PENDING APPROVAL:
- [provider] - ₱[amount] - [AML review? yes/no]

INCIDENTS / ESCALATIONS:
- [link to incident report if any]

ADMIN/SETTINGS CHANGES THIS SHIFT:
- [what changed, who, why]

NOTES FOR NEXT SHIFT:
- [anything to watch]
```

### 5.9 Incident report template

For anything that touches money, safety, data, or the live system. File it; do not just message about it.

```
INCIDENT REPORT
ID: INC-[YYYYMMDD-NN]
Reported by: [name]      Date/time (PHT): [ ]
Severity: [low / medium / high / critical]
Category: [money / safety / data-privacy / outage / fraud / other]

WHAT HAPPENED (plain language):
[ ]

WHO/WHAT IS AFFECTED:
Customers: [ ]   Providers: [ ]   Bookings: [#IDs]   Amount at risk: ₱[ ]

TIMELINE:
[time] - [event]

IMMEDIATE ACTIONS TAKEN:
[ ]

ROOT CAUSE (if known):
[ ]

FOLLOW-UPS / OWNERS:
[ ]

COMPLIANCE FLAGS:
NPC breach (personal data)? [Y/N - if Y, 72h notice clock starts]
BIR / money discrepancy? [Y/N]
Needs Ken? [Y/N - money/compliance/legal/architecture hard stop]
```

Reminder: a personal-data breach starts a 72-hour NPC notification clock, and money or compliance risk is a hard stop that goes to Ken. See `10-money-and-compliance-ops.md`.

### 5.10 Onboarding checklists

**New provider activation:**
- [ ] Application approved in admin (NBI + gov ID + selfie verified)
- [ ] Tier set (default New; Founding only if invited)
- [ ] Service categories and service area confirmed
- [ ] Payout method on file (GCash/Maya 09XXXXXXXXX, or bank 8-16 digits)
- [ ] Welcome message sent; commission rate explained
- [ ] Branded shirt arranged
- [ ] Probation flagged (first 3 jobs, before/after photos)
- [ ] First-job support contact assigned

**New admin/agent onboarding:**
- [ ] User created with correct role (`admin`, or `super_admin` only if they need money/destructive actions, or `dpo` for compliance)
- [ ] TOTP 2FA enrolled at first login
- [ ] Walked through `11-admin-system-training-manual.md`
- [ ] Knows the System A refund brackets and dispute windows by heart
- [ ] Knows what only super_admin can do (escrow, refunds, payouts, force-complete, settings, staff)
- [ ] Knows the hard stops (money, data, safety, legal) and how to escalate to Ken
- [ ] Reason-writing habit set (every audited action needs a clear typed reason)

---

## 6. Quick "do not say this" list

- Do not promise insurance or coverage. onService is a marketplace, not an insurer. Point to the escrow protection and the guarantee fund instead (per the finalized Terms §8 wording).
- Do not quote the policy-page refund tiers (System B) as the real refund. Use System A.
- Do not promise a phone call or masked-number call. We don't have calling yet; the channel is in-app chat.
- Do not move a customer or provider off-platform for any reason.
- Do not take a money/refund/payout action you're not authorized for. If you're a plain admin, escalate to a super_admin.
