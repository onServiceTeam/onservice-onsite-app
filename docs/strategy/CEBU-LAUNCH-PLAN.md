# onService — Cebu launch plan (founder briefing)

> **STATUS UPDATE (2026-08-24):** Metro Cebu first and city-agnostic operation
> are now binding. Historical statements below that the app is wired for
> Boracay, that guarantee funding is launch-ready, that external PayMongo
> checkout works, or that old pricing/fee assumptions are current are
> superseded by `AGENTS.md`, E10/F#10, E14, E16, and the operations handbook.

Written 2026-05-30 for Ken. Plain English. This reconciles what is actually
built in the code today with the direction you described: launch in Metro
Cebu, lead with popular home services, keep a curated set of vetted pros busy,
monetize properly, allow a B2B side, and be less restricted than the older
single-island plan.

This document is advice plus a recommended plan. The business decisions
(which city, how aggressive on fees) are yours. Where I recommend something I
say why, and I flag where the code currently disagrees with this direction.

---

## 1. The one big decision: the app is wired for Boracay, you want Cebu

The older written strategy in this repo chose **Boracay** as the launch market
(a B2B-first tourist island) and the app has Boracay coordinates baked into a
few map screens. Your direction is **Metro Cebu** (Cebu City, Mandaue,
Talisay, Lapu-Lapu).

Good news: **this is a change of settings, not a rebuild.** Here is why:
- The list of cities/service-areas is **not** baked into the database. It is
  created at runtime from the admin tools. So "where we operate" is something
  you set, not something a developer codes.
- The service catalog (categories, services, prices) is **fully editable from
  the admin website** with no code change.
- The only Boracay-specific things in code are a handful of **default map
  center coordinates** on a few screens. Those are easy to switch to Cebu.

What switching to Cebu actually takes (small, I can do it):
1. Change the default map center from Boracay to central Cebu.
2. Add Cebu City / Mandaue / Talisay / Lapu-Lapu as the launch service areas.
3. Tune the catalog prices to Cebu norms (see Section 3).
4. Refresh the older strategy docs so they stop saying "Boracay."

Independent market research agrees Cebu is a smart pick: it is the #2 urban
economy in the Philippines (~3.2M people in Metro Cebu, fast-growing,
real spending power) but far less crowded with competitors than Metro Manila,
where the existing apps (MyKuya, Gawin, GoodWork) concentrate. Davao is a fine
expansion #2 but smaller and lower-income.

---

## 2. What you already have (so you know the starting point)

You have built a lot. In plain terms:

- **A customer app** to browse services, book, pay (GCash/Maya/card via
  PayMongo, or an in-app wallet), chat with the provider, track the job, then
  rate and tip.
- **A provider app** for the worker: apply and get vetted, get job requests,
  send quotes, do the job, get paid, see earnings, request payouts.
- **An admin back office** (web) with ~30 screens: customers, providers,
  bookings, a live dispatch map, catalog/price editor, disputes, financials,
  payouts, marketing/promos, analytics, audit log, settings, staff/roles,
  compliance, support tickets, and B2B accounts.
- **Money handling done carefully:** customer pays into **escrow**, money is
  only released to the provider when the customer confirms the job. There is a
  small self-funded **guarantee fund** for problems.
- **Trust/vetting:** providers must upload a government ID, an NBI clearance,
  and a selfie, and an admin approves them before they can work. There are
  provider **tiers** (new → verified → pro → elite, plus an invite-only
  "founding" tier) that lower the commission as they prove themselves.
- **Loyalty built in:** a points/loyalty system ("suki"), referrals (invite a
  friend, both get credit), recurring bookings, and reviews.
- **A B2B side** (offices, condos, hotels, restaurants): team accounts with
  monthly invoicing and net-30 terms already work on the backend.

The services seeded today: Cleaning, Plumbing, Electrical, Aircon, Carpentry
have real sub-services and prices. Painting, Pest Control, Appliance Repair,
Roofing, and Landscaping exist as empty headings with no sub-services yet.

---

## 3. Recommended launch shape

### Services: lead with aircon, anchor with cleaning

The research is clear that **aircon cleaning is the wedge** in the Philippines:
hot climate, split-type units need cleaning every few months, it is
predictable, repeatable, easy to standardize, and easy to vet. Every existing
PH app leads with it.

Recommended launch catalog (5 to 7 services, expand from there):
1. **Aircon cleaning** (window + split) — the hero. Recurring demand.
2. **Aircon repair / freon recharge** — natural upsell from cleaning.
3. **House cleaning** (general + deep) — best recurring-revenue companion.
4. **Appliance repair** (ref/washer) — same kind of technician pool. *(needs
   sub-services added; today it is an empty heading.)*
5. **Plumbing** (leaks, faucet, toilet) — urgent, steady demand.
6. **Electrical** (outlets, lighting, breakers) — steady, but vet carefully
   for safety/liability.
7. Optional: **Pest control** (recurring contracts possible).

Hold back for now (low frequency or harder to vet): locksmith, TV repair,
computer/laptop repair, laundry, handyman-as-catch-all. Add them once you have
supply and data.

### Prices: tune to Cebu, not Manila

Cebu prices run **below** Manila. Research ranges: split-type aircon clean
~₱600-750 (Manila is ₱1,500+), window ~₱300-350, house cleaning ~₱1,000-2,500
per visit. Today's seeded prices are close-ish but set for a generic market;
we should set Cebu-accurate prices. All of this is editable in the admin
catalog, so you can adjust without a developer.

### Supply: your "curated vetted pros" instinct is the right model

Your idea (sign up and vet 5 to 10 quality pros per service, keep them busy)
fits the app well and is the trust advantage over Facebook-group booking. Make
vetting visible to customers (verified badge, ID + NBI checked, ratings). One
thing to know: the app today does **not auto-assign** a job to the nearest pro.
A customer posts a job and providers send quotes; the customer picks one. With
a small curated pool this is fine, but a job can sit with no quotes if nobody
is watching. Two easy safeguards: (a) the admin "Dispatch" console can assign a
job manually, and (b) we can add a simple auto-assign for the curated pool.
Tell me if you want auto-assign and I will build it.

---

## 4. How you make money (the full menu, and what to turn on)

Everything below is already in the code. Most values are editable from the
admin Settings page without a developer. "On" means it earns money today;
"Off/dormant" means it is built but not currently earning.

**On today:**
- **Provider commission** — the platform keeps a cut of each job. Current:
  15% for new providers, dropping to 9% for elite (founding tier 10%). This is
  your main revenue line.
- **Customer service fee** — 10% added on top of the job, kept 100% by the
  platform (minimum ₱25, capped ₱500). Your second revenue line.

**Built but currently earning nothing (opportunities to turn on):**
- **Surge / peak pricing** — the engine exists (e.g. charge more on hot-season
  peaks or rush slots) but **no rules are set**, so it earns ₱0 until you add
  rules in the admin Pricing page. There is also a "platform keeps part of the
  surge" feature that is coded but **not wired up** (a developer task if you
  want it).
- **Tips** — work, but the platform takes **0%** and tips are wallet-only.
- **Wallet top-up fee / payout fee** — there is **no fee** on money in or out
  today. A small cash-in or payout fee is a standard lever if you want it.
- **Paid memberships / provider listing fees / business-account fees** — none
  exist. Options if you want them later: a customer "priority/discount"
  membership, or a provider subscription for better placement.
- **Insurance product (SiguradoShield)** — deliberately shelved because it
  needs an Insurance Commission license. Do not turn this on without legal
  advice. The self-funded guarantee fund stays.

My recommendation for launch: keep commission + service fee as the core, add
**a few sensible surge rules** (e.g. same-day/rush aircon in peak heat), and
**leave tips at 0% take** (goodwill with providers early). Revisit top-up/
payout fees and memberships after you have traction. This keeps you "less
restricted" on revenue without nickel-and-diming customers on day one.

---

## 5. Loyalty and retention (already built)

- **Suki points:** customers earn points per booking with a provider; more
  bookings move them up tiers (regular → suki → super_suki) which give a 5-10%
  discount and faster point earning. Points convert to wallet credit.
- **Referrals:** referrer and referred friend each get ₱50 credit (the friend
  on signup, the referrer after the friend's first completed booking). This is
  your cheapest growth channel and pairs perfectly with Facebook sharing.
- **Recurring bookings:** weekly/bi-weekly/monthly schedules with optional
  auto-charge. This is the retention engine for cleaning and aircon.
- **Reviews:** feed a provider quality score that drives ranking.

These are strong. The main gap is simply **using them in marketing** (push the
referral code hard on Facebook; promote recurring cleaning as a subscription).

---

## 6. The B2B side (you said this is okay, and Cebu is good for it)

Cebu has lots of condos, BPO offices, restaurants, and Mactan hotels that need
regular aircon and cleaning. The backend for this is real: business accounts,
team members with permissions, contracts, and **automatic monthly invoicing
with VAT and net-30 terms**. 

Honest gaps: the **admin screens for B2B are view-only** right now (you can see,
approve, and suspend business accounts, but creating contracts, setting volume
discounts, and sending invoices are backend-only with no buttons yet), and
there is **no online payment for B2B invoices** (they are settled off-app). So
B2B is a strong *fast-follow*, not a day-one focus. If you want B2B at launch,
the build is "admin screens for contracts + invoices," which I can scope.

A sensible sequencing: launch consumer-first in Cebu, sign 2-3 anchor B2B
accounts (a condo or a small hotel) by hand using the existing tools, then
build the B2B admin screens once you see real demand.

---

## 7. Go-to-market (Cebu)

Research-backed channel priority for the Philippines:
1. **Facebook** is the anchor: hyperlocal Cebu ads, plus seeding the Cebu
   community / barangay buy-and-sell groups where people already ask for these
   services. Facebook *is* the discovery layer here.
2. **TikTok** for reach: short before/after aircon-cleaning clips convert well.
3. **Referrals + word of mouth:** lean on the built-in referral credit.
4. **Messenger** as the support/booking-assist channel.
5. **Billboards/outdoor:** brand reinforcement only, spend last.

Trust is the product. Make "ID-verified, NBI-checked, rated pros" the headline,
because that is exactly what informal Facebook booking cannot promise.

---

## 8. What still blocks a real public launch (be clear-eyed)

These are not app bugs; they are real-world setup items, and several take weeks:
- **Company + tax setup:** DTI/SEC registration, BIR registration and official
  receipts, VAT registration. As a foreigner, the corporate structure must be
  done cleanly (the Anti-Dummy Law makes nominee fronts a serious crime). Get a
  Philippine corporate lawyer for this. This is the most important item.
- **Local permits:** Mayor's permit + barangay clearance for the cities you
  operate in (now Cebu, not Malay/Boracay).
- **Data Privacy:** register a Data Protection Officer with the NPC within 30
  days of operating; penalties are severe.
- **PayMongo live mode:** finish their merchant onboarding so you can actually
  take real payments (their review takes weeks).
- **Lawyer-reviewed wording:** the terms, the provider contract, and the "no
  insurance" disclaimer need an attorney's sign-off.
- **A few production technical items** (DNS/TLS, error monitoring, backups,
  receipt storage) tracked in `docs/runbooks/launch-cutover.md`.

You can build, test, and demo everything now. These items gate taking real
money from the public.

---

## 9. Suggested phased roadmap

**Phase A — Make it real for Cebu (app side, mostly me):**
switch the launch market to Cebu, set the Cebu launch catalog and prices, add
a couple of surge rules, and (optional) add simple auto-assign for the curated
pool. Get you a clean way to test and demo all roles (done — see the testing
guide).

**Phase B — Get legally able to operate (you + a lawyer/accountant):**
the Section 8 items. Start the slow ones (corporate setup, PayMongo, NPC) now,
in parallel with Phase A.

**Phase C — Recruit and vet supply (you):**
sign and vet 5-10 pros per launch service in Cebu, starting with aircon.

**Phase D — Soft launch:**
invite-only or one barangay/condo cluster, real bookings, fix what hurts.

**Phase E — Public launch + Facebook/TikTok push, then B2B fast-follow.**

---

## 10. How to test and use it right now

See **`docs/TESTING-GUIDE.md`**. It walks you through starting the app and
playing all four roles (customer, provider, admin, support) on your own
computer, including the demo login code so you do not need real SMS.

---

## Notes on older docs in this repo

The files under `docs/strategy/` (STRATEGY.md, MARKETING-PLAYBOOK.md,
STRATEGIC-DECISIONS-LOG.md) describe the earlier **Boracay, B2B-first** plan.
They are not wrong, they are a different bet. This document is the Cebu,
consumer-first direction you described. If you confirm Cebu, I will update those
docs so the repo tells one consistent story instead of two.
