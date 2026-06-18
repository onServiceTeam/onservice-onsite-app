# Org Structure and Roles

Purpose: who does what at onService PH, which admin permission each role gets, how the team scales from launch to 12 months, and who owns each process (RACI). Read this with `11-admin-system-training-manual.md` (the page-by-page admin guide) and `12-quality-standards-and-kpis.md` (the KPI definitions referenced here).

---

## 1. How to read this document

Two things drive every role below:

1. **The admin permission a person actually gets in the app.** The admin app gates access on a single `users.role` value. There are effectively two tiers that matter for access: `super_admin` (can do everything, including all money and destructive actions) and `admin` / `dpo` (read and operational access, no money buttons). A `dpo` is an admin-tier compliance role with extra rights over privacy records (NPC RA 10173). See `11-admin-system-training-manual.md` for the full permission map.

2. **A second "role" label inside the admin Staff & Roles page** (`super_admin`, `admin`, `support_agent`, `finance`, `moderator`) that is organizational metadata. It documents what a person is supposed to touch, but it does NOT by itself restrict the API. Until that changes, treat job-role separation as a discipline you enforce by hiring and training, not something the app forces.

> DECIDE: The granular Staff & Roles permissions (support_agent, finance, moderator) are seeded in the database but do not gate API routes today. Ken should decide whether to (a) keep two tiers (super_admin vs admin) and rely on staff discipline for now, or (b) prioritize wiring the granular roles so a support agent literally cannot open the escrow-refund button. Until decided, anyone who is not super_admin sees money buttons as read-only, and anyone who IS super_admin can do everything. Give super_admin to as few people as possible.

---

## 2. Launch org chart (lean team, day 1)

At launch you can run Metro Cebu with a very small team. Several roles are one person wearing multiple hats.

```
                        Ken (Founder / CEO)
                        super_admin
                              |
                     Operations Lead
                     super_admin
            ______________|________________________
           |              |            |           |
   Provider Success   Dispatch & QA   Customer    Finance & Compliance
   (Vetting +         (live ops +     Support     (part-time / Ken at first)
    recruiting)        quality)       Agent(s)    admin or dpo
   admin               admin          admin
```

Minimum viable launch headcount: 3 to 4 people.

- Ken (Founder/CEO) - also covers Finance & Compliance and final escalations at launch.
- 1 Operations Lead - also covers Dispatch & QA at launch.
- 1 Provider Success person - recruiting + vetting + onboarding.
- 1 Customer Support agent - also handles first-line provider support.

ASSUMPTION: The handbook does not state launch headcount. Three to four people is a starting target for a single-market (Metro Cebu) soft launch. Tune up as booking volume grows.

---

## 3. 12-month scaling org chart

```
                              Ken (Founder / CEO)
                              super_admin
                                    |
                            Operations Lead
                            super_admin
        ____________________________|____________________________________
       |              |              |              |            |        |
 Provider        Dispatch &     Customer       Provider     Finance &   DPO
 Success Lead    QA Lead        Support Lead   Support      Compliance  (data
 admin/          admin          admin          admin        Lead        privacy)
 moderator         |              |              |          super_admin  dpo
       |        Dispatchers   CS Agents x3-5  Provider      finance
 Vetting x2     (shift cover)                 Support x1-2
 Recruiters x1-2
```

Targets for when to add each layer are in `02`/`12`; the trigger numbers below are starting targets to tune.

---

## 4. Role definitions

Each role lists: purpose, daily responsibilities, the admin permission it maps to, and KPIs. KPI definitions and targets live in `12-quality-standards-and-kpis.md`; the numbers here are starting targets.

### 4.1 Founder / CEO (Ken)

- **Purpose:** Owns strategy, money-path decisions, legal/compliance sign-off, and anything the app flags as a hard stop.
- **Admin permission:** `super_admin`.
- **Daily responsibilities:** Approve money/compliance decisions that exceed an agent's authority (large refunds, provider bans, wallet adjustments, settings changes). Sign off on which markets turn on in **Service Areas**. Final approver on AML-flagged payouts (≥ ₱500,000) via **Run reconciliation** / payout review. Make the DECIDE calls in this handbook.
- **KPIs:** platform GMV, take rate, escrow integrity (zero unexplained discrepancies in **Financials → Reconciliation**), launch-readiness items closed.

### 4.2 Operations Lead

- **Purpose:** Runs day-to-day operations across recruiting, vetting, dispatch, and support. The person who keeps bookings flowing and providers supplied.
- **Admin permission:** `super_admin` (needs money/destructive actions for escalations).
- **Daily responsibilities:** Morning check of the **Dashboard** (active bookings, pending disputes, escalated disputes, stale disputes 48h+, provider approvals, guarantee-fund runway). Clear the day's provider approval queue or assign it. Watch the **Dispatch Console** during peak hours. Own the on-call rota and escalation path. Resolve disputes that agents escalate. Tune **Settings** knobs (offer timeout, auto-confirm hours, cancellation brackets) with Ken's sign-off where money is involved.
- **KPIs:** booking fill rate (% of `requested`/`paid` bookings that reach `matched` within target), no-provider rate, time-to-approve providers, dispute resolution time, CSAT.

### 4.3 Provider Success / Vetting

- **Purpose:** Find providers, vet them, approve or reject them, and get them to their first job. Quality of the supply side starts here.
- **Admin permission:** `admin` (and the `moderator` Staff & Roles label for organizational clarity). Approve/reject/suspend/tier actions on the **Providers** page are available to admin-tier; they do not require super_admin. Wallet adjustment on a provider does (super_admin only).
- **Daily responsibilities:** Work the recruiting funnel (see `03-provider-recruiting-sop.md`). Review the pending-provider queue on **Providers** / **Provider detail (Provider 360)**: check NBI clearance + expiry, government ID front/back, and selfie in the **Profile** tab (served via the admin-only KYC proxy). **Approve** only when the three required KYC docs are on file (NBI clearance, gov ID front, selfie) - the app refuses approval otherwise and lists what is missing. **Reject** with a reason of at least 10 characters. Run the skills test + 2 references + before/after-photo probation check (policy from DECISION-003; the photos and references are a manual step, not enforced by code). Set initial **tier** (default `new`; `founding` is invite-only for the launch batch, 10% commission for 12 months). Onboard approved providers (see `05-provider-onboarding-and-training.md`).
- **KPIs:** providers approved per week vs the per-area `min_providers_to_launch` target (default 5), application-to-approval time, % of approved providers who complete a first job within 14 days, 90-day provider retention, rejection-reason quality.

### 4.4 Dispatch & QA

- **Purpose:** Keep live bookings matched and on track; catch quality problems before they become disputes.
- **Admin permission:** `admin` for monitoring; the **Reassign / Cancel / Message customer** actions on the **Dispatch Console** are super_admin-gated, so a dispatcher who must reassign in real time needs super_admin OR escalates to the Operations Lead.
- **Daily responsibilities:** Watch the **Dispatch Console** (live active bookings, providers online, alert tail). Auto-dispatch runs a 45-second offer cycle and cascades to the next provider automatically (up to 10 attempts); the dispatcher steps in when the system reports **no_provider_available**. Handle no-provider bookings: widen radius expectations, call a known provider, or cancel with the right refund. Manually **Reassign** when a provider goes dark. Spot-check completed jobs (before/after photos, GPS check-ins, ratings) for quality. Flag chronic-one-star or chronic-dispute providers to Provider Success. See `08-dispatch-and-live-operations.md`.
- **KPIs:** % bookings matched within target (starting target: 90% matched within 2 offer cycles), no-provider rate, manual-reassign count, average provider ETA accuracy, quality-flag rate.

> Note on dispatch defaults: the Dispatch Console map still centers on Boracay coordinates in one code path. That is a stale artifact, not the current Cebu-default direction. It does not affect matching; flag it to engineering, do not act on it operationally.

### 4.5 Customer Support Agent

- **Purpose:** First line for customers. Answer questions, fix booking problems, calm people down, file/triage disputes.
- **Admin permission:** `admin` with the `support_agent` Staff & Roles label. Agents can read everything operational, manage **Support Tickets** (status, assign, reply, internal notes), and message a booking's customer via the **Dispatch Console** super-admin path ONLY if granted super_admin (otherwise they escalate). Refunds, escrow release, force-complete, and dispute resolution are super_admin-only and get escalated.
- **Daily responsibilities:** There is no in-app support-ticket UI for end users, so most contact comes by email (`support@onservice.ph`) or the placeholder hotline; the agent creates the ticket in the admin **Support Tickets** page on the user's behalf (the `createdByAdminId` path). Triage by type (booking_issue, payment_issue, provider_no_show, app_bug, account_issue, general_inquiry) and priority. Walk customers through self-service (cancel, file dispute, change-order approval, data export). Escalate money actions to the Operations Lead / super_admin. Tone and macros are in `06-customer-support-sop.md` and `13-policies-codes-and-templates.md`.
- **KPIs:** first-response time, resolution time, CSAT, escalation rate, ticket reopen rate.

### 4.6 Provider Support

- **Purpose:** Keep providers earning. Handle payouts, account, job, and change-order questions.
- **Admin permission:** `admin`. Can view **Payouts** and provider **Financials**; **Approve / Reject / Complete payout** and **wallet adjust** are super_admin-only and get escalated. AML-flagged payouts (≥ ₱500,000) require a super_admin to clear the review.
- **Daily responsibilities:** Work the provider inbox (`providers@onservice.ph`). Explain payout status and timing (minimum withdrawal ₱100, one pending payout at a time, target 3 business days to complete). Help with change-order disputes (capped at 50% of original service price). Walk providers through NBI-expiry renewals (30-day warning window). Handle tier questions (commission is flat per tier: founding 10%, new 15%, verified 13%, pro 11%, elite 9%). Escalate suspensions. See `07-provider-support-sop.md`.
- **KPIs:** payout-query resolution time, provider CSAT, NBI-expiry lapse rate (target: near zero approved providers operating on expired NBI), change-order dispute rate.

### 4.7 Finance & Compliance

- **Purpose:** Keep the money clean and the company legal. Reconciliation, payouts oversight, BIR, NPC, PayMongo.
- **Admin permission:** `super_admin` for money actions (the Staff & Roles `finance` label covers financials/payouts/audit/analytics, but the actual money buttons are super_admin-gated). Compliance/privacy work uses the `dpo` role for consent records and DSRs.
- **Daily responsibilities:** Run **Financials → Reconciliation** (PayMongo vs expected balance) and acknowledge discrepancies. Oversee the payout queue and clear AML reviews. Watch the **Guarantee Fund** runway and replenishment status. Generate/finalize **BIR Reports** (monthly VAT 2550M, quarterly 2307 withholding). Track the launch-cutover compliance items (NPC DPO registration, BIR ATP, S3 Object Lock). See `10-money-and-compliance-ops.md`.
- **KPIs:** reconciliation discrepancies (target: zero unexplained), payout SLA (3 business days), guarantee-fund runway (target: stays above replenishment threshold), BIR filings on time, DSR SLA (15 days).

### 4.8 DPO (Data Protection Officer)

- **Purpose:** NPC compliance under RA 10173. Independent authority required by law, so this is a distinct role, not aliased to super_admin.
- **Admin permission:** `dpo`. Can search consent records (restricted to super_admin/dpo) and work the **Compliance** / **Data Protection Log** / **Consent Versions** surfaces (DSR queue, publish consent versions, escalate to NPC).
- **Daily responsibilities:** Work the Data Subject Request queue (access/correction/erasure) within the 15-day SLA. Publish new consent versions. Handle breach notification (72-hour NPC notice). Keep the privacy policy and DPO contact (`dpo@onservice.ph`) current.
- **KPIs:** DSR SLA compliance (15 days, zero overdue), consent-version coverage, breach-notice timeliness.

ASSUMPTION: At launch the DPO function can be Ken or a fractional/outsourced DPO (the launch-cutover runbook allows a fractional DPO). It does not need a full-time hire on day 1, but the `dpo` admin account must exist and be separate from a super_admin operator for NPC segregation-of-duties.

### 4.9 Admin / super_admin (the account itself)

- **Purpose:** Not a job title, a permission level. `super_admin` is the master key. Give it to the fewest people who genuinely need money/destructive actions (Ken, Operations Lead, Finance & Compliance Lead). Everyone else is `admin` or `dpo`.
- **Discipline:** Every privileged action writes an audited `admin_actions` row with a typed reason (minimums: most actions ≥10 chars, force-complete ≥20, dispute resolve/reopen ≥20). Mandatory TOTP 2FA on every admin login. Never share a super_admin account between people; the **Audit Log** is only useful if one login equals one person.

---

## 5. RACI for the main processes

R = Responsible (does the work), A = Accountable (owns the outcome, one per row), C = Consulted, I = Informed.

| Process | Founder/CEO | Ops Lead | Provider Success | Dispatch & QA | Customer Support | Provider Support | Finance & Compliance | DPO |
|---|---|---|---|---|---|---|---|---|
| Provider recruiting | I | A | R | I | - | C | I | - |
| Provider vetting / KYC / approve-reject | C | A | R | - | - | I | I | C |
| Provider tiering | C | A | R | C | - | C | I | - |
| Dispatch / live matching | I | A | I | R | C | I | - | - |
| No-provider handling | I | A | C | R | C | I | - | - |
| Customer support | I | A | - | C | R | C | C | I |
| Provider support | I | A | C | I | C | R | C | - |
| Disputes (resolve/refund) | C | A | I | C | R (intake) | C | C | I |
| Payouts (approve/complete) | A | C | - | - | - | R (intake) | R | - |
| Escrow release / refund (manual) | A | R | - | C | C | - | R | - |
| BIR / VAT / receipts | A | I | - | - | - | - | R | I |
| NPC / DSR / consent / breach | I | C | - | - | C | - | C | R, A |
| Service-area on/off (markets) | A | R | C | C | - | - | C | - |
| Settings / commission / fee changes | A | R | C | - | - | C | C | - |

Read across each row: exactly one A owns the outcome. Money rows keep the Founder or Finance as A because the app makes those actions super_admin-only.

---

## 6. Hiring profiles (who to hire first, second, third)

Hire to fill the biggest operational gap, not the most senior title.

### Hire #1 - Operations Lead / generalist

- **Why first:** One trusted person who can run dispatch, clear approvals, and handle escalations buys you the most coverage. At launch this person also covers Dispatch & QA.
- **Profile:** Operations or ops-coordinator background. Comfortable in a web admin tool. Fluent Bisaya + Tagalog + English (customers and providers will speak all three in Cebu). Calm under pressure. Trustworthy with money (gets super_admin).
- **Starting comp band:** DECIDE with Ken (handbook does not set salaries). Suggest a Cebu ops-coordinator market rate as a starting point.

### Hire #2 - Provider Success / Vetting

- **Why second:** Supply is the constraint. Until each launch area clears `min_providers_to_launch` (default 5) you cannot turn it on. This person owns recruiting through onboarding.
- **Profile:** Recruiting or field-sales instinct, detail-oriented enough to check NBI/ID/selfie carefully, comfortable rejecting people with a clear reason. Local network in the trades (cleaning, aircon, plumbing, electrical) is a strong plus.
- **Admin:** `admin` + `moderator` label.

### Hire #3 - Customer Support Agent

- **Why third:** Once bookings flow, customer questions and disputes arrive. This person also covers first-line provider support at first.
- **Profile:** Customer-service background, patient, writes clean Bisaya/Tagalog/English, can follow the dispute and refund SOPs without freelancing on money. Stays `admin`, escalates money actions.

### After the first three (in rough order, trigger-driven)

| Next hire | Trigger (starting target) |
|---|---|
| 2nd CS agent | Sustained > 30 to 40 inbound contacts/day, or first-response time slipping past target |
| Dedicated Provider Support | Provider base > ~100 active, payout/change-order volume pulling CS off customers |
| Finance & Compliance Lead | Approaching live PayMongo + BIR filing cadence, or guarantee-fund/reconciliation needs daily attention |
| 2nd market's Provider Success recruiter | When the second city enters `recruiting` status |
| Dispatch shift cover | When bookings span hours one person cannot stay awake for |

---

## 7. In-house vs outsourced support

> DECIDE: Customer + provider support staffing model. The handbook does not set this. Three options:
>
> 1. **In-house (recommended for launch).** Hire CS directly. You control tone, KYC/PII handling, and money-action discipline. Best while volume is low and every interaction teaches you the product. Cons: slower to scale, fixed cost.
> 2. **Hybrid.** Keep an in-house lead who owns disputes, refunds, and anything touching money or PII; outsource overflow/after-hours first-line (FAQ, booking status) to a BPO. Most CS work is reading FAQ answers and booking status, which outsources cleanly; disputes and refunds must stay in-house because they are super_admin money actions.
> 3. **Fully outsourced BPO.** Cheapest per seat at scale. Cons: a third party touches customer PII (NPC/DPA exposure, needs a data-processing agreement), weaker product knowledge, and you still cannot give a BPO super_admin for refunds.
>
> Recommendation: start in-house (Option 1) for the Metro Cebu launch so the team learns the product and the money paths firsthand, then move to Hybrid (Option 2) when daily contact volume outgrows two agents. Whatever Ken picks, money actions (refunds, escrow, payouts, dispute resolution) stay with super_admin staff and never go to a BPO.

---

## 8. Quick checklist - standing up the team

- [ ] Ken holds the only original super_admin; create separate super_admin logins for Ops Lead and Finance & Compliance Lead.
- [ ] Create a separate `dpo` account (not a super_admin) for NPC segregation of duties.
- [ ] Every operator has TOTP 2FA enrolled at first login.
- [ ] No shared admin accounts; one login per person so the Audit Log is meaningful.
- [ ] Provider Success can reach the **Providers** queue and knows the three required KYC docs.
- [ ] Customer Support can open and assign **Support Tickets** and knows which actions to escalate.
- [ ] Escalation path written and posted: agent → Operations Lead → Founder/CEO for money and compliance.
- [ ] RACI above reviewed with the team so everyone knows who is Accountable per process.
- [ ] DECIDE callouts in this doc (granular roles, support model) logged for Ken.

---

Sibling docs referenced: `03-provider-recruiting-sop.md`, `04-provider-vetting-and-filtering.md`, `05-provider-onboarding-and-training.md`, `06-customer-support-sop.md`, `07-provider-support-sop.md`, `08-dispatch-and-live-operations.md`, `09-trust-safety-and-disputes.md`, `10-money-and-compliance-ops.md`, `11-admin-system-training-manual.md`, `12-quality-standards-and-kpis.md`, `13-policies-codes-and-templates.md`.
