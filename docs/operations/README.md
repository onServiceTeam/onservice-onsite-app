# onService Operations Handbook

The operating manual for the office and support team behind the onService app. It covers who we are, how we filter and run providers, how we support customers and providers, how to use the admin system, and how we handle money, compliance, disputes, and quality.

Everything here is grounded in how the app actually works (real booking statuses, real provider tiers and commission rates, real admin pages, real escrow and dispute flows). Where the app does not define something, the doc says so and either recommends a default or flags it as a decision for Ken.

## Start here

1. Read `01-company-foundation.md` (everyone reads this first).
2. Read `00-DECISIONS-FOR-KEN.md` for the open decisions this handbook needs from Ken, plus a few real app issues it uncovered.
3. Then read your role's documents (see the reading paths below).

## The documents

| # | File | What it covers |
|---|---|---|
| 00 | `00-DECISIONS-FOR-KEN.md` | Every open decision + real issues the handbook surfaced |
| 01 | `01-company-foundation.md` | Mission, vision, purpose, values, brand promise, trust model, market strategy |
| 02 | `02-org-structure-and-roles.md` | Org chart, roles, RACI, hiring order, scaling plan |
| 03 | `03-provider-recruiting-sop.md` | Sourcing and signing up providers in a new area |
| 04 | `04-provider-vetting-and-filtering.md` | KYC, the vetting scorecard, tiering, approve/reject rules |
| 05 | `05-provider-onboarding-and-training.md` | Activation, training, first-job support, code of conduct |
| 06 | `06-customer-support-sop.md` | Channels, SLAs, triage, scenario playbooks, macros |
| 07 | `07-provider-support-sop.md` | Payouts, jobs, accounts, change orders, suspensions |
| 08 | `08-dispatch-and-live-operations.md` | How dispatch runs, monitoring, no-provider handling, shifts |
| 09 | `09-trust-safety-and-disputes.md` | Dispute SOP, refund decision tree, fraud and safety, incidents |
| 10 | `10-money-and-compliance-ops.md` | Escrow, payouts, commission, PayMongo, BIR, NPC privacy |
| 11 | `11-admin-system-training-manual.md` | Page-by-page admin guide + new-admin curriculum |
| 12 | `12-quality-standards-and-kpis.md` | Quality standards, KPIs, scorecards, the weekly review |
| 13 | `13-policies-codes-and-templates.md` | Policies, codes of conduct, copy-paste template library |

About 45,000 words total.

## Reading paths by role

- **Founder / Ops Lead:** 01, 00, 02, then skim all. You own the decisions in 00.
- **New customer support agent:** 01, 06, 13 (templates), 09 (disputes), 11 (the admin pages you use).
- **New provider support agent:** 01, 07, 04 (so you understand vetting), 10 (payouts), 13.
- **Provider success / vetting:** 01, 03, 04, 05, 11.
- **Dispatch / QA:** 01, 08, 12, 11.
- **Finance / compliance:** 01, 10, 09, 11.
- **New admin (any role):** 01, then 11 cover to cover, plus the doc for your function.

## Standing assumptions (adjust as the company forms)

These run through the handbook. If any is wrong, tell me and I will update the affected docs.

- First market is Metro Cebu (Cebu City, Mandaue, Lapu-Lapu, Talisay). The platform is city-agnostic.
- Launch team is lean (3 to 4 people), growing on the triggers in `02`.
- Support is bilingual (Bisaya, Tagalog, English) and in-house at launch.
- Money actions (refunds, payouts, escrow release) stay with super-admin staff.
- The instant-pay model (customer pays first into escrow, provider matched after) is the target. It is fixed on a branch but not yet merged to master (see `00`).

## How to keep this current

- These are living documents. When a process changes, update the doc in the same week.
- When Ken settles a `DECIDE` callout, edit that section in place and delete the callout.
- The numbers marked as "starting targets" should be re-tuned after the first month of real Cebu data, then quarterly.
- If the app changes (new admin page, new status, new policy), update the affected doc so the handbook never drifts from the product.
