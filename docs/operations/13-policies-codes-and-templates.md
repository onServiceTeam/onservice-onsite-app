# 13. Policies, Codes and Templates

Purpose: one reference pack for the ops team. Plain-language cancellation and refund rules, the customer and provider codes of conduct, the per-category skills question bank, and a copy-paste template library for recruiting, support, disputes, vetting, QA, shift handover, and incident reports.

Related docs: cancellation and refund money mechanics live in `10-money-and-compliance-ops.md`; provider conduct detail and onboarding in `05-provider-onboarding-and-training.md`; support flows in `06-customer-support-sop.md` and `07-provider-support-sop.md`; disputes in `09-trust-safety-and-disputes.md`; admin page how-to in `11-admin-system-training-manual.md`; KPIs and the scorecards in `12-quality-standards-and-kpis.md`.

All money in this doc is PHP (₱). Times are Asia/Manila (PHT). Support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT. All numbers marked "starting target" are meant to be tuned once we have real volume.

---

## 1. Cancellation policy (plain language)

We run an instant-pay escrow model. The customer pays first into the platform escrow wallet, then a provider is matched. So almost every cancellation involves money already held in escrow, and the refund is computed automatically.

> IMPORTANT for the team: there are TWO cancellation systems in the app right now, and they do not match. Until they are reconciled, always quote the LIVE money-path numbers (System A below), not what the policy page shows (System B). This is a known open issue, tracked in the decisions list at the end of this doc.

**System A, what actually moves the money (live).** When a paid booking (escrow held) is cancelled, the app reads the hours until the scheduled time and applies these brackets. These are admin-tunable in admin Settings (`cancel_refund_*` keys).

| Time before scheduled start | Customer refund of service price | Service fee |
|---|---|---|
| More than 24 hours | 100% | refunded |
| 2 to 24 hours | 100% | refunded |
| 1 to 2 hours | 90% | refunded |
| 30 min to 1 hour | 80% | refunded |
| Under 30 min | 70% | refunded |
| Provider already arrived | 50% | refunded |
| Customer no-show | 0% | fee kept by platform |

On a customer cancel, the customer gets the refund percentage of the service price PLUS the full service fee back, except a no-show where we keep the fee. The provider compensation is the inverse of the customer refund percentage.

**System B, what the policy page and the admin Cancellation Policy editor show (display only).** This is the versioned tier table at `/settings/cancellation-policy`. It currently shows: 24+ hours 100% refund, 4 to 24 hours 75%, under 4 hours 50%, after scheduled or no-show 0%. It is NOT wired to the actual refund. It is customer-facing text only.

> **Set (editable):** until the two systems are reconciled, support always quotes the LIVE System A numbers for any real refund amount. System A and System B disagree (for example, 2-to-24h is 100% in A but 75% in B). Reconciling the two into one set of brackets and pointing both at it is a Ken decision and a known open issue. _Recommended default. To change it, edit here and anywhere this value is referenced._

**Provider no-show.** Separate rule. The customer gets a 100% refund plus a platform-funded apology credit (default ₱200, `provider_no_show_credit_php`). This is goodwill from us, not from the provider.

---

## 2. Refund policy (plain language)

Refunds come out of escrow and are pushed back to the customer through PayMongo. They land on the original payment method (GCash, Maya, card, QRPH) or as wallet balance if they paid from wallet. Bank-card refunds can take a few business days on PayMongo's side; tell customers 5 to 7 business days as a starting target.

When a refund happens:

- **Cancellation.** Auto-computed per System A above.
- **Dispute.** Resolved by admin. Resolution types: full refund, partial refund (you set a percent), no refund, free redo, refund with warning, refund with suspension, split decision. Full refund, refund with warning, and refund with suspension are all 100%. Any remaining escrow after a partial refund still goes to the provider.
- **Unresponded dispute.** If the provider does not respond within 48 hours, it resolves in the customer's favor (full refund).
- **No-provider-available.** If dispatch never finds a provider, the booking expires (72h cap) and the customer is refunded in full, plus a ₱150 goodwill credit for the platform failure (see `08-dispatch-and-matching-sop.md`).

Dispute filing window is 48 hours after job completion. Damage and theft disputes require photo evidence. Refunds over ₱10,000, any refund-with-suspension, and any damage or theft payout need super-admin (Ken) sign-off. See `09-trust-safety-and-disputes.md` for the full decision tree.

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
- [ ] File disputes in good faith with real evidence. Repeated bad-faith disputes get the account flagged (the dispute screen tracks a 90-day risk pattern: `OK` / `REVIEW_REQUIRED` / `AT_RISK`).

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

## 5. Per-category skills question bank

Use this during vetting (admin Provider detail) and again as a spot-check during QA. It is a written knowledge check, not a substitute for the on-site work standard. Ask 4 to 6 questions per category the provider applied for, mix in one safety question every time, and record the result in the provider's admin Notes (category: quality) until a dedicated field exists. A clear wrong answer on a safety question is a fail regardless of the rest.

Pass mark is a starting target: at least 4 of 6 correct, with no safety-question miss.

### 5.1 Cleaning

| # | Question | Looking for |
|---|---|---|
| 1 | What do you use on an unsealed wood floor versus tile? | Knows not to soak wood; damp mop only, pH-neutral cleaner |
| 2 | A customer asks you to mix bleach and a toilet cleaner for a tough stain. What do you do? | Refuses; never mix bleach with acid or ammonia (toxic gas). Safety |
| 3 | How do you handle a customer's fragile or valuable items while cleaning around them? | Move with care or leave in place, flag anything already damaged before starting |
| 4 | What is your checklist for a standard 1-bedroom deep clean? | Logical room-by-room order, kitchen and bathroom sanitized, dust before mop |
| 5 | What personal protective equipment do you bring? | Gloves at minimum, mask for strong chemicals or dust. Safety |
| 6 | Customer is not happy with one room after you finish. What do you do? | Re-do the area, stay calm, escalate via the app if unresolved |

### 5.2 Aircon

| # | Question | Looking for |
|---|---|---|
| 1 | What is the first thing you do before opening or servicing any aircon unit? | Switch off and unplug or trip the breaker. Safety |
| 2 | Walk me through a basic split-type cleaning. | Filters, coils, blower, drain line, condensate check, reassemble and test |
| 3 | A unit is not cooling. What are the common causes you check? | Dirty filter or coil, low refrigerant, blocked drain, capacitor or fan, thermostat |
| 4 | How do you handle refrigerant safely and legally? | No venting to air, proper recovery, knows handling is regulated. Safety |
| 5 | What do you tell a customer if the unit needs a part you do not have? | Quote it as a change order in the app, never demand cash on site |
| 6 | How do you protect the customer's wall and floor during a wall-mount clean? | Drip sheet or cleaning bag, towels down, clean up water |

### 5.3 Plumbing

| # | Question | Looking for |
|---|---|---|
| 1 | Before you open a pipe or fixture, what do you shut off first? | Local or main water valve; relieve pressure. Safety |
| 2 | Customer has a slow drain. How do you diagnose before reaching for chemicals? | Check the trap and strainer, plunger or auger first, avoid harsh chemicals on old pipes |
| 3 | How do you fix a leaking compression fitting? | Tighten correctly, replace the washer or ferrule, do not overtighten and crack it |
| 4 | You find a hidden leak that means opening a wall. What do you do? | Stop, document with photos, raise a change order, do not exceed scope without approval |
| 5 | What is your rule on working near electrical fixtures or water heaters? | Power off, keep water away from electrics, knows when it is out of scope. Safety |
| 6 | How do you leave the work area when you are done? | Test for leaks, clean up, no water damage left behind |

### 5.4 Electrical

| # | Question | Looking for |
|---|---|---|
| 1 | What is your first step before working on any circuit or outlet? | Trip the breaker, confirm dead with a tester. Safety |
| 2 | How do you confirm a wire is not live? | Voltage tester or multimeter, never by touch. Safety |
| 3 | A customer wants you to bypass or oversize a breaker so an appliance stops tripping. What do you do? | Refuse, explain the fire risk, find the real cause. Safety |
| 4 | How do you wire a standard outlet (line, neutral, ground)? | Correct terminals, ground connected, tight connections, no exposed copper |
| 5 | What do you do if you find old, brittle, or damaged wiring? | Flag it, photo it, quote a change order, do not hide it |
| 6 | When is a job out of your scope and time to escalate? | Main panel work, suspected code violations, anything unsafe to leave |

---

## 6. Template library

Copy-paste ready. Replace `[bracketed]` fields. Bilingual (English with Bisaya or Tagalog) where it helps reach providers and customers.

### 6.1 Provider outreach (recruiting)

**SMS / Messenger first contact:**
> Hi [Name], this is [You] from onService PH. We're a home-services app launching in [City] and we're looking for vetted [trade, e.g. aircon] pros. Steady jobs, you keep most of the pay, weekly payouts to GCash/Maya. Interested? Reply YES and I'll send the next steps.

> Bisaya: Maayong adlaw [Name]! Si [You] ni gikan sa onService PH. App mi para sa home services, mangita mi og kasaligan nga [trade] dinhi sa [City]. Naa'y kanunay'ng trabaho, dako imong kita, weekly payout sa GCash/Maya. Interesado ka? Reply YES.

**Follow-up after interest:**
> Salamat [Name]. To apply you'll need 3 things ready: a valid government ID, your NBI clearance (issued within the last 6 months), and a selfie. The app walks you through it in about 10 minutes. Here's the link: [link]. Questions? Message me here.

**Referral invite (to an existing provider):**
> Hi [Name], know another good [trade] pro? Refer them to onService. You get ₱500 and they get a ₱300 welcome bonus once they finish their first 3 jobs. You can refer up to 10 people a month. Reply for the referral link.

### 6.2 Provider approval message

(The app also sends an automatic "Account Approved" notification. Use this for a personal touch.)
> Congrats [Name], you're approved on onService as a [tier] provider. Your commission is [X]% per job. Keep your NBI current and your ratings up to move to the next tier. First jobs will start coming through as offers (about 1 minute to accept). Welcome aboard.

### 6.3 Provider rejection message

(Reason is required and stored. Be specific and kind. Use a reason code R01-R10, see `04-provider-vetting-sop.md`.)
> Hi [Name], thanks for applying to onService. We can't approve your application right now because: [specific reason, e.g. "the NBI clearance uploaded is older than 6 months"]. You're welcome to re-apply once that's sorted. If you think this is a mistake, reply here and we'll take another look.

### 6.4 Customer support macros

**Booking help:**
> Hi [Name], thanks for reaching out. I can see your booking [#bookingID] is currently [status]. [Explain plainly what that status means and what happens next.] Anything else I can help with?

**Refund (cancellation):**
> Hi [Name], I've processed the cancellation for booking [#bookingID]. Based on the timing, your refund is ₱[amount] ([X]% of the service price, quoted from our live System A brackets) plus your service fee, going back to your [GCash/Maya/card/wallet]. Card and bank refunds can take 5 to 7 business days; GCash and wallet are usually faster. I'll keep an eye on it.

**Apology + goodwill:**
> Hi [Name], I'm sorry about [what went wrong]. That's not the experience we want. I've [action taken], and I've added a ₱[amount] credit to your account as an apology. Thank you for your patience, and please give us another chance.

**Dispute update:**
> Hi [Name], an update on your dispute for booking [#bookingID]. Status: [under review / escalated / resolved]. [If resolved: Our decision is (resolution type). Your refund of ₱(amount) is on its way to your (method).] [If pending: We've asked the provider to respond; they have until (date/time). If they don't respond by then, it resolves in your favor.] We'll message you the moment there's news.

### 6.5 SMS templates (short)

- **OTP issue:** `onService: Having trouble logging in? Make sure you used +63 9XX XXX XXXX. Code is 6 digits and resends after a short cooldown. Still stuck? Email support@onservice.ph.`
- **Provider en route:** `onService: Your provider for booking [#ID] is on the way. Track and chat in the app.`
- **No provider found:** `onService: We couldn't find an available provider for booking [#ID] right now. Your payment is fully refunded and we've added a ₱150 credit for the trouble. Sorry, please try again shortly.`
- **Payout sent (provider):** `onService: Your payout of ₱[amount] has been sent to your [GCash/Maya/bank]. Salamat sa imong trabaho!`

### 6.6 Vetting scorecard template

Use during provider review (admin Provider detail, Profile tab). Pass mark is a starting target; tune it.

| Item | Check | Pass? |
|---|---|---|
| Government ID front + back | Clear, name matches application | [ ] |
| NBI clearance | Uploaded, issued within 6 months, not expired | [ ] |
| Selfie | Matches the ID photo (visual review, no auto-verification in v1.0) | [ ] |
| NBI expiry date recorded | Entered so the 30-day warning works | [ ] |
| Skills test | Passed (per-category question bank, section 5) | [ ] |
| References | 2 references contacted | [ ] |
| Service categories | Sensible for their skills | [ ] |
| IC agreement | Accepted at application | [ ] |

Decision: Approve / Reject (with a specific reason code R01-R10, reason text at least 10 chars) / Hold for more info. Approval is blocked by the app unless NBI, gov ID front, and selfie are all on file.

> **Set (editable):** the skills test and the 2-reference check are written policy (STRATEGIC-DECISIONS-LOG DECISION-003) but are not enforced by the app, so the team tracks them manually until a dedicated field is built. Record both results, plus the skills question-bank score, in the provider's admin Notes (category: quality). _Recommended default. To change it, edit here and anywhere this value is referenced._

### 6.7 Support QA scorecard template

Score a sample of agent interactions weekly. Each line 0, 1, or 2 (0 = miss, 2 = great). Starting passing target: 16/20.

| Criterion | Score |
|---|---|
| Greeted and identified the customer/booking correctly | [ ] |
| Diagnosed the real issue (used the right admin page) | [ ] |
| Quoted the correct policy (live System A refund brackets, real windows) | [ ] |
| Took the right action or escalated correctly | [ ] |
| Wrote a clear reason in any audited action (at or above required length) | [ ] |
| Tone: warm, plain language, no jargon | [ ] |
| Set expectations (timeframes, next steps) | [ ] |
| Followed up / closed the loop | [ ] |
| Logged it (support ticket created/updated in admin) | [ ] |
| No off-policy promises (no insurance claims, no off-platform deals) | [ ] |

Note: customers and providers can open and follow tickets in the shared in-app Support screens. Agents create a ticket in the admin Support Queue only when the contact starts through email or Facebook Messenger. Support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT; urgent safety issues escalate via the on-call path even outside those hours.

### 6.8 Shift handover template

Copy at end of shift, post in the ops channel.

```
SHIFT HANDOVER - [date] [shift, e.g. 8:00 AM to 1:00 PM PHT]
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

### 6.9 Incident report template

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

### 6.10 Onboarding checklists

**New provider activation:**
- [ ] Application approved in admin (NBI + gov ID + selfie verified)
- [ ] Tier set (default New; Founding only if invited)
- [ ] Service categories and service area confirmed
- [ ] Payout method on file (GCash/Maya 09XXXXXXXXX, or bank 8-16 digits)
- [ ] TIN collected before first payout (flag if approaching ₱500,000 YTD for BIR withholding)
- [ ] Welcome message sent; commission rate explained
- [ ] Branded shirt arranged
- [ ] Probation flagged (first 3 jobs, before/after photos)
- [ ] First-job support contact assigned

**New admin/agent onboarding:**
- [ ] User created with correct role (`admin`, or `super_admin` only if they need money/destructive actions, or `dpo` for compliance)
- [ ] TOTP 2FA enrolled at first login
- [ ] Walked through `11-admin-system-training-manual.md`
- [ ] Knows the live System A refund brackets and dispute windows by heart
- [ ] Knows what only `super_admin` can do (escrow, refunds, payouts, force-complete, settings, staff)
- [ ] Knows that money actions (refund, payout, escrow release) are gated to finance/super-admin and a plain agent login cannot reach them
- [ ] Knows the hard stops (money, data, safety, legal) and how to escalate to Ken
- [ ] Reason-writing habit set (every audited action needs a clear typed reason)

---

## 7. Quick "do not say this" list

- Do not promise insurance or coverage. onService is a marketplace, not an insurer. Point to the escrow protection and the guarantee fund instead (per the finalized Terms §8 wording).
- Do not quote the policy-page refund tiers (System B) as the real refund. Use the live System A brackets.
- Do not promise a phone call or masked-number call. We don't have calling yet; the channel is in-app chat.
- Do not move a customer or provider off-platform for any reason.
- Do not take a money/refund/payout action you're not authorized for. If you're a plain admin, escalate to a `super_admin`.

---

## Open decisions set in this doc

- **Cancellation numbers (section 1):** until System A and System B are reconciled, support always quotes the LIVE System A brackets for real refund amounts. Reconciling the two is a Ken decision and a known open issue. **(editable)**
- **Manual tracking of skills test and references (section 6.6):** both are written policy but not app-enforced, so the team records them, plus the skills question-bank score, in the provider's admin Notes (category: quality) until a dedicated field is built. **(editable)**
