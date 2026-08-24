# 09 - Trust, Safety and Disputes

Purpose: the end-to-end playbook for resolving disputes, deciding refunds and escrow releases, and handling fraud and safety incidents on onService PH.

This doc covers the resolution work. For the mechanics of how money moves (escrow hold/release/refund, PayMongo, wallet ledger), see `10-money-and-compliance-ops.md`. For provider suspension steps, see `07-provider-support-sop.md`. For support channels and triage, see `06-customer-support-sop.md`. For the admin pages named below, see `11-admin-system-training-manual.md`.

---

## 1. The money model in one paragraph (so disputes make sense)

For a booking the server has verified as paid, money is in the platform escrow wallet before provider matching. The provider does the job and the customer can confirm it. The current worker otherwise auto-confirms and releases after 24 hours, while the filing API and customer promise still allow a dispute through 48 hours. E18 records that unsafe contradiction: a case filed after release is not backed by held booking funds. Do not describe every accepted dispute as held escrow or resolve an hour-24-to-48 case as though the provider credit had been reversed. Escalate it to a super-admin and Ken until E18 is resolved. E03 implemented the initial ordering, but E14 still blocks the current external hosted PayMongo authorization link; a pending browser attempt is not held escrow.

> **Set (editable):** An "I paid but it errored" report is a payment issue, not a dispute. E03 fixed internal ordering, but E14 confirms the current external hosted checkout link is invalid. Preserve and escalate the attempt; do not retry it or infer payment from the redirect. _Recommended default. To change it, edit here and anywhere this value is referenced._

E03 ensures only verified payment may produce paid/held escrow. E14 separately blocks the external customer authorization entry and makes current external failures expected until the flow is replaced. Keep those reports in the payment/support path, preserve the gateway and booking/top-up identifiers, and do not open a dispute unless there is a completed job/payment dispute that meets the real filing rules.

---

## 2. Dispute resolution SOP (end to end)

### 2.1 Who can file, and when

A dispute can only be filed by:

- The booking customer (providers do not file disputes, they respond to them).
- When the booking is `completed_by_provider` or `confirmed`.
- Within 48 hours of completion (`escrow_dispute_window_hours`, admin-tunable). This is the accepted filing window, but it does not currently match the 24-hour auto-confirm/release worker. See the E18 hold below.
- One active dispute per booking.

Filing flips the booking to `disputed` and writes escrow state `held`. That state only represents real held money if escrow had not already released. For any case filed 24 to 48 hours after completion, do not infer that funds were re-held and do not process a money outcome until E18 is resolved. The customer files from the app (booking detail -> file dispute). Ops cannot file on a customer's behalf in-app, but can create a support ticket and walk them through it.

> **Money hold (E18):** auto-confirm/release currently happens after 24 hours but filing remains open for 48 hours. Operations must treat disputes filed after release as money-path escalations, not ordinary held-escrow cases. Do not change either window, promise a refund, or attempt a provider clawback without the approved E18 redesign.

### 2.2 Dispute types (the 7)

`no_show`, `incomplete`, `substandard`, `damage`, `theft`, `overcharge`, `other`.

Photo evidence is required in-app for `damage` and `theft` (the app blocks submission without it). For the others it is optional, but always ask for it. Description is 50-2000 characters.

### 2.3 The resolution states (ground truth)

A dispute moves through these statuses: `open` (just filed) -> `under_review` (assigned to an agent, or provider contested) -> `escalated` (tier 2 or 3) -> `resolved` (terminal). Tier is 1, 2 or 3 and only goes up.

One current path can resolve a dispute without an admin lifting a finger:

1. **Auto-resolution (no-show):** if it is a `no_show` dispute and the provider marked the job complete within 30 minutes of the scheduled time (`noshow_auto_resolve_window_minutes`), the system auto-resolves it as a full refund. The refund runs in the same transaction.

Provider non-response does **not** settle money. After 48 hours the worker moves the case to `escalated`, tier 3, for staff review and notifies the customer. Support must not promise that silence automatically wins a refund.

### 2.4 The provider's three responses

When notified, the provider has 48 hours to respond. The production-safe participant action is:

- **Contest** -> dispute moves to `under_review`, tier 2, an agent reviews.

The API contains provider **Accept**, **Partial offer**, and customer partial-accept paths, but E24 holds all three before any write because their settlement is not safely serialized with escrow and booking state. The app therefore sends providers through Contest -> admin review. Do not coach a provider or customer around this hold.

### 2.5 Standard dispute workflow (numbered SOP)

1. Dispute lands in the **Disputes** admin page (`/disputes`) via socket. Tickets sort by tier and age.
2. **Triage within target SLA** (see section 6). Open the **Dispute detail** page (`/disputes/:id`, "Dispute 360"). Read the customer claim and provider response side by side.
3. **Collect and review evidence** (section 3). Check the customer and provider 90-day history cards for the risk pattern flag (`OK` / `REVIEW_REQUIRED` / `AT_RISK`).
4. If you need more time or a specialist, **Assign to admin** (by UUID) and/or **Escalate** (reason 10+ chars, only when tier < 3).
5. **Message parties** if facts are missing (customer / provider / both, 5-2000 chars). Give a clear deadline.
6. **Decide** using the escrow/refund decision tree (section 4).
7. **Resolve and notify** (super-admin only). Pick the resolution type, set refund % for partial/split, write decision notes (20+ chars). The page shows an estimated-refund preview and a confirm step.
8. The system records the booking and escrow outcome, moves any valid internal held funds, and notifies both parties. A verified historical external PayMongo payment may also require a gateway refund; only say it was submitted after checking the real gateway result/reference. E14 blocks new hosted external authorization and does not make a browser attempt refundable money. Gateway failures are queued in `gateway_retry_queue`, but a queued item is not a completed refund.
9. If new facts surface after a resolution, a super-admin can **Reopen** (reason 20+ chars).

### 2.6 Resolution types (ground truth) and what each does to the money

| Resolution type | Customer gets | Provider gets | Notes |
|---|---|---|---|
| `full_refund` | 100% | nothing | |
| `refund_with_warning` | 100% | nothing | logs a warning on the provider |
| `refund_with_suspension` | 100% | nothing | also suspends the provider |
| `partial_refund` | `refundPercent` (0-100) | the remainder, via partial release | you set the % |
| `split_decision` | `refundPercent` (0-100) | the remainder | you set the % |
| `no_refund` | nothing | full escrow released | provider was in the right |
| `free_redo` | redo, no cash refund | escrow stays held for the redo | provider re-does the job |

Who approves: every resolution that moves money is **super-admin only** and writes a paired audit row. Plain `admin` and `dpo` see the dispute read-only with a banner.

---

## 3. Evidence collection checklist

Evidence is `dispute_evidence` rows: photo, video or document, up to 10 per filing, grouped by uploader (customer / provider / admin) on the Dispute 360 page.

Pull together before deciding:

- [ ] Customer's written claim (50+ chars, already required)
- [ ] Customer photos/videos (required for `damage` and `theft`)
- [ ] Provider's written response
- [ ] Provider photos (before/after job photos are mandatory during 3-job probation, lean on them)
- [ ] Booking timeline: GPS check-ins, `provider_en_route` / `arrived` / `in_progress` timestamps (Booking 360 -> Evidence + Timeline tabs)
- [ ] In-app chat for that booking (one thread per booking; look for `is_flagged` off-platform-bypass messages)
- [ ] Any change orders on the job (could explain an "overcharge" claim)
- [ ] 90-day history + risk pattern flag for both parties
- [ ] For payment claims, the Money tab on Booking 360 (service price, fee, total, linked dispute)

> **Set (editable):** For evidence beyond the 10-photo cap, the agent collects it over email/chat and attaches it as admin-uploaded evidence; confirm the exact admin-upload path with engineering before relying on it. _Recommended default. To change it, edit here and anywhere this value is referenced._

There is no in-app way for either party to upload extra evidence after filing beyond the 10-photo cap. For complex cases, gather anything else over email or chat and attach it as admin-uploaded evidence.

---

## 4. Escrow / refund decision tree

Use this once evidence is in. "Service price" is the provider's portion; the service fee is the platform's. Refunds are off the held escrow, so we are deciding how to split money we already hold.

```
START: dispute filed, escrow = held
  |
  +-- no_show AND provider "completed" within 30 min of schedule?
  |        -> auto-resolved as full_refund. Verify it fired, then done.
  |
  +-- Provider DID NOT RESPOND in 48h?      -> case auto-escalates to tier 3
  |        (staff reviews evidence; silence does not move money)
  |
  +-- Evidence shows job NOT done / no-show / fraud by provider?
  |        -> full_refund. If pattern of abuse -> refund_with_suspension.
  |
  +-- Job done but BELOW standard / incomplete in part?
  |        -> Is a redo practical and does customer want it?
  |              yes -> free_redo (escrow stays held for the redo)
  |              no  -> partial_refund, set % to the unfinished/poor share
  |
  +-- DAMAGE or THEFT with credible evidence?
  |        -> full_refund of the job + log incident (section 7).
  |           Damage value above the job price is a guarantee-fund / liability
  |           question, NOT a refund-% question. Escalate (section 7).
  |
  +-- OVERCHARGE / billing dispute?
  |        -> Was there an approved change order?
  |              yes, valid -> no_refund (charge was legitimate)
  |              no / not approved -> partial_refund of the disputed amount
  |
  +-- Both partly right (he-said-she-said, work partly delivered)?
  |        -> split_decision, set % by what was actually delivered
  |
  +-- Job done correctly, customer just unhappy / changed mind?
           -> no_refund (full escrow released to provider)
```

### 4.1 Refund-% starting guide (tune these)

These are starting targets, adjust as you see real cases:

| Situation | Refund % to customer |
|---|---|
| Provider no-show / job not done | 100% |
| Provider unresponsive in 48h | No automatic percentage; escalate and decide from evidence |
| Major quality failure, no redo wanted | 70-90% |
| Partial work, one of several tasks skipped | 30-50% |
| Minor quality issue, mostly delivered | 10-25% |
| Customer changed mind, work was fine | 0% |

### 4.2 Who approves which refund

| Action | Approver |
|---|---|
| Auto no-show full refund | system (verify only) |
| Provider accept / partial offer accepted by customer | Held by E24; route to super-admin review |
| Any admin-set resolution (full/partial/split/no/free_redo) | super_admin |
| `refund_with_suspension` | super_admin (suspends provider too) |
| Reopen a resolved dispute | super_admin (reason 20+ chars) |
| Out-of-band goodwill credit to a customer wallet | super_admin (Customer detail page) |

> **Set (editable):** Super-admin / Ken reviews every refund over ₱10,000, every `refund_with_suspension`, and every damage or theft payout before it is resolved. _Recommended default. To change it, edit here and anywhere this value is referenced._

There is no peso-amount threshold baked into the app, so this is a process rule, not a code gate. Agents stage the resolution and hand it to a super-admin to confirm. Anything below ₱10,000 that is not a suspension or a damage/theft payout can be resolved by a super-admin on shift without pulling in Ken.

---

## 5. Customer and provider communication during a dispute

Keep it calm, specific, and on a clock. Use the **Message parties** action on Dispute 360 (5-2000 chars). Plain English, Bisaya or Tagalog if that is what the customer used.

### Template - acknowledge to customer (on filing)
> Hi [name], we received your report about booking [#ID]. The provider has 48 hours to respond, and our team will review the case even if they do not reply. We will update you by [date/time]. I am checking the booking's payment and escrow record before I make any refund or held-funds promise.

### Template - ask provider to respond
> Hi [name], a customer filed a concern on booking [#ID]: "[short summary]". Please open the case and submit your response within 48 hours with your side and any relevant before/after photos. The current app sends your response to staff review. If you do not reply, the case escalates for review using the evidence on file.

### Template - request more info (either party)
> Hi [name], to decide booking [#ID] fairly we need [specific thing: a photo of X / the time you arrived / receipt]. Please send it here by [date/time]. If we do not hear back by then we will decide on the evidence we have.

### Template - resolution: full refund to customer
> Hi [name], we resolved booking [#ID] in your favor. The approved refund is ₱[amount]. Recorded destination: [wallet / verified original method]. Status: [submitted / completed / failed and escalated]. Reference: [reference]. We will update you when the recorded status changes. We are sorry for the trouble.

### Template - resolution: partial refund
> Hi [name], we reviewed booking [#ID]. Based on the evidence, the approved refund is ₱[amount] ([X]% of the service). The rest reflects the work that was completed. Recorded destination: [wallet / verified original method]. Status: [submitted / completed / failed and escalated]. Reference: [reference].

### Template - resolution: no refund (to customer)
> Hi [name], we reviewed booking [#ID] including the photos and timeline. The evidence shows the service was delivered as booked, so we are not issuing a refund. If you have new evidence, reply here and we can take another look.

### Template - to provider after a refund-with-suspension
> Hi [name], booking [#ID] was resolved with a full refund to the customer and your account has been suspended pending review. We will contact you about next steps. You will not receive new job offers while suspended.

Communication rules:
- Never promise a specific peso refund before a super-admin resolves it.
- Never share the other party's phone, address, or full name beyond what the app already shows.
- Always give a deadline and a next-update time.
- Log internal reasoning in internal notes (admin-only), not in messages to parties.

---

## 6. Dispute timelines and SLA targets (starting targets to tune)

| Stage | Target |
|---|---|
| First response to a new dispute | within 4 business hours |
| Provider response window (system) | 48 hours (fixed) |
| Agent decision after evidence is complete | within 24 hours |
| Escalated (tier 2/3) decision | within 48 hours |
| Customer dispute filing window | 48 hours after completion (fixed) |
| Auto-escalate if provider silent | 48 hours (system worker) |

Support hours backing these: Monday to Saturday, 8:00 AM to 6:00 PM PHT. After-hours disputes wait for the next window unless they are a safety incident (section 7), which pages on-call. Sunday is closed at launch; urgent safety issues still escalate via the on-call path. (See `06-customer-support-sop.md` for the staffed hours and channels.)

> **Note (editable):** The in-app hours copy must match these support hours. If the app still shows a wider window (for example "8 AM to 8 PM"), treat it as a pre-launch copy fix.

---

## 7. Trust and safety

### 7.1 Fraud signals and what to do

| Signal | What it looks like | Action |
|---|---|---|
| Off-platform collusion | chat pushes to "pay GCash directly", "cancel and book me privately"; flagged `is_flagged` messages | warn both parties; repeat = provider suspension; the deal stays on-platform so it stays covered |
| Fake bookings | bookings that cancel right after match, same device/number, no real address, wash payouts | flag customer for fraud review (Customer detail); hold provider payout; check `login_attempts` and history |
| Payment fraud | webhook amount mismatch (already auto-blocked as tampering, logged to `security_events`), stolen-card chargebacks, top-up then instant payout | do not release escrow; escalate to super-admin; let the reconciliation tab catch PayMongo mismatches |
| Dispute abuse (customer) | chronic disputes across providers, `AT_RISK` risk flag, "free job" pattern | the `customer_chronic_disputes` alert fires; weight `no_refund`/`split_decision` on weak claims; flag for fraud review |
| Provider review gaming | clusters of suspicious 5-stars, self-bookings | hide reviews (Provider 360 Reviews tab); investigate |
| Cancellation gaming (provider) | many cancels to dodge bad jobs | system warns at 3 cancels/30 days, auto-suspends at 5 |

Useful built-in alerts (admin notifications): `provider_consecutive_one_star`, `customer_chronic_disputes`, `paymongo_webhook_failure`, `city_low_provider_count`, `guarantee_fund_low`.

### 7.2 Safety incidents (injury, damage, harassment)

These are not disputes. A dispute is about money; a safety incident is about a person being hurt, property being damaged beyond the job, or someone being threatened or harassed. A safety incident can also have a dispute attached, handle the safety part first.

What the app gives the customer: a "Call 911" action for immediate danger and a prefilled urgent in-app support case for the onService record.

> **Set (editable):** The placeholder hotline has been removed. Provision and staff a real support number before advertising phone support; until then use 911 for immediate danger and the in-app urgent support case for the company record. _Recommended default. To change it, edit here and anywhere this value is referenced._

Two operating limits to know: masked-phone calling is not built, and no support hotline is provisioned. The stale placeholder/calling claims have been removed from the current app. Do not promise either capability.

Severity levels and response:

| Sev | Definition | First response | Owner |
|---|---|---|---|
| SEV-1 | Active danger: injury needing medical help, violence, threat, assault, sexual harassment | Immediate. Tell the customer to call 911 if anyone is in danger. Page on-call. | Ken / on-call super-admin |
| SEV-2 | Property damage beyond the job, theft accusation, harassment that has stopped, provider intoxicated on site | Same business day | Super-admin |
| SEV-3 | Rude conduct, no-show with no safety angle, minor property issue | Next business day | Support agent |

### 7.3 Incident-response runbook

1. **Make people safe first.** If anyone is in danger, direct them to call 911. Do not investigate before safety.
2. **Open an incident record.** Create a support ticket (type closest to the issue), set priority urgent for SEV-1/2. Add internal notes on Provider 360 and Customer detail (category: legal or quality).
3. **Freeze the money.** If the booking is live or recently completed, make sure escrow is held. Do not release to the provider until the incident is resolved.
4. **Suspend if the provider is implicated.** Super-admin suspends from the Providers page (reason required). Suspension immediately pulls the provider from dispatch and flags every in-flight booking so escrow cannot release until an admin clears it. This is the right default for any credible injury, theft, or harassment claim against a provider.
5. **Collect evidence** (section 3) plus anything external (medical note, police blotter, photos).
6. **Decide and document.** Resolve any attached dispute. Record the incident outcome and whether the provider is reinstated, kept suspended, or removed (set `deactivated` / leave suspended, there is no hard delete).
7. **Escalate up the chain** for SEV-1: Ken decides on law-enforcement reporting, and on whether the guarantee fund pays out.
8. **NPC angle:** if the incident involves a personal-data breach (leaked customer info, doxxing), loop the DPO. NPC breach notification is 72 hours. See `10-money-and-compliance-ops.md`.

### 7.4 Damage above the job price, and the guarantee fund

If a provider causes damage worth more than the booking, the refund tools only cover the job amount. The rest is a liability question.

- onService is a marketplace, not an insurer. Interim wording exists, but final guarantee/disclaimer language remains E10/F#10 and requires attorney review. Do not tell a customer "we are insured" and do not expand the interim wording.
- Provider responsibility and any customer policy response depend on the facts
  and applicable contracts. Support does not give legal or insurance advice;
  preserve evidence and escalate above-booking losses.
- The release formula allocates 1.5% of the customer service fee to a **guarantee fund** wallet. The customer service fee is currently 0%, so the current fee-derived contribution is zero. Existing app/operations cap language conflicts and remains under E10/F#10. Any above-job damage payment is a Ken/super-admin escalation, never a front-line promise.

> **Legal hold (E10/F#10):** there is no operator-editable guarantee claim rule
> or approved ₱20,000 cap. Every claim beyond the refundable booking amount goes
> to Ken/legal with its evidence. Do not promise payment, clawback, eligibility,
> or insurance classification until counsel approves the complete model.

Two unresolved numbers exist in historical/current material: ₱25,000 in app copy and a proposed ₱20,000 operating cap. Neither is a front-line promise while legal/accounting sign-off remains open. Treat every above-job damage claim as an escalation until the rule and customer wording are reconciled.

---

## 8. Heads-up: the two cancellation/refund systems disagree

This will bite an agent who quotes the wrong number, so know it.

- The **money that actually moves** on a held-escrow cancellation uses the live settings brackets: 100% over 24h, 100% at 2-24h, 90% at 1-2h, 80% at 30min-1h, 70% under 30min, 50% if the provider already arrived, 0% on customer no-show. The service fee comes back too, except on a no-show.
- The **policy the app displays** to customers (and the admin Cancellation Policy editor) is a different, versioned tier table: 100% at 24h+, 75% at 4-24h, 50% under 4h, 0% after scheduled. Plus a provider-no-show rule that gives the customer 100% back plus a ~₱200 apology credit.

These two do not match. When you explain a cancellation refund, the customer will see the displayed policy, but the live path is what actually paid them.

> **Set (editable):** Until the two systems are reconciled (a known open issue), support quotes the LIVE refund money-path numbers, not the displayed policy table. _Recommended default. To change it, edit here and anywhere this value is referenced._

If a customer questions the amount, check which bracket the live path used before promising anything, and flag the mismatch to Ken. Refund mechanics live in `10-money-and-compliance-ops.md`.

---

## 9. Quick reference card

- **Dispute window:** 48h after completion. **Provider response:** 48h. **No response = tier-3 staff review, not an automatic refund.**
- **E18 hold:** release currently occurs at 24h while filing remains open to 48h. A post-release dispute is a money escalation, not proof of held funds.
- **E24 hold:** provider direct accept/partial offer and customer partial accept are disabled; provider contest and admin review remain available.
- **Auto no-show refund:** provider "completed" within 30 min of schedule on a `no_show` -> auto full refund.
- **Who resolves money:** super_admin only. Plain admin / dpo are read-only on disputes.
- **Statuses:** `open` -> `under_review` -> `escalated` -> `resolved` (tiers 1-3).
- **Resolution types:** `full_refund`, `partial_refund`, `no_refund`, `free_redo`, `refund_with_warning`, `refund_with_suspension`, `split_decision`.
- **Escrow on a dispute:** verify the ledger. Pre-release cases can remain held until resolution; a case filed after the current 24h release is an E18 escalation and is not re-funded merely because its status says `held`.
- **Suspend a bad provider:** Providers page, reason required, freezes their in-flight escrow.
- **Extra sign-off:** any refund over ₱10,000, any `refund_with_suspension`, and any damage/theft payout get super-admin / Ken eyes before resolving.
- **No benefit promise.** Historical app/operations copy contains conflicting
  ₱25,000/₱20,000 figures. Neither is approved. E10/F#10 requires counsel review;
  front-line staff escalate instead of classifying or promising payment.
- **Safety first.** SEV-1 = page on-call, tell them to call 911, do not investigate before safety.
- **Support hours:** Monday to Saturday, 8:00 AM to 6:00 PM PHT.

---

## Open decisions set in this doc

- **"I paid but it errored" is a payment issue, not a dispute** (editable): preserve the attempt and escalate under E14. Do not retry the invalid hosted link, infer payment from a redirect, or manually mark paid.
- **Extra evidence path** (editable): agent attaches over-cap evidence as admin-uploaded; confirm the upload path with engineering first.
- **Refund sign-off threshold** (editable): super-admin / Ken reviews every refund over ₱10,000, every `refund_with_suspension`, and every damage or theft payout.
- **In-app hours match the SOP** (editable): app copy must read Monday to Saturday, 8:00 AM to 6:00 PM PHT; wider windows are a pre-launch copy fix.
- **Support hotline** (editable): the placeholder is removed; provision and staff a real number before advertising phone support.
- **Guarantee/protection rule:** not editable by operations while E10/F#10 is
  open. Counsel and Ken must approve one model and one consistent set of terms
  before any cap, eligibility, clawback, or customer promise is used.
- **Cancellation numbers** (editable): support quotes the LIVE refund money-path numbers until the displayed-policy and live-path systems are reconciled.
