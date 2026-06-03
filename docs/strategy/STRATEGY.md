# STRATEGY — onService PH

> **STATUS (2026-06-04) — launch-city framing below is superseded.** onService is multi-city and city-agnostic; cities/service areas are configured in the admin area, not in code. The default / first launch market is **Metro Cebu**; other markets (Boracay, General Santos, Davao, Metro Manila, Bacolod, and others) are turned on in admin when ready, and which we actively market is an internal decision. Any single-city / "Boracay-primary" framing in this document is historical strategy, kept for context. Current source of truth: `CLAUDE.md` → "What this codebase is" and `docs/strategy/CEBU-LAUNCH-PLAN.md`.

**Decisions Ken needs to make before Phase 04 (admin dashboard) starts. Most of these are already implicit in the plan; this document makes them explicit.**

---

## Decision 1: Launch scope

**Recommended:** Multi-service from day one, in 1-2 cities.

**Specifically:**
- 5 services activated at launch in admin: cleaning, AC cleaning/servicing, plumbing, electrical, painting
- 1 city primary, 1 city secondary, configurable from admin
- Pest control, appliance repair, moving, carpentry, lawn, spa, laundry, deep cleaning, handyman: catalog rows exist but `is_active = false` until validated demand

**Why multi-service:**
- The codebase already supports 14 categories with full pricing model
- CleanHub's existing inquiry data proves PH demand spans multiple categories
- No incumbent owns the category in any Tier 2 PH city
- "We only do one thing" is not a useful brand position when the alternative is informal Facebook-group services
- Cleaning + AC together drive repeat behavior (cleaning every 2-4 weeks, AC every 3-6 months per unit, 2-4 units per home)
- Plumbing, electrical, painting are higher-margin add-ons customers discover after their first cleaning/AC booking

**Why limit to 5 services initially:**
- 5 services = focused marketing message
- Provider supply concentrated in 5 categories is recruitable
- Quality control is operationally manageable
- Each additional category adds ops complexity (training, vetting, support)

**Why 1-2 cities, not 3+:**
- Homejoy died spreading to 30 cities. Foodpanda Thailand exited at 5% market share after spreading thin.
- TaskRabbit stayed Boston-only for 2 years. Handy stayed NYC for 18 months. Urban Company stayed Delhi NCR for ~18 months.
- 1-2 cities is the maximum where a single ops team can credibly maintain quality

---

## Decision 2: Which cities

**Three viable patterns, Ken picks one:**

### Pattern A: Boracay primary, expand to Kalibo (m6) and Iloilo (m12) — RECOMMENDED & SETTLED

This is the path settled in the April 16 strategy chat. Reasoning:

- Ken lives in Boracay → zero relocation, can personally walk providers and customers
- Boracay's 10.32 sq km extreme density makes single-driver routing efficient
- Tourism accommodation B2B (hotels, condotels, Airbnb operators) provides recurring contracts that fund operations from month 2-3 — recurring AC and cleaning, predictable volume
- Zero serious branded competition in Aklan / Western Visayas
- 37K resident population is a constraint but B2B + tourist-zone laundry/cleaning offsets it
- Expansion path: Kalibo (Aklan provincial capital, ~80K pop) at month 6 once Boracay ops are stable, then Iloilo (468K pop, regional anchor) at month 12 — both same ferry line, share back-office

**Capital required (6 months Boracay-only):** ₱700K-1.2M
**Capital required (m1-m12 with Kalibo + Iloilo):** ₱2.0M-3.0M

**Marketing focus:**
- Phase 1 (m1-3): Hotel/condotel/Airbnb operator outreach in Station 1, 2, 3. Sales-led, not ads.
- Phase 2 (m3-6): HOA partnerships in Boracay residential pockets. Light FB ads.
- Phase 3 (m6+): Kalibo expansion via Caticlan port. FB ads scaled to Kalibo + 15km radius.

### Patterns we explicitly REJECTED

- **GenSan launch.** Considered. Rejected. Reasoning: Ken doesn't live there, requires hired city manager (₱45-60K/month), Ken cannot personally walk to providers and customers. Past chat made this call.
- **Davao or Cebu first.** Too contested (Cebu) or too expensive to crack (Davao). Phase 3 candidates only.
- **3+ cities at once.** This is the Homejoy mistake. We don't repeat it.
- **Boracay + GenSan dual launch.** A previous version of this strategy doc recommended this. It contradicts the April 16 decision and is no longer recommended. If Ken wants to revisit, that's his call — but the default path is the Kalibo/Iloilo one above.

### What to configure in admin once executing

Service-areas rows for Phase 03 seed data:

```sql
-- Boracay zones (active at launch)
INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status)
VALUES
  ('Boracay - Station 1', 'boracay-station-1', 'Malay', 'Aklan', 'Region VI', 11.9647, 121.9242, 1, 'recruiting'),
  ('Boracay - Station 2', 'boracay-station-2', 'Malay', 'Aklan', 'Region VI', 11.9694, 121.9244, 1, 'recruiting'),
  ('Boracay - Station 3', 'boracay-station-3', 'Malay', 'Aklan', 'Region VI', 11.9744, 121.9242, 1, 'recruiting');

-- Kalibo zones (planned active month 6)
INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status)
VALUES
  ('Kalibo - Poblacion', 'kalibo-poblacion', 'Kalibo', 'Aklan', 'Region VI', 11.7080, 122.3654, 4, 'planned'),
  ('Kalibo - Numancia', 'kalibo-numancia', 'Numancia', 'Aklan', 'Region VI', 11.7100, 122.3270, 4, 'planned'),
  ('Kalibo - Banga', 'kalibo-banga', 'Banga', 'Aklan', 'Region VI', 11.7000, 122.3500, 4, 'planned');

-- Iloilo zones (planned active month 12)
INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status)
VALUES
  ('Iloilo - City Proper', 'iloilo-city-proper', 'Iloilo City', 'Iloilo', 'Region VI', 10.7202, 122.5621, 5, 'planned'),
  ('Iloilo - Mandurriao', 'iloilo-mandurriao', 'Iloilo City', 'Iloilo', 'Region VI', 10.7100, 122.5400, 5, 'planned'),
  ('Iloilo - Pavia', 'iloilo-pavia', 'Pavia', 'Iloilo', 'Region VI', 10.7770, 122.5446, 5, 'planned');
```

Phase 03 covers the admin UI to manage this without SQL.

---

## Decision 3: Service mix

**The 5 services activated at launch:**

| # | Category | Subcategory anchors | Pricing model | Anchor for |
|---|---|---|---|---|
| 1 | Cleaning | Condo cleaning, House cleaning, Office cleaning, Move-in/out, Carpet, Sofa, Mattress | Fixed (with size + add-ons) | Repeat behavior (every 2-4 weeks) |
| 2 | AC / HVAC | Split aircon clean, Window aircon clean, Aircon repair, Aircon installation | Fixed per unit + quote for install | Repeat behavior (3-6 months per unit) |
| 3 | Plumbing | Leak repair, Drain unclogging, Faucet install, Toilet repair, Water heater install, Pipe replacement | Fixed for simple, quote for complex | High-ticket, cross-sell from cleaning |
| 4 | Electrical | Outlet install, Light fixture install, Ceiling fan install, Circuit breaker repair, Rewiring | Fixed for simple, quote for complex | High-ticket, cross-sell from cleaning |
| 5 | Painting | Single-room repaint, Full-house interior, Exterior, Specialty | Quote (always) | High-ticket, OFW remittance demand |

**The 9 categories with rows in DB but `is_active = false` at launch:**
- Pest control (Phase 2 — needs licensing in some areas)
- Moving (Phase 2 — different supply pool)
- Carpentry (Phase 2 — overlaps with handyman)
- Appliance repair (Phase 2 — parts dependency lowers economics)
- Lawn & Garden (Phase 2 — seasonal, harder in dense urban)
- Spa & Wellness (Phase 3 — different vertical, beauty)
- Laundry (Phase 3 — pickup/delivery model is different)
- Deep Cleaning (post-construction, move-in/out — actually subset of #1, may merge)
- Handyman (catch-all, rolled into #3-#5 initially)

These are admin-toggleable. Ken can activate any at any time.

---

## Decision 4: Provider sourcing

**Recommended primary pipelines:**

For Boracay (primary launch):
- **Hotel maintenance staff seeking side income** — many hotels have skilled techs with downtime
- **Existing CleanHub network** — your existing freelancer pool can extend
- **Caticlan-area providers** willing to ferry over for jobs
- **Aklan State University Banga campus** — vocational annex graduates in trades

For Kalibo (m6 expansion):
- **TESDA-accredited schools.** Aklan Catholic College and Kalibo Institute of Technology offer RAC NCII (aircon) and EIM (electrical). Numancia branches of TESDA also produce graduates.
- **Returning OFWs** with HVAC/electrical/plumbing certifications. Partner with OWWA Aklan office.
- **Existing skilled freelancers** found via FB groups: "Kalibo Aklan Skilled Workers", "Aklan Buy and Sell".

For Iloilo (m12 expansion):
- **TESDA Iloilo** — RAC NCII, EIM NCII, Plumbing NCII pipelines.
- **Iloilo State University of Fisheries and Technology (ISUFST)** — vocational graduates.
- **OWWA Iloilo** for returnees.
- **BPO maintenance staff** — Iloilo BPO sector has skilled trades on call who would pick up gig work.

**Provider compensation positioning:**

Skilled tech making ₱1,500-2,500/day on the platform earns 3-5x Aklan's non-agri minimum wage of ₱385/day. This is genuinely attractive. The platform's value vs FB-group informal: guaranteed payment within 24 hours, NBI verification, accident insurance, dispute support.

**Sign-on incentives:**
- ₱500 after first completed job
- ₱1,000 after 5th completed job
- ₱2,500 after 20th completed job
- Free starter kit: branded uniform, ID, tool bag, sample chemical (~₱800 cost)
- Annual accident insurance ~₱500-1,000/year per provider

---

## Decision 5: Pricing strategy

**Commission tiers (already in code):**

| Tier | Commission | Requirements |
|---|---|---|
| Founding | 10% | First 50 providers in each city, locked in for 12 months |
| New | 15% | Default for new sign-ups after founding cohort |
| Verified | 13% | 10+ jobs, 4.3+ rating, NBI clear |
| Pro | 11% | 50+ jobs, 4.5+ rating, no disputes in 30d |
| Elite | 9% | 150+ jobs, 4.7+ rating, TESDA cert |

**Service fee (already in code):** 10% of service price, min ₱25, max ₱500.

**Total platform take rate:**
- Founding tier on standard: ~20% of GMV
- New tier on standard: ~25% of GMV
- Pro tier on standard: ~21% of GMV
- Elite tier on standard: ~19% of GMV

This is in the Western marketplace ballpark and below the disintermediation threshold.

**Cancellation refund (matches FR-102):**
- >24h before: 100% / 0% (customer / provider)
- 2-24h: 100% / 0%
- 1-2h: 90% / 10%
- 30min-1h: 80% / 20%
- <30min: 70% / 30%
- Provider arrived: 50% / 50%
- Customer no-show: 0% / 100%

---

## Decision 6: B2B vs C2C balance

**Recommended split per city:**
- Boracay (m1+): 70% B2B (hotels, condotels, Airbnb operators) / 30% C2C (residents, expats)
- Kalibo (m6+): 50% B2B (Kalibo hotels + Boracay-bound transit lodging) / 50% C2C
- Iloilo (m12+): 40% B2B (BPO break rooms, Iloilo Business Park HOAs, hotels) / 60% C2C
- Aggregate by month 12: ~50% B2B / 50% C2C

**B2B sales targets at launch:**

Boracay (you sell, m1-3):
- 5 hotels with 50+ rooms (Henann group, Astoria, Discovery Shores, Boracay Mandarin, Movenpick)
- 10 condotels / Airbnb operators
- Each generates ₱20K-100K/month recurring AC + cleaning

Kalibo (city manager + you, m6-9):
- 3 hotels in Kalibo proper (Marzon, Sampaguita Suites, Hotel Soriente)
- 2-3 transit lodging operators (Caticlan side spillover)
- 4 HOAs in Kalibo growing residential pockets

Iloilo (city manager, m12-15):
- 4-5 hotels (Richmonde, Injap, Days Hotel, Park Inn)
- 2-3 BPO break-room cleaning contracts (Convergys, Teleperformance, IT Park firms)
- 5-7 HOAs in Iloilo Business Park, Mandurriao, Pavia subdivisions

---

## Decision 7: Insurance / SiguradoShield

**Recommended approach (3 layers):**

**Layer 1: Self-funded guarantee fund**
- 1.5% of every service fee → guarantee fund wallet
- Covers up to ₱25,000 per claim (property damage, incomplete work, theft)
- Funded from platform revenue, not customer payments
- This is already in code (`guarantee_fund` wallet type)

**Layer 2: Per-job opt-in protection (Igloo + Malayan)**
- Customer can opt in at checkout for ~₱25-50 extra
- Coverage up to ₱250,000 per claim
- Underwritten by Malayan Insurance, distributed by Igloo
- Requires partnership agreement + API integration (real work, ~6-8 weeks)
- This is NOT in code yet — it's in INSURANCE.md spec for post-launch

**Layer 3: Provider liability insurance (tiered)**
- Founding/New: optional
- Verified+: required (₱500K-1M coverage from Singlife or similar)
- Pro+: required (₱1M-3M coverage)
- Elite: required (₱3M+ coverage)
- Provider pays this; platform helps source via partner

---

## Decision 8: Fraud and dispute strategy

**Customer-facing promise:** "If anything goes wrong, we make it right within 48 hours."

**Operationally:**
- 24h auto-confirm on completed jobs (existing in code)
- 48h dispute window post-confirmation
- Tier 1 disputes (cosmetic, ≤₱500): auto-resolve based on rules, refund or no-refund
- Tier 2 disputes (₱500-5,000): admin review within 24h
- Tier 3 disputes (>₱5,000 or property damage): admin review within 4h, escalate to Ken if guarantee fund claim
- Tier 4 disputes (theft, injury, harassment): immediate response, police involvement if criminal

**Anti-fraud signals tracked:**
- Customer dispute rate: >2 disputes in 30 days flags for review
- Provider dispute loss rate: >30% loses tier
- Multi-account detection: same device, same payment method, multiple identities = flag
- Off-platform contact attempts: chat scanning for phone/email patterns (already partial in code)

---

## Decision 9: Marketing budget

**See `MARKETING-PLAYBOOK.md` for full breakdown.** Summary:

Self-funded path for Boracay primary launch:
- Months 1-2: ₱60K-100K/month (B2B sales-led: hotel/condotel outreach, light FB, D'Mall kiosk weekend)
- Months 3-4: ₱150-220K/month (FB ads scaled, e-trike wraps, ferry terminal poster, more HOA partnerships)
- Months 5-6: ₱220K/month Boracay + ₱30-100K Kalibo prep
- 6-month Boracay-only total: ~₱700K-1.2M
- Expected outcome: 1,200-1,800 paying customers in Boracay, 80-120 active providers

12-month full path (Boracay + Kalibo + Iloilo):
- Total: ₱4.0M-4.5M conservative across 3 cities
- Expected outcome: 4,000-7,000 cumulative paying customers, 250-400 active providers

Aggressive path (if external capital available):
- Same channels, ~3x spend
- 6-month total: ~₱4M-6M
- Expected outcome: 6,000-10,000 paying customers, 400-600 active providers

---

## Summary — what's settled and what Ken still decides

1. ✅ Multi-service launch (5 services activated, 9 inactive in admin until validated)
2. ✅ City pattern: **Boracay primary → Kalibo (m6) → Iloilo (m12)** (settled April 16)
3. ✅ 5 services already mapped (cleaning, AC, plumbing, electrical, painting)
4. ⬜ Provider sourcing partnerships started? (TESDA RAC NCII pipeline, OWWA returnees, FB recruitment in Aklan)
5. ✅ Pricing tiers locked in code (new/verified/pro/elite at 15/13/11/9%)
6. ⬜ Founding-tier (10% for first 50 providers per city) — strategic recommendation NOT YET in code. Phase 03 should add `founding` tier value to runtime config; otherwise drop the recommendation.
7. ⬜ B2B sales lead hired or assigned for Boracay hotel/condotel outreach?
8. ✅ SiguradoShield 3-layer architecture (Layer 1 ships at launch, Layers 2-3 partner-dependent)
9. ✅ Dispute tier framework (in code, verify in Phase 07 audit)
10. ⬜ Initial marketing budget committed for Boracay (₱700K-1.2M for first 6 months minimum)

The unchecked items are operational decisions Ken makes outside the codebase. Phase 04 onward proceeds regardless — they're for the launch readiness review in Phase 12.
