# Customer Support SOP

Purpose: the operating procedure for the onService PH customer support team. How we take questions and complaints, how fast we answer, how we escalate, and the step-by-step playbooks for the situations we see most.

This doc covers customer-side support. Provider payouts, account, and job support live in `07-provider-support-sop.md`. Disputes and the refund decision tree live in `09-trust-safety-and-disputes.md`. Money and escrow mechanics live in `10-money-and-compliance-ops.md`. The admin app screens you will use are documented page by page in `11-admin-system-training-manual.md`. Policy text and copy-paste templates also live in `13-policies-codes-and-templates.md`.

---

## 1. What support actually runs on (read this first)

Customers can open, list, view, and reply to their own support cases in the shared in-app Support screens (`/support`, `/support/new`, `/support/:id`). Internal notes are excluded from the customer response. Email and Facebook Messenger remain staffed channels; a human agent creates the ticket in admin when contact starts outside the app. The Support Queue in admin (`/support-tickets`) is the agent workspace.

Two things follow from this:

1. In-app cases enter the same support queue automatically. Email, Facebook Messenger, and later SMS contacts still need an agent-created ticket so the company has one record.
2. The support case thread is asynchronous, not a real-time live-chat promise. Per-booking customer-to-provider chat remains separate. Any admin can send an audited **Support message** from Dispatch or Booking 360. It is a system message in that booking conversation, reaches only the customer before assignment, and is visible to both booking participants after a provider is assigned.

Also true today and worth knowing before you promise anything:

- The former placeholder hotline `+63 2 8123 4567` has been removed from the app. No phone support number is provisioned. Until a real number and staffing are live, do not tell customers to call expecting a pickup.
- There is no masked-number calling between customer and provider, even though one safety screen says there is. Customers reach providers by in-app chat only. Do not tell a customer to "call the provider."

---

## 2. Channels and hours

### Channels we run

| Channel | Address / surface | Who watches it | Notes |
|---|---|---|---|
| Email (customer) | `support@onservice.ph` | Support agents | Hardcoded in-app. Primary written channel. |
| Email (provider) | `providers@onservice.ph` | Provider support | Routed to provider team (see `07-provider-support-sop.md`). |
| Facebook Messenger | onService PH page | Support agents | Launch channel. Filipino customers expect Messenger. Confirm the page is set up. |
| In-app support cases | Support inbox in customer/provider workspace | Support agents | Customer opens and follows their own case; internal notes never appear. |
| Phone / SMS hotline | Not provisioned | Support agents | The former placeholder is removed; do not advertise phone support until a real number and staffing exist. |
| Booking participant support message | Dispatch Console or Booking 360 | Support agents / admins | Audited system message in the booking conversation plus participant notice. Customer-only before provider assignment; visible to both participants after assignment. It is not an admin live-chat inbox. |
| DPO / privacy requests | `dpo@onservice.ph`, `privacy@onservice.ph` | DPO / compliance | Data requests go here, not to general support. See section 9. |

> **Set (editable):** staff email plus Facebook Messenger first (low cost, async, fits a small team), and add a real phone/SMS hotline once volume warrants the staffing. Email is the primary written channel. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** provision a real hotline number before advertising phone support and decide voice vs SMS-only at that time. The placeholder has already been removed from the app. _Recommended default. To change it, edit here and anywhere this value is referenced._

### Hours

> **Set (editable):** support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT (regular Philippine business hours). Sunday is closed at launch; urgent safety issues still escalate via the on-call path. Tighten to 5:00 PM or extend evening coverage as the booking curve shows. _Recommended default. To change it, edit here and anywhere this value is referenced._

The app must show the same hours to customers. Match the line above exactly.

- Staffed hours: Monday to Saturday, 8:00 AM to 6:00 PM PHT (Asia/Manila).
- Outside hours: auto-reply that sets the next-response expectation, plus the safety routing below.
- Safety and emergencies are 24/7 self-serve in the app: the safety screen has a "Call 911" button. We do not handle 911-type emergencies. We route to 911 and log an incident (see `09-trust-safety-and-disputes.md`).

---

## 3. Ticket lifecycle

Every contact becomes a ticket in admin, even if you resolve it in one reply. That is how we get a record and a number.

Before creating or opening a ticket, use the Customer queue (`/customers`) as the account-level triage entry:

1. Keep the default **Support attention** order unless you are looking for a specific account. Search accepts full name, phone, email, or customer ID.
2. Read account state and fraud-review state separately. **Inactive (includes suspended)** is the account filter; fraud review is an independent risk signal and must not be described to the customer as an account status.
3. Check active/lifetime bookings, open support cases, and open/all booking-linked disputes before replying. Open the linked booking or existing case instead of creating a disconnected duplicate.
4. Ordinary support accounts see masked phone and email values in the queue. Open Customer 360 and use the audited reveal control only when the complete value is needed for the support task.
5. Use the row's **Support** exit to prefill a user-bound queue or case-creation context. Use **Bookings** to carry the customer ID into the booking queue. Do not copy and paste an arbitrary account identifier into a case.
6. The queue's completed value is gross completed booking value. Confirm payment attempts, wallet entries, refunds, and net outcome in Customer 360 or Booking 360 before making a money statement.

```
contact comes in (in-app / email / FB / SMS)
        |
   agent creates ticket in admin  -> status: open
        |
   agent picks it up / is assigned -> status: in_progress
        |
   need something from the customer? -> waiting_on_customer
   need something from the provider? -> waiting_on_provider
   beyond support's authority?       -> escalated
        |
   fixed and confirmed -> resolved  (resolution note, min 10 chars)
        |
   no further action  -> closed
```

Ticket fields in admin (`/support-tickets`):

- Ticket number: `TKT-####` (auto, starts at 1000).
- Type: `booking_issue`, `payment_issue`, `provider_no_show`, `app_bug`, `account_issue`, `general_inquiry`.
- Status: `open`, `in_progress`, `waiting_on_customer`, `waiting_on_provider`, `escalated`, `resolved`, `closed`.
- Priority: `low`, `medium`, `high`, `urgent`.
- Assignee: the agent.
- Messages: threaded replies to the user, plus admin-only internal notes.

Rules:

- One issue, one ticket. If a customer raises two unrelated things, open two tickets so SLAs and resolution notes stay clean.
- Resolving or closing requires an internal resolution note of at least 10 characters. Write what you actually did, not "resolved." This note is for the Admin audit record and is not shown to the customer. Send the customer a separate public reply that clearly explains the outcome before resolving when the case requires a response.
- Internal notes are for us. Never put anything in a reply-to-user message that you meant as an internal note.
- If the ticket is waiting on the customer or provider and that user replies, the system returns it to `in_progress` when assigned or `open` when unassigned. Resolved and closed user threads are read-only; create a new case if a genuinely new issue remains.
- For email or Messenger intake, first open Customer 360 or Provider 360, then use **Create support case**. Do not paste an arbitrary user or booking ID. The resulting case belongs to that account and records the acting admin.

---

## 4. Triage and priority (P1-P4)

Set priority the moment you read the ticket. Priority drives SLA. The admin priority field maps to P1-P4 like this.

Priority is an internal triage decision. Ordinary customer/provider intake starts at `medium`; participants cannot choose low or high. The dedicated in-app safety-report entry may flag a case `urgent`, shows the user that it is not an emergency line, and must still be confirmed or corrected by the first agent review.

| Level | Admin priority | What it means | Examples |
|---|---|---|---|
| P1 | `urgent` | Safety, money moving wrong, or many customers blocked | Safety incident reported by a customer; payment taken but no booking; escrow released to the wrong party; a city-wide "no provider available" wave; suspected fraud on an account. |
| P2 | `high` | One customer blocked, money or live job at stake | Provider no-show on a live booking; payment failed and customer cannot book; double charge; quality complaint that needs a dispute; cannot log in (OTP) before a scheduled job. |
| P3 | `medium` | Real problem, not time-critical | Reschedule request; cancellation + refund question; "where is my refund"; change-order confusion; app bug that has a workaround. |
| P4 | `low` | Question, no blockage | How does escrow work; how do I tip; how to add an address; general how-to. |

When unsure, round up one level. A P3 that involves money in motion is a P2.

Safety always wins. Anything with injury, threat, theft in progress, or a customer who feels unsafe is P1 and follows the safety path in `09-trust-safety-and-disputes.md` regardless of what else is in the ticket.

---

## 5. SLA targets

Starting targets, measured in staffed hours (Monday to Saturday, 8:00 AM to 6:00 PM PHT). Tune with real data after launch.

| Priority | First response | Resolution target |
|---|---|---|
| P1 `urgent` | 15 minutes | 4 hours (or active updates every hour until closed) |
| P2 `high` | 1 hour | Same business day |
| P3 `medium` | 4 hours | 2 business days |
| P4 `low` | 1 business day | 3 business days |

Notes:

- "First response" means a human reply that engages with the actual issue, not the auto-acknowledgement.
- If a ticket sits in `waiting_on_customer`, the resolution clock pauses. The first-response clock does not.
- The system currently auto-confirms a completed job and releases escrow after 24 hours, but the filing API and customer promise allow a dispute for 48 hours. This is the open E18 money-path contradiction, not a policy to explain away. Treat any case filed after release as a super-admin/Ken escalation and do not claim its money was re-held.

---

## 6. Escalation matrix

Support agents cannot move money or change account state. Those actions are super-admin only in the admin app and every one writes an audited reason. Know what you can do and what you must hand up.

Before setting a case to `escalated`, assign an active case owner. The current owner remains accountable until another owner accepts the case. In the escalation handoff, record the destination, decision needed, evidence already checked, next action, and urgency. An escalation status without a named owner is rejected.

> **Set (editable):** money actions (refund, payout, escrow release) stay with `super_admin` staff and never reach a support agent. The live API and admin UI enforce that account-role gate. The finer named `finance` role is metadata until a separate authorization decision is implemented. _Recommended default. To change it, edit here and anywhere this value is referenced._

| Situation | Support agent does | Escalate to | Why |
|---|---|---|---|
| Refund inside policy, escrow still held | Explain policy, file/guide the dispute or cancellation | Super-admin (refund/escrow release) | Escrow release, refund, and force-complete are super-admin only. |
| Refund outside policy / goodwill credit | Recommend with reason | Ops Lead / super-admin | Money out needs an audited super-admin action. |
| Dispute needs a decision | Gather evidence, set context | Super-admin (resolve dispute) | Dispute resolution is super-admin only, decision note min 20 chars. |
| Provider behavior: rude, late pattern, suspicious | Document, flag | Trust & Safety / super-admin (suspend) | Suspend is super-admin and freezes that provider's in-flight escrow. |
| Fraud suspicion on a customer | Document, flag | Trust & Safety / super-admin | "Flag for fraud review" is super-admin on the customer detail page. |
| Data request (download, correct, delete) | Point to in-app flow, log | DPO (`dpo@onservice.ph`) | Privacy case, DPO-owned. The displayed date is an internal target under E40. See section 9. |
| App is broken (bug) | Reproduce, capture screenshots | Engineering via `app_bug` ticket | Code change, not a support fix. |
| Legal / insurance question | Use approved wording only | Do not freelance | "Marketplace, not an insurer." Do not improvise legal language. |

---

## 7. Tone and voice (bilingual)

We are the trust layer. The competitor is the Facebook-group informal economy. Sound like a calm, competent person who has the customer's back.

Principles:

- Lead with the human, then the fix. Acknowledge, then act.
- Plain language. No jargon. Say "the payment is held safely until the job is done," not "funds are in escrow pending release."
- Match the customer's language. If they write in Bisaya or Tagalog, reply in kind. English is fine if they used English.
- Never blame the customer. Even on a no-show or a misunderstanding, stay on their side of the table.
- Be specific about timing. "Within 24 hours" beats "soon."
- No false promises. We do not have masked calling. The hotline is not live. Do not say we do.

Quick bilingual openers (adapt, do not robot-paste):

- EN: "Thanks for reaching out, and sorry for the trouble. Let me sort this out for you."
- TL: "Salamat sa pag-message, at pasensya na sa abala. Aayusin ko ito para sa inyo."
- Bisaya: "Salamat sa imong pag-message, ug pasaylo sa samok. Ako ni ayohon para nimo."

Closers:

- EN: "You are all set. Anything else I can help with?"
- TL: "Ayos na po. May iba pa po ba akong maitutulong?"
- Bisaya: "Okay na ni. Naa pa ba koy ikatabang nimo?"

---

## 8. Playbooks (most common scenarios)

Each playbook is numbered steps. The approved instant-pay order is customer payment into escrow followed by provider matching. Only a server-verified paid/held state proves that happened. E33 records that the current create-time auto-dispatch path can start an offer before payment, so an offer, provider notification, or assignment is not payment evidence.

ACCURACY NOTE for everyone: E03 approved pay first, then match. E33 holds the conflicting create-time offer behavior for a dedicated money-path correction; do not manually change booking/payment state or the production setting as a workaround. E14 remains a launch blocker for the current external hosted PayMongo link, which is invalid. Do not ask customers to retry card/GCash/Maya/QR Ph or wallet top-up with real money through that link. Preserve the booking/top-up identifier and follow playbook 8.5.

### 8.1 Booking help (how do I book / I can't finish a booking)

1. Confirm what they are trying to do: book a service, or finish a booking that stalled.
2. For a fresh booking: confirm their city is a live service area. If their area is not active, there is no provider to match. Tell them honestly and offer to log them on the waitlist (note it on the ticket; the area waitlist is run manually until self-serve is confirmed).
3. Confirm the booking has real latitude/longitude captured from a map pin or device location. A typed city or saved address without coordinates is not dispatchable and must never be replaced with a city-center guess.
4. Confirm the service category exists in their area (cleaning, aircon, plumbing, electrical, etc.).
5. Remind them how it works, in plain words: pick the service, confirm the price shown (the price is set by us, not typed in by the customer), pay, then we match a vetted provider to you.
6. If they cannot finish at the pay step, treat it as a payment issue (8.5).
7. Log a `booking_issue` ticket if anything is unresolved.

### 8.2 Provider late or no-show

1. Open the booking in admin (Booking detail, `/bookings/:id`). Check status and the timeline. Relevant live statuses: `paid`, `provider_en_route`, `provider_arrived`, `in_progress`.
2. If the provider has not started: tell the customer to message the provider in the app for a live ETA. We do not have call/masked-number, so chat is the channel.
3. If the provider is genuinely a no-show (did not arrive, not responding):
   - Set ticket type `provider_no_show`, priority P2.
   - Two clean outcomes: re-match a new provider, or cancel with a fair refund.
   - Re-match: escalate to Dispatch / super-admin to reassign on the Dispatch Console (reason required). Any admin may send a participant Support message before or after the reassignment; remember that the assigned provider can see it.
   - Cancel for provider no-show: this is a provider-fault cancellation. The customer should get a full refund. The platform also funds a small apology credit for a provider no-show (default ₱200 in the displayed policy). Escalate the refund to super-admin; you cannot move the money yourself.
4. If the job was already marked complete but the provider never really showed, that is a dispute of type `no_show`. Send them to 8.6.
5. Reassure on timing and log the outcome.

### 8.3 Rescheduling

> **Set (editable):** cancel-and-rebook is the standard at launch. There is no separate reschedule flow that changes a confirmed booking's time. _Recommended default. To change it, edit here and anywhere this value is referenced._

1. Confirm the new date/time the customer wants.
2. There is no self-serve reschedule button that changes a confirmed booking's time. Treat a reschedule as cancel-and-rebook.
3. For cancel-and-rebook, the refund follows the cancellation brackets (8.4). Time the cancellation to land the customer in the best bracket they honestly qualify for, but do not coach fraud.
4. If the provider agreed to the new time directly in chat and nothing about money changes, note it on the ticket and let it ride. Confirm the provider actually agreed.
5. Log a `booking_issue` ticket.

### 8.4 Cancellation and refund requests

Important: two cancellation systems exist and they disagree. Flag this and follow the right one.

- The numbers that actually move money are the live settings brackets below. This is what fires when an escrow-held booking is cancelled. Until the two systems are reconciled (a known open issue), quote these live numbers, not the policy page.
- The customer-facing policy page shows a different versioned tier table. The displayed page is NOT the one applied to the refund. Full detail and the policy summary live in `13-policies-codes-and-templates.md`. When a customer quotes the policy page back at you and it does not match what they got, this mismatch is why. Be honest, apologize for the confusion, and escalate if the gap cost them money.

Live refund brackets (customer cancels, percentage of service price; the service fee is returned in full except on a no-show). These are admin-tunable starting values:

| When the customer cancels | Customer refund (service price) |
|---|---|
| More than 24h before | 100% |
| 2 to 24h before | 100% |
| 1 to 2h before | 90% |
| 30 min to 1h before | 80% |
| Under 30 min before | 70% |
| Provider already arrived | 50% |
| Customer no-show | 0% (service fee also kept) |

Steps:

1. Find the booking, read the status and the scheduled time. Compute how many hours until the scheduled start.
2. Tell the customer the bracket they fall in and the resulting refund, in pesos, before anything happens. No surprises.
3. If the booking is still pre-payment or the provider is not matched yet, cancellation is simpler and the customer is generally made whole. Confirm in admin.
4. The actual cancel-with-refund on an escrow-held booking is a money action. Walk the customer through the in-app cancel if it is available to them; if the refund needs an admin to push it, escalate to super-admin and tell the customer the timeline.
5. Verify the real payment method, gateway transaction, refund submission result, destination, and reference before quoting status or timing. Internal wallet outcomes follow the wallet ledger. A historical verified external payment may require a PayMongo refund, but E14 blocks new hosted external authorization and a pending redirect is not refundable money. Never say "processed" from an internal case status alone.
6. Provider-fault cancellations (no-show, provider cancelled) are full refund, not the customer brackets. Do not apply the customer table to a provider's fault.
7. Log the ticket with the bracket, the amount, and who approved any escalation.

### 8.5 Payment failed / instant-pay confusion

1. Determine whether the customer used internal wallet or an external PayMongo-labelled method, and capture the exact booking/top-up identifier and visible error.
2. Look up the booking and payment attempt in admin.
   - For an external attempt in `awaiting_payment`, `payment_pending`, or failed state, do not infer a charge and do not ask the customer to retry the current hosted link. E14 proves that link is invalid. Escalate as `payment_issue`, preserve the gateway identifier, and verify the customer's real statement before saying whether money moved.
   - For an internal-wallet attempt, use the wallet transaction and booking/escrow records as the authority. If no debit exists, the customer was not charged; if a debit exists without the matching booking/escrow transition, treat it as P1.
3. Minimum payment is ₱100. If they tried to pay less than that, that is the block. Explain it.
4. "I paid but no provider came yet": first verify `paid` plus held escrow. Only then explain that matching follows payment and check that an offer cycle is actually running. If payment is merely pending, do not say money is held. An existing offer or provider assignment does not override this check while E33 is open.
5. Double charge or charged-but-no-booking: P1. The webhook checks for amount mismatches and will not apply a tampered or mismatched payment, but a real double charge gets escalated to super-admin for a refund immediately. Do not make the customer wait on a P1 money issue.
6. Wallet top-up questions: top-up minimum ₱100, max ₱50,000 per transaction. All 12 production attempts inspected for E14 remained `awaiting_payment`. Check the attempt and escalate; do not manually credit the wallet or send the customer back through the invalid link.

### 8.6 Quality complaint -> dispute

1. Hear them out and capture specifics: what was wrong, when the job finished, photos if any.
2. Check the clock. A dispute can be filed only within 48 hours of job completion, and only when the booking is `completed_by_provider` or `confirmed`. If they are outside 48 hours, the dispute path is closed and this becomes a goodwill judgment call (escalate).
3. Tell them disputes are self-serve in the app and walk them to it: their booking, then file a dispute. Dispute types: `no_show`, `incomplete`, `substandard`, `damage`, `theft`, `overcharge`, `other`.
4. Evidence: description must be at least 50 characters. Photos are required for damage and theft, optional otherwise (up to 10).
5. Set expectations honestly: the provider has 48 hours to respond. Contesting sends the response to staff review. No response auto-escalates the case to tier 3 for staff review; it does not automatically refund the customer. Direct provider acceptance and partial-offer settlement are held by E24 until the escrow-safe redesign is approved.
6. If the customer cannot or will not use the in-app flow, we can capture it, but resolution and any refund are super-admin actions. Escalate with the evidence attached.
7. Tag the ticket `booking_issue`, link the dispute, and hand the decision to the disputes path in `09-trust-safety-and-disputes.md`.

### 8.7 Account and login (OTP) issues

1. Logins are phone number plus OTP. No passwords for customers. If they cannot get in, it is almost always the OTP.
2. "I didn't get the code":
   - Confirm the exact mobile number, format `+63 9XX XXX XXXX`. A wrong digit is the usual cause.
   - Resend has a cooldown and an hourly cap (5 requests/hour by default). If they have hammered resend, they may be rate-limited. Have them wait and try once.
   - After repeated failures the app shows a captcha (Cloudflare Turnstile) before letting them request another code. Walk them through completing it. This is anti-bot, not a punishment.
3. "Code says expired / too many attempts": the code invalidates after the max attempts or on timeout. Have them request a fresh code and enter it carefully; the app auto-submits on the sixth digit.
4. "I changed my number": this is an account change, not a code fix. Number changes are handled by support, not self-serve. Verify identity before doing anything (see the identity-proof rule below), and escalate if it touches account access.

   > **Set (editable):** to change the number on file, require the most recent booking reference plus the registered full name plus an OTP to the number currently on file when possible. If the old number is lost and no OTP can be sent, escalate to super-admin. _Recommended default. To change it, edit here and anywhere this value is referenced._

5. Never read, ask for, or accept an OTP code from a customer. We never need it. The code is hashed server-side and we cannot see it. Anyone asking a customer for their code is running a scam; tell the customer that.
6. Tag the ticket `account_issue`.

---

## 9. Data and privacy requests (route, do not handle)

If a customer asks to download, correct, or delete their data, that is an NPC data-subject request under RA 10173, owned by the DPO.

1. Point them to the in-app flow first: the Data & Privacy screen lets them download data, correct info, or delete their account self-serve (delete requires typing "DELETE"). There is also a separate "Account & Data" screen with export (JSON/CSV) and a 30-day cooling-off account deletion they can cancel themselves.
2. If they want a human to handle it, route to `dpo@onservice.ph`. Do not action it from a support seat.
3. Set the expectation: our current internal target is to acknowledge the request within 2 business days and respond by the target shown in the privacy case (currently 15 days). Do not call that target an NPC-mandated completion deadline while E40 is open. Some transaction, dispute, tax, security, or compliance evidence may need to be retained; do not quote a retention period or promise total deletion while the E21/E22 retention design is unresolved.
4. Never resolve a data request by closing the support ticket as if support handled it. Log that it was routed to the DPO.

---

## 10. Canned-response macros

Copy, then personalize. Fill the brackets. Keep these in sync with `13-policies-codes-and-templates.md`.

### M1 - Auto-acknowledgement (after hours)

> Thanks for reaching onService PH. We received your message. Our support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT, and we will get back to you within those hours. If this is a safety emergency, please call 911.

### M2 - Provider running late

> Hi [name], thanks for flagging this. I can see your booking [TKT/booking ref]. The fastest way to get a live ETA is to message your provider directly in the app on the booking screen. I am also keeping an eye on this from our side. If they do not show within [X] minutes, message me back and I will get you a new provider or sort out a refund.

### M3 - Provider no-show, offering re-match or refund

> Hi [name], I am sorry your provider did not show up. That is not the standard we hold. Two options: I can match you with a new vetted provider now, or cancel this booking with a full refund plus a ₱200 credit for the trouble. Which would you prefer?

### M4 - Cancellation refund explained

> Hi [name], here is the current cancellation estimate. Your job is scheduled for [time], which is [X hours] away, so the live bracket calculates [percent] of the service price (₱[amount]) plus any refundable service fee actually charged. I will confirm the payment record and show you the recorded refund status, destination, and reference after the authorized action. Want me to request the cancellation?

### M5 - Payment attempt needs review

> Hi [name], I found payment attempt [reference] in status [status]. I am checking it before asking you to try anything again. Please do not repeat the payment yet. Send me the method, time, exact error, and any bank/e-wallet transaction reference (never your OTP or full card details), and I will confirm the safe next step.

### M6 - Instant-pay reassurance (paid, no provider yet)

> Hi [name], I verified that booking [reference] is paid and held safely in escrow. Under our setup payment comes before matching, so a short wait can be normal. I can see matching is in progress and will check back if it takes longer than expected.

### M7 - How to file a dispute

> Hi [name], I am sorry the job did not meet the mark. You can raise this in the app: open the booking, then choose to file a dispute, within 48 hours of completion. Add a short description (at least a couple of sentences) and photos if you have them. The provider has 48 hours to respond. Whether they contest or do not reply, our team reviews the case and records the decision; silence is not an automatic refund. Want me to walk you through it?

### M8 - OTP not arriving

> Hi [name], let us get you back in. Please confirm your number is entered as +63 9XX XXX XXXX with no missing digits. If you requested several codes quickly, wait a minute (there is a limit to stop spam) and request one more. If a quick "verify you're human" box appears, complete it and the code will send. Heads up: we will never ask you for your code. Anyone who does is a scammer.

### M9 - Data / privacy request routing

> Hi [name], you can handle this yourself in the app under Account & Data: download your data, correct it, or request account deactivation and anonymization. If you would rather we process it, email dpo@onservice.ph. Our current target is to acknowledge the request within 2 business days and respond by the target recorded on the case.

### M10 - No-insurance / liability (interim E10/F#10 wording)

> onService PH is a marketplace, not an insurer. We verify provider identity
> documents and provide a dispute process. If your booking record shows payment
> is held, it stays in the platform escrow flow until release, refund, or admin
> resolution. Final guarantee/protection wording is under legal review, so I
> cannot promise a coverage amount or outcome. I will escalate any loss beyond
> the booking amount. (Interim wording only; do not add a guarantee or insurance
> claim. Legal questions go up, not out.)

---

## 11. Daily support checklist

- [ ] Inbox zero attempt on email + FB at start, midday, and end of shift.
- [ ] Every open contact has a ticket with a type, a priority, and an assignee.
- [ ] Clear the Admin **Needs reply** queue. It ignores assignment, workflow changes, and internal notes; only a public agent reply clears the marker until the participant replies again.
- [ ] No P1 ticket older than 15 minutes without a human reply.
- [ ] No P2 ticket sitting past first-response SLA.
- [ ] Anything money-moving or account-changing is escalated, not sat on.
- [ ] Manually review `waiting_on_customer` tickets. Automated reminders and five-day auto-close are not implemented; do not tell users they were sent.
- [ ] Resolved tickets have a real resolution note (min 10 chars), not "fixed."
- [ ] Safety and fraud flags logged and escalated same shift.
- [ ] Hand off open P1/P2 at shift change with a one-line status each.

---

## Open decisions set in this doc

- **Channels staffed first:** email plus Facebook Messenger first, add a phone/SMS hotline as volume warrants. (editable)
- **Support hotline:** the placeholder is removed; provision and staff a real number before advertising phone support (decide voice vs SMS-only then). (editable)
- **Support hours:** Monday to Saturday, 8:00 AM to 6:00 PM PHT; Sunday closed at launch with safety escalation only. (editable)
- **Money-action gating:** the live gate is `super_admin`; support agents use `admin`. Named finance permissions remain metadata until the authorization architecture is resolved. (editable)
- **Reschedule:** cancel-and-rebook is the standard at launch; no separate reschedule flow. (editable)
- **Phone-number-change identity proof:** most recent booking reference + registered full name + OTP to the number on file; escalate to super-admin if the old number is lost. (editable)
- **`waiting_on_customer` follow-up:** manual until reminder and auto-close automation is implemented and tested. The intended five-day/two-reminder policy is not current system behavior. (editable)
