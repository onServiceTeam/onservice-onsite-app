# onService Operations Handbook

The operating manual for the office and support team behind the onService app.

This handbook covers who we are, how we filter and run providers, how we support customers and providers, how to use the admin system, and how we handle money, compliance, disputes, and quality.

Everything here is grounded in how the app actually works (real booking statuses, real provider tiers and commission rates, real admin pages, real escrow and dispute flows). Where the app does not define something, the doc says so and either recommends an editable default or flags it as a decision for Ken.

## Start here

1. Read `01-company-foundation.md`. Everyone reads this first.
2. Read `00-DECISIONS-FOR-KEN.md` for the open decisions this handbook needs from Ken, plus the real app issues it surfaced.
3. Then read your role's documents (see the reading paths below).

## The documents

| #  | File                                  | What it covers                                                                  |
|----|---------------------------------------|---------------------------------------------------------------------------------|
| 00 | `00-DECISIONS-FOR-KEN.md`             | Every open decision plus the real issues the handbook surfaced                  |
| 01 | `01-company-foundation.md`            | Mission, vision, purpose, values, brand promise, trust model, market strategy   |
| 02 | `02-org-structure-and-roles.md`       | Org chart, roles, RACI, hiring order, scaling plan                              |
| 03 | `03-provider-recruiting-sop.md`       | Sourcing and signing up providers in a new area                                 |
| 04 | `04-provider-vetting-and-filtering.md`| The quality bar, differentiation strategy, KYC, the scored funnel + interview script, tiering, approve/reject, post-approval monitoring |
| 05 | `05-provider-onboarding-and-training.md`| Activation, training, first-job support, code of conduct                      |
| 06 | `06-customer-support-sop.md`          | Channels, SLAs, triage, scenario playbooks, macros                              |
| 07 | `07-provider-support-sop.md`          | Payouts, jobs, accounts, change orders, suspensions                             |
| 08 | `08-dispatch-and-live-operations.md`  | How dispatch runs, monitoring, no-provider handling, shifts                     |
| 09 | `09-trust-safety-and-disputes.md`     | Dispute SOP, refund decision tree, fraud and safety, incidents                  |
| 10 | `10-money-and-compliance-ops.md`      | Escrow, payouts, commission, PayMongo, BIR, NPC privacy                         |
| 11 | `11-admin-system-training-manual.md`  | Page-by-page admin guide plus the new-admin curriculum                          |
| 12 | `12-quality-standards-and-kpis.md`    | Quality standards, KPIs, scorecards, the weekly review                          |
| 13 | `13-policies-codes-and-templates.md`  | Policies, codes of conduct, copy-paste template library                         |

About 45,000 words total.

## Reading paths by role

| Role                          | Read in this order                                                        |
|-------------------------------|--------------------------------------------------------------------------|
| Founder / Operations Lead     | 01, 00, 02, then skim all. You own the decisions in 00.                  |
| New customer support agent    | 01, 06, 13 (templates), 09 (disputes), 11 (the admin pages you use)      |
| New provider support agent    | 01, 07, 04 (so you understand vetting), 10 (payouts), 13                 |
| Provider success / vetting    | 01, 03, 04, 05, 11                                                        |
| Dispatch / QA                 | 01, 08, 12, 11                                                            |
| Finance / compliance          | 01, 10, 09, 11                                                            |
| New admin (any role)          | 01, then 11 cover to cover, plus the doc for your function               |

## Standing assumptions

These run through the whole handbook. Each is an editable default. If any is wrong, tell me and I will update the affected docs.

- **First market is Metro Cebu** (Cebu City, Mandaue, Lapu-Lapu, Talisay). The platform is city-agnostic, so other cities are added in admin when ready.
- **The launch team is lean** and grows on the triggers in `02`.

  > **Set (editable):** Start with 3 to 4 people for the Metro Cebu launch and grow on the hiring triggers in `02`. _Recommended default. To change it, edit here and anywhere this value is referenced._

- **Support is in-house at launch** and bilingual (Bisaya, Tagalog, English).

  > **Set (editable):** In-house support for the Metro Cebu launch, staffing email and Facebook Messenger first; move to a hybrid model once volume passes two agents. Add a phone/SMS hotline later as volume warrants. _Recommended default. To change it, edit here and anywhere this value is referenced._

- **Support hours.**

  > **Set (editable):** Monday to Saturday, 8:00 AM to 6:00 PM PHT (regular Philippine business hours). Sunday is closed at launch; urgent safety issues still escalate via the on-call path. Tighten to 5:00 PM or extend evening coverage as the booking curve shows. _Recommended default. To change it, edit here and anywhere this value is referenced._

- **Money actions stay with super-admin staff.**

  > **Set (editable):** Refunds, payouts, and escrow release always stay with super-admin staff. Super-admin accounts are Ken plus one Operations Lead only. Before launch, wire money actions behind a finance/super-admin gate so support agents get a limited admin login that cannot reach money buttons. _Recommended default. To change it, edit here and anywhere this value is referenced._

- **The instant-pay model is live** (customer pays first into escrow, the provider is matched after). Merged and deployed on 2026-06-19 (PR #44, E03 closed).

## How to keep this current

- These are living documents. When a process changes, update the doc in the same week.
- When Ken settles a `DECIDE` callout, edit that section in place, record the chosen value as editable, and delete the callout.
- Numbers marked as "starting targets" or "starting ranges" get re-tuned after the first month of real Cebu data, then quarterly.
- If the app changes (new admin page, new status, new policy), update the affected doc so the handbook never drifts from the product.

## Open decisions set in this doc

- **Launch team size:** 3 to 4 people for the Metro Cebu launch, growing on the `02` triggers (editable).
- **Support model and channels:** in-house at launch, email and Facebook Messenger first, hybrid after two agents (editable).
- **Support hours:** Monday to Saturday, 8:00 AM to 6:00 PM PHT; Sunday closed at launch (editable).
- **Money actions and super-admin:** refunds, payouts, and escrow release stay with super-admin staff (Ken plus one Operations Lead); gate money actions before launch (editable).
