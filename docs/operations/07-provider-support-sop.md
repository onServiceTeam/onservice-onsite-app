# Provider Support SOP

Purpose: how the onService team helps providers with payouts, commission, jobs, change orders, no-shows, account and verification problems, rating disputes, and suspensions. Use this for day-to-day provider tickets.

Sibling docs you will reach for: `05-provider-onboarding-and-training.md` (activation, training, code of conduct), `09-trust-safety-and-disputes.md` (dispute resolution, escrow/refund decision tree), `10-money-and-compliance-ops.md` (escrow, payouts, commissions, BIR/NPC), `11-admin-system-training-manual.md` (the admin pages named here), `12-quality-standards-and-kpis.md` (provider quality scorecards), `13-policies-codes-and-templates.md` (full policy text + template library).

All money in this doc is Philippine pesos (₱). Timezone is Asia/Manila (PHT). All amounts in the app are stored in centavos and shown as ₱.

---

## 1. Channels and hours

There is no in-app support ticket screen for providers yet. A `support_tickets` table and admin Support Tickets page exist, but the mobile app does not surface them. So providers reach us by email or hotline, and the agent creates the ticket in admin on the provider's behalf.

| Channel | Address | Notes |
|---|---|---|
| Provider email | providers@onservice.ph | Primary written channel. Hardcoded in the app. |
| Hotline | +63 2 8123 4567 | PLACEHOLDER number, not provisioned yet. See DECIDE below. |
| In-app provider chat | per-booking only | Provider chats the customer, not support. Not a support channel. |
| Admin Support Tickets page | `/support-tickets` | Where agents log and work every provider issue. |

Stated hours in the app: Monday to Saturday, 8 AM to 8 PM PHT.

ASSUMPTION: starting staffing is one provider-support agent covering those hours, with Finance and Trust & Safety reachable async during the same window. Tune as provider count grows.

DECIDE: the hotline number +63 2 8123 4567 is a placeholder in the app code (customer and provider help screens, safety screen). Ken must provision a real number or remove the hotline copy before launch. Until then, treat phone support as not live and route everything to email.

DECIDE: the provider Help/FAQ text is hardcoded in the mobile app, so fixing wrong FAQ copy needs a code change and an app release. Decide whether to batch FAQ corrections into the next release or move FAQ to an admin-editable source post-launch.

---

## 2. SLA targets (starting targets, tune monthly)

These are first-response and resolution targets, not promises in the app. Measure against `12-quality-standards-and-kpis.md`.

| Priority | Examples | First response | Resolution target |
|---|---|---|---|
| Urgent | Provider stuck mid-job, payout failed, account suspended in error, safety incident | 30 min (within hours) | Same day |
| High | Payout not received past 3 business days, change-order payment stuck, verification blocking work | 2 hours | 1 business day |
| Medium | Commission question, rating dispute, document re-upload, service-area change | 8 business hours | 2 business days |
| Low | General how-to, profile edits, app questions | 1 business day | 3 business days |

Map these to the admin ticket priority field (low/medium/high/urgent) and ticket type (`booking_issue`, `payment_issue`, `provider_no_show`, `app_bug`, `account_issue`, `general_inquiry`). Ticket numbers look like `TKT-1000`.

---

## 3. Triage and ticket flow

1. Read the message. Identify the provider (business name, phone, or email) and find them on the Providers page (`/providers`).
2. Open Provider 360 (`/providers/:id`). Check status (pending / approved / rejected / suspended / deactivated), tier, NBI status, and any open disputes.
3. Pick the ticket type and priority from the table above.
4. Create the ticket in `/support-tickets` (you create it for the provider; the `createdByAdminId` path records that you opened it on their behalf).
5. Work the playbook for that issue (sections 5 to 14).
6. If the issue needs Finance or Trust & Safety, escalate per section 4 and set status `escalated`.
7. Resolve with a clear reply. Resolution notes need at least 10 characters in admin.

---

## 4. Escalation map

| Route to | When | How |
|---|---|---|
| Finance (super_admin) | Payout approve/reject/complete, AML-hold release, wallet adjustment, commission correction, any money movement | Booking 360 / Payouts page / Provider 360 Financials. All money actions are super_admin-only and write audit rows. |
| Trust & Safety (super_admin) | Dispute resolution, suspension or reactivation, fraud flag, rating fraud claim, safety incident | Disputes page, Providers page actions. See `09-trust-safety-and-disputes.md`. |
| Ken | Money or compliance risk, two-system policy conflict (cancellation), anything a hard stop names | Escalation file + chat. |

Plain support agents have read-only access to money and destructive actions. They gather facts, attach evidence, and hand to a super_admin to execute. Do not promise an outcome you cannot perform.

---

## 5. Payout and wallet questions

Facts to know:
- Providers withdraw from wallet available balance via `POST /wallet/payout`. Methods: GCash or Maya (11-digit `09XXXXXXXXX`), or bank InstaPay / PesoNet (8 to 16 digit account).
- Minimum withdrawal: ₱100.
- Provider must be `status='approved'` to request a payout.
- Only one payout in flight at a time (pending, approved, or processing). A second request returns an error until the first clears.
- Payout statuses: pending, aml_review_pending, approved, rejected, processing, completed.
- On request, money moves from available to pending balance. It leaves pending only on Complete.
- Withdrawal processing target: 3 business days.
- AML (RA 9160): a payout at or above the large-transaction threshold (default ₱500,000) is created as `aml_review_pending` and needs a super_admin to clear the AML review before it can be approved.

Money lands in the provider wallet only after escrow releases on a finished job. Escrow releases when the customer confirms the job, or automatically 24 hours after the provider marks it complete. So "I finished the job but no money yet" is usually the 24-hour auto-confirm window, not a payout bug.

Payout playbook:
1. Confirm provider is approved and amount is at least ₱100.
2. Provider 360 → Financials: check wallet available vs pending, and recent payouts.
3. Match the symptom:
   - Available balance is ₱0 but a job just finished: explain escrow release timing (customer confirm or 24h auto-confirm). Not a payout issue.
   - Payout shows pending/approved and it has been under 3 business days: normal, give the timeline.
   - Payout shows rejected: read the rejection reason; the amount was rebated to available balance. Provider can re-request.
   - Payout shows aml_review_pending: large-amount AML hold. Escalate to Finance to clear.
   - Payout shows completed but provider says not received: confirm the destination account number on file matches what the provider expects. If it matches and money is missing past 3 business days, escalate to Finance with the payout ID and PayMongo transfer ID.
4. For any approve/reject/complete action, escalate to Finance. You cannot move payouts yourself.

Macro: payout timing
```
Hi [name], salamat sa pasensya. Here's where your withdrawal stands:
- Status: [pending/approved/processing/completed]
- Amount: ₱[amount] to [GCash/Maya/bank] ending [last 4]
Payouts take up to 3 business days to land after approval. If it's past that, reply here and we'll have Finance check the transfer. Wallet money only becomes withdrawable after a job's escrow releases (when the customer confirms, or automatically 24 hours after you mark it done).
```

---

## 6. Commission questions (per tier)

Commission is a flat rate per tier. It does not vary inside a tier. It is taken off the service price; the provider receives service price minus commission. The platform service fee is charged to the customer on top and is not the provider's commission.

| Tier | Commission | How you reach it |
|---|---|---|
| founding | 10% | Invite-only launch batch. Not a step you earn into. Parallel tier. |
| new | 15% | Default on signup. |
| verified | 13% | 5+ jobs, 4.0+ rating. |
| pro | 11% | 25+ jobs, 4.5+ rating, no open disputes. |
| elite | 9% | 100+ jobs, 4.7+ rating, a verified (TESDA) certification, no open disputes. |

Notes for accurate answers:
- These defaults are admin-tunable in Settings (Commissions category). If Ken changed a rate, the live number wins. Check Settings before quoting if unsure.
- Tier promotion is not automatic. The app shows progress on the provider's tier-progression screen, but a super_admin sets the new tier on the Providers page (reason required, 10+ chars). When a provider meets the next tier's bar, log a ticket and route to Trust & Safety / admin to apply the change.
- Do not confuse provider tiers with the customer Suki loyalty tiers. Different thing.

Macro: commission explainer
```
Hi [name], your tier is [tier] so your commission is [X]% on the service price. That means on a ₱[price] job, ₱[commission] is the platform commission and you receive ₱[price-commission]. The customer pays a separate service fee on top, which is not part of your commission. Your next tier is [next tier] at [Y]%, which needs [N jobs / rating / cert]. You're at [current jobs] jobs and a [rating] rating. Once you hit the bar we'll review and update your tier.
```

---

## 7. Change-order requests (extra work mid-job)

Providers add charges during a job via change orders. Facts:
- Provider can create a change order only when the booking is `in_progress`.
- Needs a description, an additional amount, and photos.
- Capped at 50% of the original service price, with a hard schema cap near ₱10,000. Minimum ₱1.
- Flow: provider creates it (status pending) → customer approves or declines → if approved, the customer pays the extra (additional amount plus an additional service fee) → payment finalizes and the booking totals update.
- An approved-but-unpaid change order auto-expires after 24 hours. Both parties are told not to do the extra work.

Change-order playbook:
1. "My extra charge was rejected by the app": likely over the 50% cap or above the hard cap. Check the original service price; the add-on cannot exceed half of it. Advise splitting into a properly priced quote-based booking if the extra work is large.
2. "Customer approved but I haven't been paid the extra": the approval does not move money. The customer must complete the extra payment. If they did not pay within 24 hours, the change order expired. Tell the provider not to perform unpaid extra work.
3. "I forgot to add the change order before finishing": once the job leaves `in_progress`, no new change order can be created. The provider should message the customer and, if there's a genuine dispute over scope, this becomes a Trust & Safety matter, not a change order.

---

## 8. Job and booking issues

Useful booking facts:
- Auto-dispatch sends one offer at a time. The provider has 45 seconds to Accept or Decline. A missed or declined offer cascades to the next provider. Max 10 attempts per booking.
- Only approved AND available providers get offers. If a provider is offline (`is_available=false`) or suspended, they get nothing.
- Provider job lifecycle on a paid booking: en route → arrived → in progress → completed by provider → (customer confirms) confirmed → payout ready → paid out.
- A provider cannot move a booking from `provider_arrived` to `in_progress` and beyond on the customer's behalf in odd ways; the status machine enforces order. If a status looks stuck, check Booking 360 timeline.

Playbook:
1. "I'm not getting any job offers": check provider is approved, `is_available` is on, has the right service categories, and is inside a service area that is active. Few or zero providers can also mean the area is in soft_launch. Check the Service Areas page.
2. "I accepted but the app says someone else got it": offers are exclusive and time-boxed at 45 seconds. If it expired or a sibling offer was accepted, the job is gone. Normal.
3. "Booking stuck, I can't mark the next step": open Booking 360 → Timeline. Confirm current status. If genuinely stuck (rare), a super_admin can force-complete (reason 20+ chars) or reassign. Escalate.
4. "I need to cancel a job I accepted": providers can cancel from `matched`, `paid`, or `provider_en_route`. Warn them about cancellation tracking: a warning fires after 3 cancellations in 30 days, and auto-suspend signal after 5 in 30 days. See section 13.

---

## 9. Customer no-show at the site

When the provider arrives and the customer is not there:
1. Tell the provider to message the customer in the booking chat first (text plus a photo of arrival if useful). There is no in-app calling despite some app copy mentioning masked numbers; that feature is not built. Chat is the live channel.
2. Provider should wait a reasonable window. ASSUMPTION: 15 minutes is the starting wait before reporting a no-show. Tune this.
3. If the customer still does not appear, the provider reports it to support. Log this as ticket type `booking_issue` with a clear note "customer no-show at site." (The `provider_no_show` ticket type is for the opposite case, when the provider fails to show.)
4. A customer no-show affects the refund split. On the live cancellation path, a customer no-show gives the customer a 0% refund, which means the provider is compensated for the trip. Confirm the booking is handled so the provider is not penalized.
5. Gather evidence: arrival photo, GPS check-in (visible in Booking 360 → Evidence), chat showing the provider tried to reach the customer.
6. Escalate to Trust & Safety / super_admin to cancel or resolve with the no-show flag so the money splits correctly. Do not leave the provider out of pocket for a confirmed customer no-show.

Note the mirror case: if the PROVIDER no-shows, the customer gets a 100% refund plus a platform-funded apology credit (default ₱200), and the provider's reliability takes a hit. That is a Trust & Safety and quality matter, covered in `09-trust-safety-and-disputes.md`.

---

## 10. App, account, and login issues

Provider login is phone number plus OTP. No passwords.
- OTP is a 6-digit code to a PH mobile number (`+63 9XX XXX XXXX`).
- Resend has a cooldown and an hourly cap (default 5 OTP requests per hour).
- After repeated failures the app shows a captcha (Cloudflare Turnstile) before more attempts.
- Dev/staging bypass code `000000` works only on non-production with the bypass flag on. Never tell a real provider to use it.

Playbook:
1. "I'm not getting my OTP": confirm the number is correct and PH format. If they hit the hourly cap, they wait. SMS delays happen on the carrier side; advise waiting a few minutes before resending.
2. "I'm locked out / captcha keeps showing": too many failed attempts. Have them complete the captcha and retry. If still stuck, confirm the phone number on the account matches the SIM they are using.
3. "I changed my phone number": this is an account-identity change. Verify identity (match against KYC on file) before any change, and escalate, since phone is the login identity.
4. App bug or crash: log ticket type `app_bug` with device, OS, app version, and steps. Route to engineering via the ticket. Do not guess a fix.

---

## 11. Verification, documents, re-upload, and expiry

Required documents to be approved: NBI clearance, government ID front, and selfie (these three are hard-required by the approve action). Government ID back is collected at application time too.

Approval rule: a super_admin cannot approve a provider unless `nbi_clearance_url`, `government_id_front_url`, and `selfie_url` are all on the row. The Approve action returns a clean error listing what is missing.

NBI expiry:
- The provider row carries `nbi_expiry_date`. A background job warns providers whose NBI expires within 30 days (default) and notifies again when expired.
- The mobile NBI status banner classifies as missing, expiring, expired, or valid.
- An expired NBI does not auto-suspend, but it is a trust gap. Push the provider to renew and re-upload.

Re-upload playbook:
1. "My NBI is expiring / expired": tell them to get a fresh NBI (must be recent, the app hints within the last 6 months) and re-upload through the app. KYC documents go to a private bucket; admins view them through an authenticated proxy, never raw URLs.
2. "I was rejected for a blurry or wrong document": rejections store a reason. Read it to the provider, tell them exactly which document and what was wrong, and have them resubmit. Re-review and route to a super_admin to approve once the new document is clear.
3. "My document was approved but shows expired": check `expires_at` on the document and the NBI expiry date. If genuinely expired, it needs a new upload.
4. Certifications (for Elite tier): providers self-add certifications; `is_verified` is set by an admin. Elite needs a verified certification. If a provider expects Elite but their cert is not verified yet, that is the blocker. Route the cert for verification.

Macro: document re-upload
```
Hi [name], we need a clearer [NBI clearance / government ID / selfie]. The issue: [reason from rejection]. Please:
1. Open the app → Account & Verification → re-upload [document].
2. Make sure the photo is sharp, well lit, and shows the whole document.
For NBI, it should be issued within the last 6 months.
Once you've re-uploaded, reply here and we'll review within [SLA]. Your documents are stored privately and only our verification team can see them.
```

---

## 12. Rating disputes

Facts:
- Provider rating is the average of customer reviews on completed bookings.
- A provider can reply to a review publicly in the app (Reply to Review, max 500 characters, posts immediately).
- A provider cannot delete a review themselves. Admins can hide or show a review (visibility toggle) and add an admin response, on Provider 360 → Reviews.
- Auto-dispatch only excludes a provider for low rating once they have at least 5 reviews AND their rating is below the floor (default 2.5). New providers with few reviews are never excluded for being new.

Rating dispute playbook:
1. First, point the provider to the public reply feature for a normal one-off bad review. A professional reply is often the right answer.
2. "This review is fake / from someone who was never my customer / abusive": gather the review text, booking ID, and why it is fraudulent. This is a moderation call.
3. Verify the review ties to a real completed booking for that provider. Check Booking 360.
4. If it looks fraudulent or abusive, escalate to Trust & Safety / super_admin to hide it (visibility toggle) and optionally post an admin response. Do not hide reviews just because they are negative and accurate.
5. Watch for a pattern: repeated one-star reviews trigger an internal admin alert (`provider_consecutive_one_star`). Repeated genuine complaints are a quality issue, see `12-quality-standards-and-kpis.md`, not a review to hide.

Macro: rating reply coaching
```
Hi [name], a customer left a [N]-star review. Two options:
1. You can reply publicly in the app (Reply to Review, up to 500 characters). A calm, professional reply that owns what you can and explains your side often helps future customers more than the review hurts.
2. If you believe the review is fake or abusive (not a real customer, threats, slurs), reply here with the booking ID and details and we'll review it for removal.
We don't remove reviews just for being negative, but we do remove fraudulent or abusive ones.
```

---

## 13. Suspensions and appeals

How a provider gets suspended:
- A super_admin suspends from the Providers page (reason required). Suspend flips status to `suspended`, removes the provider from dispatch immediately, and flags any in-flight bookings so escrow cannot release until admin resolves them.
- Cancellation signal: a warning is expected after 3 cancellations in 30 days, and an auto-suspend signal after 5 cancellations in 30 days. Counts are tracked on the provider row.
- A dispute resolved as `refund_with_suspension` suspends the provider as part of the resolution.
- Pre-approval, an application can be rejected (not suspended) with a stored reason.

Reactivation restores status to `approved` (super_admin action, Providers page).

There is no in-app delete of a provider. `deactivated` exists as a status but no current admin button sets it.

Suspension appeal playbook:
1. Open Provider 360. Find the suspension reason in Activity / audit and the linked dispute or cancellation count.
2. Tell the provider clearly why they were suspended. Be specific, quote the reason.
3. Collect the provider's side and any evidence.
4. If in-flight bookings were flagged, those must be resolved first (escrow is frozen on them). Coordinate with Trust & Safety / Finance.
5. Decide with a super_admin:
   - Reactivate if the suspension was an error or the issue is resolved and the provider acknowledges the standard.
   - Keep suspended if the reason stands (fraud, repeated no-shows, serious complaint).
6. Record the decision and reason. Reactivation and any tier change are audited.

Decision tree for an appeal:
```
Suspension reason?
├─ Cancellations (3 warn / 5 auto-signal)
│   ├─ First time, provider acknowledges → reactivate with a written warning, reset expectation
│   └─ Repeat offender → keep suspended, escalate to Ken if borderline
├─ Dispute (refund_with_suspension)
│   └─ Trust & Safety owns this. Reactivate only if the dispute outcome is reversed or conditions met.
├─ Fraud / safety
│   └─ Keep suspended. Trust & Safety + Ken. Do not reactivate without their sign-off.
└─ Admin error
    └─ Reactivate immediately, apologize, note the correction in audit.
```

Macro: suspension explained
```
Hi [name], your provider account is currently suspended. Reason: [exact reason]. While suspended you won't receive job offers. Here's what happens next:
1. [If applicable] We need to resolve [N] in-progress booking(s) first.
2. Please reply with your side and any photos or details.
3. We'll review and get back to you within [SLA].
If this was a mistake on our end, we'll restore your account right away.
```

---

## 14. Service-area change requests

Providers cannot instantly change their service area. A request goes into a queue (`service_area_change_requests`), and only one pending request per provider is allowed. An admin reviews and approves or rejects; both outcomes are audited.

Playbook: confirm the provider's requested area exists and is active or in soft_launch (Service Areas page). If the area is not live yet, tell the provider when it is planned. Route the pending request to an admin to approve or reject. The provider keeps their current area until approved.

---

## 15. Quick reference card

| Provider says | First check | Likely answer |
|---|---|---|
| "No money after finishing a job" | Booking status | Escrow releases on customer confirm or 24h auto-confirm |
| "Payout not received" | Payouts / Provider 360 Financials | Up to 3 business days; check status and destination account |
| "Wrong commission" | Tier + Settings | Flat per tier (10/15/13/11/9%); admin may have tuned it |
| "Can't add extra charge" | Original price | 50% cap, ~₱10K hard cap, must be in_progress |
| "No job offers" | Approved + available + area | 45s exclusive offers; check availability and service area |
| "Customer not at site" | Booking 360 Evidence | 15-min wait, then no-show handling, provider compensated |
| "Not getting OTP" | Phone format + hourly cap | Format `+63 9XX...`, 5/hour cap, carrier delay |
| "NBI expiring" | NBI status banner | Renew and re-upload; private bucket |
| "Bad review" | Booking 360 | Reply publicly; remove only if fake/abusive |
| "Suspended" | Provider 360 Activity | Read reason; appeal path in section 13 |

---

## Open items for Ken

DECIDE: provision a real support hotline or remove the placeholder number +63 2 8123 4567 from the app before launch.

DECIDE: the live cancellation/refund money path and the displayed cancellation policy use different brackets. When a provider asks "what do I get if a customer cancels," the live money path is the accurate answer, not the policy page. Confirm which numbers support should quote to providers and whether the two systems should be reconciled. See `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`.

DECIDE: whether to build a provider-facing support ticket screen, or keep email-to-agent as the intake while agents log tickets in admin.
