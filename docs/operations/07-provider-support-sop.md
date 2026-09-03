# Provider Support SOP

Purpose: how the onService team helps providers with payouts, commission, jobs, change orders, no-shows, account and verification problems, rating disputes, and suspensions. Use this for day-to-day provider tickets.

Sibling docs you will reach for: `05-provider-onboarding-and-training.md` (activation, training, code of conduct), `09-trust-safety-and-disputes.md` (dispute resolution, escrow/refund decision tree), `10-money-and-compliance-ops.md` (escrow, payouts, commissions, BIR/NPC), `11-admin-system-training-manual.md` (the admin pages named here), `12-quality-standards-and-kpis.md` (provider quality scorecards), `13-policies-codes-and-templates.md` (full policy text + template library).

All money in this doc is Philippine pesos (₱). Timezone is Asia/Manila (PHT). All amounts in the app are stored in centavos and shown as ₱.

---

## 1. Channels and hours

Providers can open, list, view, and reply to their own cases in the shared in-app Support screens. The same cases appear in the admin Support Queue. Provider email and Messenger remain staffed channels; the agent creates the ticket in admin when contact starts outside the app.

| Channel | Address | Notes |
|---|---|---|
| Provider email | providers@onservice.ph | Primary written channel. Hardcoded in the app. |
| Facebook Messenger | onService PH page | Second staffed channel at launch. |
| In-app support cases | Support inbox in the provider workspace | Provider creates and follows their own case; admin internal notes stay hidden. |
| Hotline | (not provisioned) | Placeholder number removed from the app pre-launch. See the decision below. |
| In-app provider chat | per-booking only | Provider chats the customer, not support. Not a support channel. |
| Admin Support Tickets page | `/support-tickets` | Where agents log and work every provider issue. |

Support hours: Monday to Saturday, 8:00 AM to 6:00 PM PHT. Sunday is closed at launch; urgent safety issues still escalate through the on-call path.

> **Set (editable):** Provider support is staffed first on email and Facebook Messenger, Monday to Saturday, 8:00 AM to 6:00 PM PHT, with Finance and Trust & Safety reachable async during the same window. Starting staffing is one provider-support agent; grow headcount as provider count rises. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** The hotline placeholder `+63 2 8123 4567` has been removed from the app. Provision and staff a real number before advertising phone support; until then everything routes to in-app cases, email, and Messenger. _Recommended default. To change it, edit here and anywhere this value is referenced._

> **Set (editable):** The provider Help/FAQ text is hardcoded in the mobile app, so wrong FAQ copy needs a code change and an app release. At launch, batch FAQ corrections into app releases; move FAQ to an admin-editable source post-launch (backlog item). _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 2. SLA targets (starting targets, tune monthly)

These are first-response and resolution targets, not promises in the app. Measure against `12-quality-standards-and-kpis.md`.

| Priority | Examples | First response | Resolution target |
|---|---|---|---|
| Urgent | Provider stuck mid-job, payout failed, account suspended in error, safety incident | 30 min (within hours) | Same day |
| High | Payout not received past 3 business days, change-order payment stuck, verification blocking work | 2 hours | 1 business day |
| Medium | Commission question, rating dispute, document re-upload, service-area change | 8 business hours | 2 business days |
| Low | General how-to, profile edits, app questions | 1 business day | 3 business days |

Map these to the admin ticket priority field (low/medium/high/urgent) and the provider-eligible ticket types (`booking_issue`, `payment_issue`, `app_bug`, `account_issue`, `general_inquiry`). `provider_no_show` is reserved for a customer-owned case linked to the affected booking; when a provider reports that the customer did not meet them on-site, use `booking_issue` and preserve the job evidence as section 9 requires. Ticket numbers look like `TKT-1000`.

---

## 3. Triage and ticket flow

1. Read the message. Identify the provider (business name, phone, or email) and find them on the Providers page (`/providers`).
2. Open Provider 360 (`/providers/:id`). Check status (pending / approved / rejected / suspended / deactivated), tier, NBI status, and any open disputes.
3. Pick the ticket type and priority from the table above.
4. Open the existing ticket if it came through the app. For email or Messenger, open Provider 360 and choose **Create support case**; the account is selected for you and the `createdByAdminId` path records that you opened it on the provider's behalf. Do not paste an arbitrary provider user ID or booking ID.
5. If the provider or assigned provider staff member replies while the case is waiting, the system returns an assigned case to `in_progress` or an unassigned case to `open`. Resolved and closed provider threads are read-only; open a new case for a genuinely new issue.
6. Work the playbook for that issue (sections 5 to 14).
7. If the issue needs Finance or Trust & Safety, escalate per section 4 and set status `escalated`.
8. Resolve with a clear reply. Resolution notes need at least 10 characters in admin.

---

## 4. Escalation map

| Route to | When | How |
|---|---|---|
| Finance (super_admin) | Payout internal-review clear/reject, approve/reject/complete, wallet adjustment, commission correction, any money movement | Booking 360 / Payouts page / Provider 360 Financials. All money actions are super_admin-only and write audit rows. The internal hold is not itself an AMLA filing or classification. |
| Trust & Safety (super_admin) | Dispute resolution, suspension or reactivation, fraud flag, rating fraud claim, safety incident | Disputes page, Providers page actions. See `09-trust-safety-and-disputes.md`. |
| Ken | Money or compliance risk, two-system policy conflict (cancellation), any refund over ₱10,000, any refund-with-suspension, any damage or theft payout, anything a hard stop names | Escalation file + chat. |

Money actions (refund, payout, escrow release) always stay with super-admin staff. Support agents get a limited admin login that cannot reach money buttons; they gather facts, attach evidence, and hand to a super_admin to execute. Do not promise an outcome you cannot perform.

> **Set (editable):** Super-admin/Ken reviews every refund over ₱10,000, every refund-with-suspension, and every damage or theft payout before it goes out. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 5. Payout and wallet questions

Facts to know:
- Providers withdraw from wallet available balance via `POST /api/v1/wallet/withdraw`. Methods: GCash or Maya (11-digit `09XXXXXXXXX`), or bank InstaPay / PESONet (8 to 16 digit account).
- Automatic payout schedules are not active for launch. A saved historical cadence is preserved but inactive; it does not create a payout. Providers must submit each withdrawal manually from Earnings.
- Minimum withdrawal: ₱100.
- Provider must be `status='approved'` to request a payout.
- Only one payout in flight at a time (`aml_review_pending`, `pending`, `approved`, or legacy `processing`). The server serializes this check, so simultaneous taps cannot reserve two payouts.
- Payout statuses: pending, aml_review_pending, approved, rejected, processing, completed.
- On request, money moves from available to pending balance. It leaves pending only on Complete.
- Withdrawal processing target: 3 business days.
- Internal large-transaction control: a payout at or above the configured threshold (default ₱500,000) is created as `aml_review_pending`. A super_admin can clear it to pending or reject it directly; either path requires a written reason and a direct rejection returns the reserved amount atomically. This hold is not proof that a legal report was filed or required.

Money lands in the provider wallet only after escrow releases on a finished job. Customer confirmation can release it; the worker also currently auto-releases after 24 hours. That timer conflicts with the 48-hour customer dispute-filing window under E18, so support must not present the 24-hour credit as a settled finality rule or assume a later accepted case still has held funds.

Payout playbook:
1. Confirm provider is approved and amount is at least ₱100.
2. Provider 360 then Financials: check wallet available vs pending, and recent payouts.
3. Match the symptom:
   - Available balance is ₱0 but a job just finished: check booking, escrow, completion, and dispute state. Explain that customer confirmation or the current worker timer may release funds, but do not call the 24-hour/48-hour contradiction normal or final. Escalate any accepted post-release dispute under E18.
   - Payout shows pending/approved and it has been under 3 business days: normal, give the timeline.
   - Payout shows rejected: read the rejection reason; the amount was rebated to available balance. Provider can re-request.
   - Payout shows aml_review_pending: internal large-transaction hold. Escalate to Finance for review. The super_admin records either a clearance reason (moves it to pending without sending money) or a rejection reason (returns the reserved balance).
   - Payout shows completed but provider says not received: confirm the destination account number on file matches what the provider expects. If it matches and money is missing past 3 business days, escalate to Finance with the payout ID and PayMongo transfer ID.
4. For internal large-payout review clearance or any approve/reject/complete action, escalate to Finance. Every decision requires a written audit reason. You cannot move payouts yourself.
5. If a provider expected a daily/weekly/bi-weekly/monthly automatic payout, explain the manual-only launch mode, confirm no payout was silently created, and help them submit from Earnings. Do not rewrite their stored historical cadence unless the provider explicitly chooses manual through an approved account flow.

Macro: payout timing

```
Hi [name], salamat sa pasensya. Here's where your withdrawal request stands:
- Status: [pending/approved/processing/completed]
- Amount: ₱[amount] to [GCash/Maya/bank] ending [last 4]
Our operating target is up to 3 business days after approval, but the recorded status and transfer reference are the source of truth. If it is past the target, reply here and Finance will check the transfer. Wallet money becomes withdrawable only after the booking record shows release. Customer confirmation can release it; the current 24-hour timer remains under E18 review because filing stays open for 48 hours.
```

---

## 6. Commission questions

Commission is taken off the service price, but it can vary inside a tier through an effective-dated provider/category/service agreement. For a priced or paid booking, its immutable Booking 360 financial terms are final. For future work, use Financials -> Commission Controls. The customer service fee is currently 0%; if Ken later re-enables that separate charge, it is still not provider commission.

| Tier | Commission | How you reach it |
|---|---|---|
| founding | 10% seeded base | Invite-only parallel tier; E63 hold, no new offer or assignment. |
| new | 15% | Default on signup. |
| verified | 13% | 5+ jobs, 4.0+ rating. |
| pro | 11% | 25+ jobs, 4.5+ rating, no open disputes. |
| elite | 9% | 100+ jobs, 4.7+ rating, a verified (TESDA) certification, no open disputes. |

Notes for accurate answers:
- These are seeded base rates, not an existing booking's truth. Check the booking snapshot first; otherwise inspect the effective provider/tier agreement in Commission Controls. Direct Settings edits are retired under E50.
- Tier promotion is not automatic. The app shows progress on the provider's tier-progression screen, but a super_admin sets the new tier on the Providers page (reason required, 10+ chars). When a provider meets the next tier's bar, log a ticket and route to Trust & Safety / admin to apply the change.
- Do not confuse provider tiers with the customer Suki loyalty tiers. Different thing.

Macro: commission explainer

```
Hi [name], booking [reference] fixed your commission at [X]% on the ₱[price] service price. That is ₱[commission] platform commission and ₱[provider amount] provider earnings before any separate payout adjustment. This rate came from [tier/provider/category agreement] and is preserved on the booking. Your current tier is [tier]. The next tier's seeded base is [Y]%, but the effective rate must be checked when future work is priced. You are currently at [jobs] jobs and [rating] rating; meeting the bar starts an admin review and does not change old bookings.
```

---

## 7. Change-order requests (extra work mid-job)

Providers add charges during a job via change orders. Facts:
- Provider can create a change order only when the booking is `in_progress`.
- Needs a description, an additional amount, and photos.
- Capped at 50% of the original service price, with a hard schema cap near ₱10,000. Minimum ₱1.
- Flow: provider creates it (status pending), customer approves or declines, if approved the customer pays the extra (additional amount plus an additional service fee), payment finalizes and the booking totals update.
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
- Provider job lifecycle on a paid booking: en route, arrived, in progress, completed by provider, (customer confirms) confirmed, payout ready, paid out.
- A provider cannot move a booking from `provider_arrived` to `in_progress` and beyond on the customer's behalf in odd ways; the status machine enforces order. If a status looks stuck, check Booking 360 timeline.

Playbook:
1. "I'm not getting any job offers": check provider is approved, `is_available` is on, has the right service categories, and is inside a service area that is active. Few or zero providers can also mean the area is in soft_launch. Check the Service Areas page.
2. "I accepted but the app says someone else got it": offers are exclusive and time-boxed at 45 seconds. If it expired or a sibling offer was accepted, the job is gone. Normal.
3. "Booking stuck, I can't mark the next step": open Booking 360 then Timeline. Confirm current status. If genuinely stuck (rare), a super_admin can force-complete (reason 20+ chars) or reassign. Escalate.
4. "I need to cancel a job I accepted": providers can cancel from `matched`, `paid`, or `provider_en_route`. Warn them about cancellation tracking: a warning fires after 3 cancellations in 30 days, and an auto-suspend signal after 5 in 30 days. See section 13.

When the platform itself cannot match any provider (no-provider failure), the customer is owed a 100% full refund plus a ₱150 goodwill credit. That is a dispatch and money matter handled per `08-dispatch-and-area-operations.md`; it is not a penalty against the provider.

---

## 9. Customer no-show at the site

When the provider arrives and the customer is not there:
1. Tell the provider to message the customer in the booking chat first (text plus a photo of arrival if useful). There is no in-app calling or masked-telephone service. Chat is the live channel and the current customer/provider copy now says so.
2. The stored/default wait is currently 30 minutes, but E60 records that the API measures it from the scheduled time rather than from a verified arrival timestamp. Do not tell either party that the present route proves 30 minutes on-site.

> **Launch hold:** `provider_noshow_minutes` is read-only under E60. It currently drives both provider-late alerts and the customer no-show money boundary. Do not change it in PostgreSQL or bypass the Settings API.

3. The provider app can submit the customer no-show action from an arrived booking. Because the current check does not prove the on-site duration, open or link a `booking_issue` support case and preserve the exact arrival, chat, photo, and location evidence. The `provider_no_show` ticket type is for the opposite case, when the provider fails to show.
4. A customer no-show affects the refund split. On the live cancellation path, a customer no-show gives the customer a 0% refund, which means the provider is compensated for the trip. Confirm the booking is handled so the provider is not penalized.
5. Gather evidence: arrival photo, GPS check-in (visible in Booking 360 then Evidence), chat showing the provider tried to reach the customer.
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
3. "I changed my phone number": this is an account-identity change. Verify identity (most recent booking reference plus the registered full name plus an OTP to the number on file when possible) before any change, and escalate, since phone is the login identity. If the old number is lost, escalate to super-admin.
4. App bug or crash: log ticket type `app_bug` with device, OS, app version, and steps. Route to engineering via the ticket. Do not guess a fix.

---

## 11. Verification, documents, re-upload, and expiry

The application policy requires four evidence files: NBI clearance, government ID front, government ID back, and selfie. The current approve action hard-requires only NBI, ID front, and selfie; E36 records the missing ID-back enforcement, so support and reviewers must not describe the three-field API check as the complete policy.

Current API rule: an authorized admin-tier operator cannot approve a provider unless `nbi_clearance_url`, `government_id_front_url`, and `selfie_url` are all on the row. The Approve action returns a clean error listing those missing fields. The operator must separately verify `government_id_back_url` until E36 is resolved.

NBI expiry:
- The provider row carries `nbi_expiry_date`. The background job uses one notified flag for both the early warning and actual expiry. Under E62, a warned provider can be skipped when expiry arrives, while a provider first selected after expiry can be auto-suspended.
- The mobile NBI status banner classifies as missing, expiring, expired, or valid.
- The intended launch policy is manual chase then reasoned manual suspension, but current worker behavior is inconsistent. Do not rely on an expiry push or status mutation. Review Provider 360/dashboard evidence, open a linked support case, and escalate the suspension decision with active-job context.

Document renewal and correction playbook:
1. "My NBI is expiring / expired": tell them to obtain a fresh NBI, then open a support case. The approved-provider app does not currently expose a secure NBI renewal submission and Provider 360 is read-only. Do not ask for KYC through chat/email or promise an upload that is unavailable; escalate under E62/E35.
2. "I was rejected for a blurry or wrong document": rejections store a reason. Read the customer-safe reason and explain which document was wrong, but do not ask them to send KYC through chat, email, or another off-platform channel. Rejected applicants cannot currently resubmit against the same canonical provider row; log a support case and escalate under E35 instead of promising an unavailable reapplication path.
3. "My document was approved but shows expired": check `expires_at` on the document and the NBI expiry date. If genuinely expired, open a linked support case and use the E62 renewal escalation; the approved-provider upload and verification path does not yet exist.
4. Certifications (for Elite tier): providers self-add certifications; `is_verified` is set by an admin. Elite needs a verified certification. If a provider expects Elite but their cert is not verified yet, that is the blocker. Route the cert for verification.

Macro: document re-upload

```
Hi [name], we need a clearer [NBI clearance / government ID / selfie]. The issue: [reason from rejection]. Please:
1. Open the app then Account & Verification then re-upload [document].
2. Make sure the photo is sharp, well lit, and shows the whole document.
For NBI, it should be issued within the last 6 months.
Once you've re-uploaded, reply here and we'll review within [SLA]. Your documents are stored privately and only our verification team can see them.
```

---

## 12. Rating disputes

Facts:
- Provider rating is the average of customer reviews on completed bookings.
- A provider can reply to a review publicly in the app (Reply to Review, max 500 characters, posts immediately).
- A provider cannot delete a review themselves. Admins can hide or show a review (visibility toggle) and add an admin response, on Provider 360 then Reviews.
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

Providers cannot instantly change their service area or location pin. In **Profile > Service Area**, the provider chooses an active or soft-launch market, captures a fresh pin, selects a radius within the live platform maximum, and supplies a 10-500 character reason. The request goes into `service_area_change_requests`, only one pending request per provider is allowed, and the provider keeps their current coverage until approval. They may use **Withdraw request** after confirmation if the submission is wrong; this leaves current coverage unchanged and lets them submit again.

Playbook:

1. Open Admin **Service Areas** and find the request at the top of the page.
2. Open its Provider 360 link. Compare the old and requested market and radius, the proposed coordinates, provider history, and the stated reason. Do not treat the area's center as the provider's location.
3. Confirm the requested area is still `active` or `soft_launch`, the pin lies inside it, and the radius is no higher than Admin Settings **Max Service Radius**. The server rechecks all three at decision time.
4. If the area is not live, reject with a useful reason and tell the provider when it is planned. Do not move their active coverage manually just to make the request disappear.
5. An ordinary admin/support/DPO account can inspect the queue. Route the final decision to a `super_admin`, who must enter a 30-5000 character decision reason.
6. Approval updates the primary area, radius, exact coordinates, city, and province together. If the provider's active area or radius changed after submission, the server rejects the stale approval; reject the old request and ask for a fresh one. Rejection changes none of the active matching fields. Both decisions are audited and notify the provider.

---

## 15. Cancellation numbers (quote the live money path)

When a provider asks "what do I get if a customer cancels," the live cancellation/refund money path and the displayed cancellation policy currently use different brackets. This is a known open issue pending reconciliation.

> **Set (editable):** Until the two systems are reconciled, support quotes the LIVE refund money-path numbers, not the policy page, when answering a provider's cancellation question. Flag the mismatch on the ticket so it is tracked. See `09-trust-safety-and-disputes.md` and `10-money-and-compliance-ops.md`. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 16. Provider ticket intake

Provider ticket intake is available in the shared in-app Support screens. Email and Facebook Messenger remain valid channels; the agent logs those external contacts in admin on the provider's behalf so all work uses the same case record.

At each handoff, review **Needs reply** across queue. It includes active cases with no public agent reply and cases where the provider's latest public message is newer than the agent's. Assignment, status changes, priority changes, and internal notes do not count as a provider-facing response.

---

## 17. Quick reference card

| Provider says | First check | Likely answer |
|---|---|---|
| "No money after finishing a job" | Booking + escrow + dispute state | Customer confirmation/current worker can release; E18 blocks treating the 24h/48h mismatch as final policy |
| "Payout not received" | Payouts / Provider 360 Financials | Up to 3 business days; check status and destination account |
| "Wrong commission" | Booking 360 financial terms + Commission Controls | Explain the booking's snapshotted rate; future agreements never rewrite it |
| "Can't add extra charge" | Original price | 50% cap, ~₱10K hard cap, must be in_progress |
| "No job offers" | Approved + available + area | 45s exclusive offers; check availability and service area |
| "Customer not at site" | Booking 360 Evidence | E60 hold: preserve arrival/contact evidence; current 30-min check is scheduled-time based |
| "Not getting OTP" | Phone format + hourly cap | Format `+63 9XX...`, 5/hour cap, carrier delay |
| "NBI expiring" | Provider 360 + linked support case | E62 hold: no approved-provider renewal upload exists; review manually and escalate renewal/suspension |
| "Bad review" | Booking 360 | Reply publicly; remove only if fake/abusive |
| "Suspended" | Provider 360 Activity | Read reason; appeal path in section 13 |

---

## Open decisions set in this doc

- Provider support is staffed first on email and Facebook Messenger, Monday to Saturday, 8:00 AM to 6:00 PM PHT, one agent to start. (editable)
- Hotline placeholder removed from the app; phone support is not live until a real number is provisioned and staffed. (editable)
- FAQ corrections batched into app releases at launch; FAQ moves to an admin-editable source post-launch. (editable)
- Super-admin/Ken reviews every refund over ₱10,000, every refund-with-suspension, and every damage or theft payout. (editable)
- Customer no-show timing remains on E60 launch hold until a snapshotted wait is measured from verified arrival; the current stored/default value is 30 minutes. (held)
- Support quotes the live refund money-path numbers (not the policy page) on cancellation questions until the two systems are reconciled. (editable)
- Provider ticket intake uses the in-app Support inbox when possible, with email/Messenger-to-agent intake retained for external contacts. (editable)
