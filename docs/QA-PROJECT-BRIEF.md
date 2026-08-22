# onService PH — QA, Bug-Hunt & Production-Readiness Project Brief

**Prepared for:** a hired testing / QA / improvement team
**Prepared by:** onService PH (founder: Ken)
**Status of the product:** feature-complete v1.0 candidate, pre-launch. Not yet live to the public.
**Goal of this engagement:** test the entire product end to end, find and document every bug, harden it for a real public launch, and recommend concrete improvements to UX, UI, reliability, performance, and security.

---

## 1. What you are being hired to do

We have built a large, working home-services marketplace (think "Grab/Uber, but for home services" — aircon cleaning, plumbing, electrical, cleaning, etc.) for the Philippine market. The software exists and runs. What we need now is an **independent, thorough, professional test and improvement pass** before we launch to the public.

Concretely, we want you to:

1. **Test everything, exhaustively** — every screen, every button, every field, every dropdown, every flow, on all three apps (customer mobile, provider mobile, admin web) plus the backend and database.
2. **Find and document bugs** — functional, visual, money/financial, security, data, performance, and content bugs — with clear, reproducible reports and severity ratings.
3. **Judge production-readiness** — tell us honestly what must be fixed before we can take real customers and real money, versus what can wait.
4. **Recommend improvements** — UX/UI, conversion, clarity, accessibility, performance, and product gaps — prioritized by impact and effort.

This is not a light smoke test. We want the kind of rigor that a serious fintech/marketplace launch deserves, because **this app handles real money** (payments, escrow, payouts, tax receipts).

---

## 2. What the app is (the product)

**onService PH** is an on-demand home-services marketplace launching in **Metro Cebu** (Cebu City, Mandaue, Lapu-Lapu, Talisay), Philippines. It connects customers who need home services with vetted, screened service providers.

**Launch service categories** (10 seeded; aircon and cleaning are the lead services): aircon cleaning & repair, house cleaning, plumbing, electrical, appliance/TV repair, computer repair, carpentry/handyman, locksmith, pest control, and more. The exact catalog and prices are **admin-configurable**.

**The model:** start with a small number of high-quality, vetted providers per category (proof of skill, IDs, good reviews), keep them busy with steady jobs, and give customers confidence they'll get quality work. Grow city by city.

**The four kinds of users:**
- **Customer** — books and pays for services (mobile app).
- **Provider** — the worker who performs the service (same mobile app, different role).
- **Admin / Super-admin** — the company back office (web app): catalog, pricing, providers, bookings, money, disputes, marketing, settings.
- **Support / Back-office staff** — customer support, dispute resolution, finance, data-privacy officer (web app, role-limited).

**How the business makes money (monetization levers, mostly admin-configurable):**
- **Commission** taken from each completed job (tiered by provider level).
- **Service fee** added to the customer's price.
- **Surge / dynamic pricing** rules (peak times).
- **Promotions / promo codes** (customer acquisition).
- **Suki loyalty** program (points → wallet credit, repeat-customer retention).
- **Referrals.**
- **Tips** (pass-through to providers).
- **Wallet** top-ups (in-app balance).
- **B2B / business accounts** — companies (condos, offices, hotels) with contracts, negotiated rates, monthly invoicing, and volume discounts.

**Compliance context (Philippines-specific, important):**
- **Money:** all amounts in centavos; currency is PHP (₱). 12% VAT. **BIR** official receipts must be issued. Payments via **PayMongo** (GCash, Maya, cards, QR Ph). Provider payouts via PayMongo transfers. Customer funds are held in **escrow** and released to the provider only after the job is confirmed complete.
- **Data privacy:** **RA 10173 (Data Privacy Act)** — consent tracking, data-subject rights (export/erase), a Data Protection Officer role, NPC registration.
- **Time/locale:** all dates anchored to **Asia/Manila** timezone; phone numbers in **+63** format.

---

## 3. The system (what to test, technically)

Three front-ends + one backend + one database. You do not need to be able to modify the code, but you must be able to run it (Section 5) and read enough to file precise bugs.

| Surface | What it is | Tech | Scale |
|---|---|---|---|
| **Customer app** | What customers use | React Native + Expo (iOS, Android, web) | 43 customer-specific/tab routes plus 8 shared auth/support/root routes |
| **Provider app** | What providers and their staff use (same app, role-gated) | React Native + Expo (iOS, Android, web) | 52 provider/onboarding/staff routes plus the same 8 shared routes |
| **Admin web app** | Company back office | React + Vite (web browser) | 34 routed page components |
| **API (backend)** | The "brain" — all logic + money | Node.js + Express + PostgreSQL | 47 route modules |
| **Database** | All data | PostgreSQL 18 | ~130 migrations |
| **Supporting services** | Cache, file storage, email, monitoring | Redis, S3/MinIO, MailHog, Prometheus/Grafana | — |

There are also existing **automated tests** you should run, extend, and not break:
- **API:** ~2,800 backend unit/integration tests (Jest).
- **Admin web:** per-page render tests (Vitest).
- **Mobile:** screen + logic tests (Jest).
- **Mobile end-to-end:** 84 Maestro UI flow files (43 customer + 41 provider) — **screenshot baselines not yet captured** (a task for this team).
- **Admin end-to-end:** 29 Playwright visual specs — baselines partially captured.
- **Load tests:** k6 scripts (auth, booking flow, catalog search, payment webhook).

---

## 4. The roles and how to reach them

Every test scenario should be run from the correct role. The roles:

- **Customer** — sign in on the mobile app with a customer phone number.
- **Provider** — sign in on the mobile app with a provider phone number (the account itself is a provider). New users start as customers and can apply to become providers through an onboarding flow.
- **Admin** — the back office; sees most things, but money/settings actions are restricted.
- **Super-admin** — the back office with full power (money, settings, staff, payouts, refunds).
- **Support / DPO / Finance / Dispatcher** — narrower back-office roles. **Note:** today only `admin`, `super_admin`, and `dpo` can log into the admin web app; `support`/`finance`/`dispatcher` exist in the database but cannot yet sign in — **verify this and flag it.**

Demo accounts and the exact login steps are in **`docs/TESTING-GUIDE.md`**. Local testing uses a **demo login code `000000`** for the mobile app (no real SMS needed); this is impossible to enable in production.

---

## 5. Test environments (how to run it)

Follow **`docs/TESTING-GUIDE.md`** for the full setup. In short, each tester needs:
- A Windows or Mac machine with **Docker Desktop** and **Node.js 24+**.
- One command brings up the backend + database + demo data (`./scripts/dev/up.ps1` on Windows, `bash scripts/dev/up.sh` on Mac/Linux).
- Then run the API, the admin web app, and the mobile app (three terminals — commands in the guide).
- The mobile app runs in a web preview, an Android emulator, an iPhone simulator, or on a real phone via Expo Go.

**Known environment caveat (already a finding):** the API's Docker container currently fails to run (a packaging bug); the documented workaround is to run the API directly on the host. This itself is a bug the team should help resolve, because it also affects production deployment.

We will also stand up a shared **staging environment** (a deployed copy with test data) so the team can test on real devices over the internet — details to follow. **Never test against the production environment or real customer data.**

---

## 6. What "test completely" means — the testing program

Cover all of the following. For each area we list what to do and what to watch for.

### 6.1 Functional testing (exhaustive, screen-by-screen)
Go through **every screen on all three apps** and exercise **every interactive element**: buttons, links, dropdowns, fields, toggles, tabs, filters, search, date pickers, pagination, modals, action menus, and navigation. For each:
- Does it do what its label says?
- Does it go where it should (no dead ends, no broken navigation)?
- Does data entered actually save and persist?
- Are there proper **loading, empty, and error states** (not blank screens or spinners that never end)?
- Are destructive actions (cancel, delete, refund, payout) **confirmed** before they happen?

Deliverable: a screen-by-screen checklist with pass/fail and linked bug reports.

### 6.2 End-to-end journeys (cross-role)
Walk complete real-world journeys across roles, e.g. the core booking lifecycle:
1. Customer books a service and pays.
2. A provider is offered the job, accepts, travels, and completes it.
3. Customer confirms completion (money releases from escrow), rates, and tips.
4. Admin sees the booking, the money math, and the queued payout.
5. Support handles a dispute or a support ticket on it.

Also test: recurring bookings, change-orders (extra work mid-job), cancellations and refunds at each stage, disputes, B2B contract bookings and monthly invoices, wallet top-up and wallet payment, promos/loyalty/referrals, and provider onboarding from scratch.

### 6.3 Money & financial correctness (highest priority)
This app moves real money. Verify with a calculator:
- Price breakdowns (base + add-ons + surge − discounts + service fee + VAT) add up correctly, everywhere they're shown (customer, provider, admin, invoices, receipts).
- Escrow holds the right amount, and **releases only after confirmation**.
- **Refunds** at each cancellation stage are correct and not double-paid.
- **Commission and provider payout** amounts are correct.
- **VAT (12%)** and **BIR official receipts** are correct and sequential.
- **Currency rounding** (centavos) never loses or invents money.
- No way for a customer or provider to manipulate a price client-side.
- Wallet balance can never go negative or be double-spent.
Treat any money discrepancy as **critical**.

### 6.4 Roles & permissions
- Confirm each role sees and can do only what it should. Super-admin-only actions (refunds, payouts, settings, discounts, staff) must be **hidden and blocked** for lower roles — both in the UI and at the API (try calling the API directly as a lower role).
- Confirm a customer cannot access provider or admin functions, and vice versa.
- Confirm one customer/provider cannot see or act on **another user's** data (test for "insecure direct object reference": change an ID in a request and see if you get someone else's booking/invoice/payout).

### 6.5 UX / UI audit (this is a major part of the job)
Beyond "does it work," tell us "is it good." Review every surface for:
- **Clarity & flow:** is each screen's purpose obvious? Is the path to book/quote/pay/complete smooth and short? Where do users get confused or stuck?
- **Consistency:** consistent wording, button styles, spacing, icons, date/money formatting, and terminology across all screens and all three apps.
- **Empty/loading/error states:** helpful, friendly, and never dead-ends.
- **Copy & content:** clear, correct, professional Philippine English; no placeholder text, no "lorem ipsum," no developer jargon shown to users.
- **Accessibility:** text contrast, tap-target sizes, screen-reader labels, font scaling.
- **Mobile fit:** looks right on small and large phones, notches, keyboards covering inputs, landscape, slow connections.
- **Trust & polish:** does it look like an app people would put their credit card and let a stranger into their home? Flag anything that erodes trust.

Deliverable: a prioritized UX/UI report with screenshots, the problem, the impact, and a concrete recommendation for each item.

### 6.6 Cross-device & cross-platform
- Mobile: **Android and iOS**, multiple screen sizes and OS versions, real devices (not just emulators).
- Admin web: Chrome, Edge, Safari, Firefox; common screen resolutions.
- Test on slow / flaky networks and offline-to-online transitions.

### 6.7 Negative, edge, and stress testing
- Bad/empty/oversized input in every field; emoji, very long text, special characters, SQL-ish strings.
- Double-taps and double-submits (e.g., paying twice, booking twice) — must not create duplicates or double-charge.
- Interrupting flows (kill the app mid-payment, lose network mid-booking) and resuming.
- Race conditions (two providers accept the same job; customer cancels while provider accepts).
- Date/time edge cases around midnight Manila time, and bookings scheduled far in the future/past.

### 6.8 Security testing
- Authentication: OTP login, admin password + 2FA, session expiry, token refresh, logout.
- Authorization (see 6.4): role escalation, IDOR.
- Input handling: injection, XSS in any field that's later displayed (chat, reviews, names, addresses).
- Rate limiting and abuse (spamming OTP, bookings, disputes, promo codes).
- PII handling and the data-privacy flows (export/erase requests actually work and respect privacy).
- Confirm secrets/keys are never exposed to the client or in URLs.
Report security issues **privately and as critical.**

### 6.9 Performance & load
- Run the existing k6 load tests; report response times and failures under load.
- Watch for slow screens, large payloads, N+1 database queries, and memory leaks.
- Map/list screens with many items; pagination performance.

### 6.10 Philippine-specific correctness
- Currency always **₱ / PHP**, correct formatting and rounding.
- All times in **Asia/Manila** (no off-by-8-hours bugs around midnight).
- Phone numbers **+63** format; GCash/Maya/QR Ph payment paths.
- Real **Cebu** addresses geocode and match providers; the map centers on Cebu.
- BIR receipts and VAT comply with PH requirements.

### 6.11 Compliance & legal
- RA 10173 data-privacy flows (consent capture, data export, data erasure, DPO tools).
- BIR receipt issuance and numbering.
- The legal disclaimers/terms shown to users (note: final insurance/liability wording is still pending attorney review — flag anything that over-promises).

### 6.12 Regression & automation
- Run the existing automated suites (API Jest, admin Vitest, mobile Jest) and report any failures.
- **Capture the missing visual baselines** (Maestro for mobile, Playwright for admin) so future changes can be caught automatically — this is a concrete deliverable.
- Recommend and, if in scope, add automated tests for the riskiest money and auth paths.

---

## 7. Known issues & intentional limitations (read before you start)

So you dig in the right places and don't waste time re-reporting things we already know or flagging deliberate v1.0 scope cuts as bugs. **Verify the current state of each — some may have changed — and report anything worse than described.** The authoritative living list is **`LAUNCH-LIMITATIONS.md`** in the repo; highlights:

**Known bugs / gaps to help fix:**
- **API Docker container fails to run** (packaging/module-resolution bug). Workaround: run API on host. Affects production deploy. **High priority.**
- **Visual regression baselines not captured** (Maestro mobile flows; some Playwright admin specs). Needs a device/emulator session.
- **Final legal/insurance disclaimer wording** is interim, pending attorney review.
- **Support/Finance/Dispatcher roles** may not be able to log into the admin web app yet.

**Intentional v1.0 scope cuts (NOT bugs — confirm they're cleanly disabled, not half-broken):**
- **Live provider GPS tracking** on the map (real-time moving dot) — deferred to v1.1; the map shows fixed service/provider locations and status updates.
- **Promo code redemption** and **A/B testing** frameworks — pulled from v1.0.
- **In-house insurance product** — deferred.
- **Hourly-priced services** — not supported in v1.0 (fixed-price and quote-based only).
- **B2B contract pricing** — the engine exists but is **not yet wired into the mobile checkout** (no "book for my company" button yet); it's an opt-in foundation.
- **Provider onboarding approval is manual** (admin reviews KYC) — by design for launch.
- **Auto-dispatch** requires vetted providers seeded in the launch city; with demo data, providers are in Cebu.

**Still-pending launch (operational, non-software) items** — see `docs/runbooks/launch-cutover.md`: NPC DPO registration, BIR Authority-to-Print receipts, DTI permit, PayMongo live-mode keys, production S3/backups/DNS/TLS. The team should be aware these gate launch even when the software is perfect.

---

## 8. How to report bugs (required format)

Every issue must be reproducible by a developer who wasn't there. Use this template per bug (in the agreed tracker — see Section 11):

```
Title:        [Surface] Short, specific summary
Severity:     Critical / High / Medium / Low (see below)
Surface:      Customer app / Provider app / Admin web / API / Database
Role:         Customer / Provider / Admin / Super-admin / Support / DPO
Environment:  Local / Staging  + device/OS/browser + app version/commit
Steps:        1. … 2. … 3. … (exact, from a known starting state)
Expected:     What should happen
Actual:       What happened
Evidence:     Screenshot / screen recording / API request+response / logs
Money impact: Yes/No (if money is wrong, always at least High)
Notes:        Frequency (always/sometimes), workaround, related issues
```

**Severity definitions:**
- **Critical** — money is wrong, data loss, security/privacy breach, app crash/blocker on a core flow (book, pay, complete, payout), or anything that could harm a customer, provider, or the company legally or financially.
- **High** — a core flow is broken or badly degraded; a role can do something it shouldn't; a screen is unusable.
- **Medium** — a non-core feature is broken, or a confusing/inconsistent experience that hurts conversion or trust.
- **Low** — cosmetic, copy, or minor polish.

---

## 9. Definition of "production ready"

We consider the software ready to launch when **all** of these are true:
1. **Zero open Critical or High bugs**; Medium bugs triaged with a plan.
2. **All money/financial flows verified correct** by the team (escrow, refunds, payouts, commission, VAT, receipts) with documented test evidence.
3. **All automated test suites pass**, and the **5 CI gates are green** on the latest commit.
4. **Visual baselines captured** for the core mobile and admin screens, so regressions are caught automatically.
5. **Role/permission and security tests pass** (no privilege escalation, no IDOR, no exposed secrets).
6. **A full end-to-end journey** (book → pay → perform → confirm → release → payout → receipt) passes cleanly on real Android and iOS devices.
7. **The API runs in its production container** (current Docker bug fixed).
8. **UX audit issues** above an agreed severity are resolved.
9. The operational launch checklist (`launch-cutover.md`) items are owned and on track (these are the company's responsibility, not the team's, but the team should confirm the software supports them — e.g., BIR receipts actually generate).

---

## 10. Improvement scope (beyond bug-finding)

We don't just want a bug list; we want the product to get **better**. Please also deliver:
- A prioritized **UX/UI improvement plan** (impact vs. effort), with mockups or concrete suggestions for the highest-impact screens (especially the customer booking and payment flow, and provider job acceptance).
- **Conversion/retention** observations: where do customers drop off? Where is the provider experience frustrating?
- **Content/copy** improvements for clarity and trust (Philippine English).
- **Performance** improvements (slow screens, heavy queries).
- **Accessibility** improvements.
- Product **gaps** you notice versus competitor apps and customer expectations in the PH market.

---

## 11. Process, tools & logistics

- **Bug tracker / test management:** we'll agree on a tool (e.g., GitHub Issues, Jira, Linear, or a shared TestRail/Notion). All bugs and test runs live there, not in chat or email.
- **Cadence:** weekly status report (tested this week, bugs found by severity, retests, blockers, next week's plan) + a live triage call.
- **Source access:** read access to the repository for accurate reporting; the team does not push to the main branch unless we agree on a contribution process and code review.
- **Communication:** a shared channel (Slack/Discord/Viber) for fast questions; formal reports in the tracker.
- **Reference docs in the repo:** `docs/TESTING-GUIDE.md` (how to run it), `LAUNCH-LIMITATIONS.md` (known limits), `docs/runbooks/launch-cutover.md` (launch checklist), `docs/strategy/` (product strategy), `docs/architecture/` (specs).

**Suggested team composition** (adapt to budget):
- 1 QA lead / test manager (owns the test plan and the bug database).
- 2–3 manual/functional testers (screen-by-screen + journeys), at least one **based in the Philippines** for real devices, GCash/Maya, Cebu addresses, and local UX expectations.
- 1 UX/UI reviewer/designer (the improvement plan).
- 1 security tester (auth, permissions, PII, injection) — can be part-time/contract.
- Optional: 1 automation/SDET to capture visual baselines and extend automated coverage.

---

## 12. Guardrails (please read)

- **Never test against production or real customer/payment data.** Use the local or staging environment and demo data only.
- Use **PayMongo test mode** for any payment testing — never real cards or real GCash money.
- Handle any real or sample **PII** carefully; do not export or share it.
- **Do not commit secrets** (API keys, passwords) to the repository or share them in tickets.
- Report **security issues privately** to the founder, not in a public tracker.
- When in doubt about scope or whether something is a bug vs. intended, **ask** — the known-issues list (Section 7) is the first place to check.

---

## 13. What success looks like

At the end of the engagement we have: a complete, prioritized bug database; documented proof that the money and security flows are correct; captured automated regression baselines; a concrete UX/UI improvement plan; and an honest, evidence-backed answer to the one question that matters — **"Is onService PH ready to take real customers and real money in Cebu, and if not, exactly what's left?"**
