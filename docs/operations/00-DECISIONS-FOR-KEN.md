# Decisions Register

This register separates working operating defaults from legal, money, compliance, and architecture hard stops. A hard stop is not filled with a convenient default. Change a working decision here and in its home document; resolve a hard stop only through its named decision/escalation process.

Two kinds of items:
- **Set (editable)** items are decisions, now filled in. Change any you disagree with.
- **Fix / verify** items are real gaps in the app that ops would trip over. These are not settled by a decision alone; they need a code check or change. My recommended disposition is noted for each.

How to read the markers in the documents: a decision looks like this where it lives:

> **Set (editable):** the decision. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## A. Brand and strategy (doc 01)

- **Mission:** "To replace the risk of hiring a stranger with ID-verified pros, held payments, and real accountability."
- **Vision:** "The default way Filipino households book home services, starting in Metro Cebu and reaching every major city."
- **Purpose:** "We exist so that a household can hire help for their home without fear, and a skilled worker can earn a fair living without a boss."
- **Core values (six):** Trust is the product; The provider eats; Lead with the bad news; One booking, one truth; Filipino-first, plainly; Safety is non-negotiable.

## B. Operating model (docs 02, 06, 07, 11)

- **Support model:** in-house for the Metro Cebu launch, moving to hybrid once volume passes two agents. Money actions (refund, payout, escrow release) stay with super-admin staff.
- **Support channels first:** email and Facebook Messenger. Add a phone/SMS hotline later as volume warrants.
- **Support hours:** Monday to Saturday, 8:00 AM to 6:00 PM PHT. Sunday closed at launch, with urgent safety issues escalating through the on-call path.
- **Super-admin accounts:** Ken plus one Operations Lead only.
- **Pay bands (indicative Cebu monthly, verify against current market):** Support Agent ₱18,000 to ₱25,000; Lead/Senior Support ₱28,000 to ₱35,000; Provider Success/Vetting ₱22,000 to ₱30,000; Dispatch/QA ₱20,000 to ₱28,000; Finance & Compliance ₱30,000 to ₱45,000; Operations Lead ₱40,000 to ₱60,000.
- **Surge pricing:** off at launch.

## C. Money and policy thresholds (docs 03, 04, 05, 08, 09, 10, 12)

- **Referral incentive:** ₱500 to the referrer, ₱300 welcome bonus to the new provider, paid after the new provider completes 3 jobs, capped at 10 referrals per referrer per month.
- **Area go-live:** 5 approved providers per launch category to reach soft-launch, 8 in the lead category to flip the area to active.
- **NBI expiry:** manual chase by support, then manual suspend if ignored. Not auto-suspend at launch. E62 records that the current worker does not consistently follow this decision; staff must use the manual review queue until remediation is approved.
- **Provider TIN:** collected before first payout (not at application).
- **No-provider failure:** 100% refund plus a ₱150 goodwill credit.
- **Refund sign-off:** super-admin/Ken reviews every refund over ₱10,000, every refund-with-suspension, and every damage or theft payout.
- **Guarantee/protection policy - HOLD E10/F#10:** no cap, coverage definition, eligibility rule, clawback rule, or customer payout promise is approved. The former ₱20,000 draft is not an operating default. Attorney and accountant approval is required before any guarantee policy can be adopted or shown to customers.
- **Support waiting cases:** the proposed two-reminder/five-day auto-close is not implemented. Staff review waiting cases manually and must not claim reminders were sent.
- **CSAT:** manual post-resolution survey (email/SMS) at launch.

## D. Real app issues (fix / verify)

These came from checking the code while writing. I have not changed them yet. Two touch money and would follow the topic-branch-plus-PR path.

- **F1. Cancellation refund mismatch (money path) - VERIFIED REAL.** Confirmed in code (2026-06-19, see `.ai-coder/escalations/E09-cancellation-refund-display-mismatch-2026-06-19.md`). What a customer is shown (the cancellation-policy page and the admin "Cancellation Policy" editor, from the `cancellation_policies` table) is NOT what they are refunded (the live escrow path reads the Settings `cancel_refund_*` rows). The brackets and percentages differ (for example 2-to-24h is refunded 100% but shown as "4-24h = 75%"), and the admin policy editor is a placebo: it edits display text only and does not control the money. In the current defaults customers are refunded more than the page promises, so no one is underpaid today, but the displayed policy is still a false representation, and tightening the policy page would not change real refunds. **Needs your decision: which system is canonical and what the final bracket values are. Recommended: make the `cancellation_policies` table canonical and wire the real refund to it (Option 1 in E09). Money path, so it lands on a topic branch + PR.** Until reconciled, support quotes the actual (Settings) numbers, never the page.
- **F2. Guarantee-fund base - VERIFIED, NOT a money bug (cleared 2026-06-19).** Both `commission.service` and `escrow.service` fund the guarantee fund the same way (service fee times 1.5%), the actual escrow money movements conserve money exactly (proven by the money-conservation tests), and the admin financial reports read the real wallet balances, so the books do not drift. The only finding is cosmetic: the field `platformRetains` means "gross take (including the guarantee that gets reserved later)" in `commission.service` (used in the price preview) but "net of the guarantee" in `escrow.service` (the actual revenue credit). Same name, two consistent views. **No money fix needed. Optional, low priority: rename one of them for clarity.**
- **F3. Money-action role gate - RESOLVED for launch roles.** Refund, payout, escrow, reconciliation, and other privileged money controls are gated to the live `super_admin` account role in API and UI. Fine-grained `admin_roles.permissions` remain organizational metadata and still need a separate architecture decision before they can replace account-role enforcement.
- **F4. Placeholder support hotline - RESOLVED in app.** The fake `+63 2 8123 4567` number is no longer present in customer/provider code. Phone support remains not provisioned; use in-app cases, email, and Messenger until a real number and staffing exist.
- **F5. Instant-pay state ordering (E03) - DONE; hosted checkout (E14) - OPEN.** PR #44 fixed booking creation and escrow/payment ordering. It did not create a valid hosted PayMongo authorization flow. E14 proves the constructed Payment Intent URL returns 404 and the inspected production top-ups remained awaiting. Do not describe external card/GCash/Maya/QR Ph checkout as launch-ready until Ken approves the integration choice and it passes test-mode end-to-end validation.

---

## What to do with this page

- Skim sections A to C. Anything you would change, change it (here and in the named document). Everything left as-is is the working default.
- Section D status: F2 is cleared; F3 and F4 are resolved for the current launch model; F1 still needs the cancellation source and bracket decision; E14 still needs the PayMongo integration choice, protected test keys, and test-mode evidence. E03's internal ordering fix does not close E14.
