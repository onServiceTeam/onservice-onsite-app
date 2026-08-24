# PHILIPPINE HOME SERVICES MARKETPLACE — COMPLETE PLATFORM SPECIFICATION

> **HISTORICAL APRIL 2026 DESIGN INPUT, NOT CURRENT SOURCE OF TRUTH.** The app
> now has 113 catalogued mobile/admin surfaces and later decisions changed the
> launch market, fees, hourly pricing, payouts, payment readiness, guarantee
> language, and several workflows. In particular, do not implement or advertise
> this document's insurance/guarantee limits, payment-provider prices, revenue
> projections, or fixed operational policies. Current authority is `AGENTS.md`,
> active decisions/escalations, the operations handbook, and the current
> screen/linkage audit.

## Master Document v1.0 | April 14, 2026

**Prepared for:** Ken — onService
**Document Type:** Complete Business Architecture, Product Specification, UI/UX Blueprint, Regulatory Compliance Guide, and AI Coder Instruction Set
**Scope:** Every screen, every user story, every edge case, every payment flow, every admin feature, every regulation, every security measure

---

# TABLE OF CONTENTS

- Chapter 1: Business Model & Monetization Architecture
- Chapter 2: Complete User Stories for All User Types
- Chapter 3: Screen-by-Screen UI/UX Specification (55+ screens)
- Chapter 4: Philippine Regulatory & Legal Compliance
- Chapter 5: Payment Architecture Deep Dive
- Chapter 6: Admin Panel & Web Dashboard Complete Specification
- Chapter 7: Dispute Resolution, Arbitration, Insurance & Trust Systems
- Chapter 8: Service Category Bible (All Industries)
- Chapter 9: Security, Fraud Detection & Platform Integrity
- Chapter 10: Technical Architecture & AI Coder Instructions
- Appendix A: Google Stitch Design Audit (17 Screens)
- Appendix B: State Machine Diagrams
- Appendix C: Database Schema Reference
- Appendix D: API Endpoint Reference

---

# CHAPTER 1: BUSINESS MODEL & MONETIZATION ARCHITECTURE

## 1.1 Platform Identity & Value Proposition

### What This Platform Is
A Philippine-focused, mobile-first, on-demand home services marketplace that connects customers with vetted service providers (individual freelancers and registered companies) across all categories of residential and commercial on-site services. The platform owns the entire transaction — from discovery through payment through dispute resolution — and positions itself as the trusted intermediary that both sides need.

### What Makes This Different from GoodWork, Trabahero, and Others
1. **Full escrow on every transaction** — no cash option, ever. GoodWork still allows cash payments directly to providers, which means massive revenue leakage and zero buyer protection.
2. **Structured quoting system for variable-price jobs** — competitors either force fixed pricing (bad for complex jobs) or leave pricing entirely off-platform (bad for revenue capture). We do both: fixed pricing for standardized services AND a structured, in-app quoting system for custom work.
3. **Platform-backed buyer protection guarantee** — branded insurance/guarantee program that covers property damage, incomplete work, and theft. No Philippine competitor offers this.
4. **Provincial city launch strategy** — every competitor is in Metro Manila. We start in underserved cities where there's zero competition and massive unmet demand.
5. **Pro-customer dispute resolution** — the platform defaults to siding with the customer when evidence is ambiguous. This builds trust and word-of-mouth faster than anything else.

### Core Value Proposition by User Type

**For Customers:**
- "Book trusted, verified professionals for any home service — cleaning, plumbing, electrical, painting, pest control, moving, and more — with guaranteed pricing, secure escrow payment, and full buyer protection. If anything goes wrong, we make it right."

**For Service Providers (Freelancers):**
- "Get a steady stream of paying customers without marketing costs. Set your own availability, build your reputation, get paid on time every time through GCash or Maya. No more chasing clients for payment."

**For Service Providers (Companies):**
- "Expand your customer base without advertising spend. Manage your team through the app, handle scheduling and invoicing automatically, and grow your brand with verified reviews."

---

## 1.2 Revenue Model — The Complete Architecture

### Primary Revenue Stream: Hybrid Commission + Service Fee

The platform earns revenue on EVERY transaction from BOTH sides:

**Customer Side — Service Fee:**
- Added on top of the service price, clearly displayed before checkout
- 8-10% for standard catalog services (cleaning, laundry, basic maintenance)
- 10-12% for custom-quoted services (plumbing, electrical, painting, renovations)
- The service fee covers: platform operations, buyer protection guarantee fund, payment processing, customer support
- Displayed as a single line item: "Platform Service Fee" — never hidden

**Provider Side — Commission:**
- Deducted from the service price before payout
- 12-15% for New and Verified tier providers
- 10-12% for Pro tier providers (25+ completed jobs, 4.5+ rating)
- 8-10% for Elite tier providers (100+ completed jobs, 4.7+ rating)
- Commission decreases as providers prove loyalty and quality — this is the single most important anti-disintermediation incentive

**Total Platform Take Rate (combined customer + provider fees):**
- Standard services: 20-25% of gross transaction value
- Custom/quoted services: 18-22% of gross transaction value
- This is within the industry-standard range and below the threshold where disintermediation becomes attractive

### Revenue Example Table

| Scenario | Service Price | Customer Pays (incl. 10% fee) | Provider Receives (after 12% commission) | Platform Revenue | Take Rate |
|----------|--------------|-------------------------------|------------------------------------------|-----------------|-----------|
| Condo cleaning (fixed) | ₱500 | ₱550 | ₱440 | ₱110 | 20.0% |
| Deep house cleaning (fixed) | ₱1,500 | ₱1,650 | ₱1,320 | ₱330 | 20.0% |
| AC repair (quoted) | ₱3,000 | ₱3,300 | ₱2,640 | ₱660 | 20.0% |
| Bathroom renovation (quoted) | ₱25,000 | ₱27,500 | ₱22,000 | ₱5,500 | 20.0% |
| Full house painting (quoted) | ₱50,000 | ₱55,000 | ₱45,000 | ₱10,000 | 18.2% |

Note: For high-value jobs (>₱10,000), consider a sliding commission scale: provider commission drops to 10% to keep the total take rate under 20%. This reduces the incentive for providers to negotiate off-platform on big jobs, which is where leakage risk is highest.

### Secondary Revenue Streams (Phase 2, Month 6+)

**1. Featured Listings / Boost**
- Providers pay ₱200-₱1,000/month to appear at the top of search results in their service category
- Equivalent to "promoted" listings on Shopee or Lazada
- Must maintain 4.0+ rating to be eligible
- Revenue potential: ₱50,000-₱200,000/month at 200+ providers

**2. Provider Subscription Tiers**
- Free tier: standard visibility, standard commission
- Pro Plan (₱499/month): lower commission (-2%), priority in matching, analytics dashboard, featured badge
- Business Plan (₱1,499/month): lowest commission (-4%), dedicated account manager, team management tools, branded profile page
- Revenue potential: ₱100,000-₱500,000/month at scale

**3. Materials Sourcing Markup**
- For jobs requiring materials (paint, plumbing parts, tiles, electrical components), the platform can offer to source materials through partner hardware stores
- Customer pays a convenience premium (10-15% markup)
- Platform earns the markup minus wholesale cost
- This also keeps the FULL transaction value on-platform (providers can't say "just pay me for the materials separately")

**4. Advertising / Sponsored Content**
- Brand partnerships: paint companies, cleaning supply brands, tool manufacturers
- In-app recommendations: "This job uses Boysen Paint — Philippines' #1" 
- Sponsored service bundles: "Move-in Package powered by [Brand]"
- Revenue potential: ₱50,000-₱300,000/month at scale

**5. B2B / Commercial Tier**
- Offices, condo management companies, restaurants, hotels
- Recurring contracts with volume discounts
- Dedicated account manager
- Monthly invoicing instead of per-job payment
- Higher average job values, lower churn

**6. Emergency / Rush Surcharge**
- Customers who need same-day or next-hour service pay a 25-50% surge premium
- Platform takes the standard commission + 50% of the surge amount
- Provider receives their standard rate + 50% of the surge amount
- Both sides benefit from urgency pricing

---

## 1.3 Escrow System — The Backbone of Everything

### Why Escrow Is Non-Negotiable

Every single peso must flow through the platform. This is not optional. Without escrow:
- You cannot prevent off-platform payments
- You cannot offer buyer protection
- You cannot guarantee provider payment
- You cannot take commission
- You cannot measure GMV (gross merchandise value)
- You have no business

### How Escrow Works — Complete Flow

**Step 1: Customer Books + Pays**
- Customer selects a service (fixed or quoted price)
- Customer sees total: Service Price + Service Fee = Total
- Customer pays via GCash, Maya, card, or QR Ph
- Payment goes to the PLATFORM'S PayMongo account, NOT directly to the provider
- Status: ESCROW_HELD

**Step 2: Provider Performs the Service**
- Provider sees the job in their queue with guaranteed payment amount
- Provider travels to location, performs service
- Provider uploads completion photos (required for jobs >₱1,000)
- Provider marks job as "Completed" in the app
- Status: PENDING_CONFIRMATION

**Step 3: Customer Confirms**
- Customer receives notification: "Your service is marked as complete. Please confirm."
- Customer has 24 hours to confirm or dispute
- If customer confirms → Status: ESCROW_RELEASED
- If customer disputes → Status: ESCROW_DISPUTED (see Chapter 7)
- If customer does nothing after 24 hours → AUTO-CONFIRM, Status: ESCROW_RELEASED

**Step 4: Provider Gets Paid**
- Once escrow is released, provider's wallet balance increases by (Service Price - Commission)
- Provider can withdraw to GCash, Maya, or bank account at any time
- Minimum withdrawal: ₱100
- No withdrawal fees (platform absorbs this as cost of business)
- Typical withdrawal processing: instant for GCash/Maya, 1-2 business days for bank

### Escrow State Machine

```
UNPAID → ESCROW_HELD → PENDING_CONFIRMATION → ESCROW_RELEASED → PAYOUT_PROCESSING → PAID_OUT
                                ↓
                        ESCROW_DISPUTED → PARTIAL_REFUND / FULL_REFUND / RELEASED_TO_PROVIDER
                                ↓
                        ESCROW_ESCALATED (admin review)
```

### Edge Cases for Escrow

**Edge Case 1: Provider No-Show**
- If provider doesn't check in at the job location within 30 minutes of scheduled time, customer can cancel
- Full refund to customer from escrow
- Provider receives a strike (3 strikes = suspension)

**Edge Case 2: Customer Cancellation (Before Provider Arrives)**
- More than 2 hours before scheduled time: full refund, no penalty
- Less than 2 hours before: 80% refund, 20% goes to provider as cancellation fee
- After provider has arrived: 50% refund, 50% goes to provider

**Edge Case 3: Customer Cancellation (During Service)**
- If customer cancels mid-service, provider must document work completed with photos
- Platform mediator determines fair split based on percentage of work completed
- Provider receives proportional payment for work done

**Edge Case 4: Scope Change Mid-Job**
- Provider discovers additional work needed (e.g., plumber finds a second leak)
- Provider submits "Change Order" through the app with description, photos, and additional cost
- Customer receives notification and must approve before additional work begins
- If approved, customer's payment method is charged the additional amount → goes into escrow
- If declined, provider completes only the original scope

**Edge Case 5: Materials Required**
- For quoted jobs that include materials cost, the quote breaks down: Labor (₱X) + Materials (₱Y) = Total
- Customer pays the full amount into escrow
- Provider purchases materials (with their own money or using a platform materials advance)
- Provider uploads receipts for materials
- If actual materials cost is less than quoted, the difference is refunded to customer
- If actual materials cost is more than quoted, provider submits a change order

**Edge Case 6: Multi-Day Jobs**
- For large jobs spanning multiple days (renovation, full house painting):
- Payment is split into milestones: 40% upfront (after day 1), 30% after midpoint inspection, 30% upon completion
- Each milestone has its own escrow → confirm → release cycle
- Customer must confirm each milestone before the next payment is released
- This prevents scenarios where a provider has ₱50,000 of customer money and disappears mid-job

**Edge Case 7: Recurring/Subscription Services**
- Customer sets up recurring service (e.g., weekly cleaning every Saturday at 10 AM)
- Payment is charged automatically each week into escrow
- If provider is unavailable, platform auto-matches a substitute provider
- Customer can cancel recurring service with 24 hours notice
- No long-term contract required

**Edge Case 8: Refund After Payout**
- If a dispute is filed AFTER the provider has already been paid out:
- Platform attempts to recover from provider's wallet balance
- If wallet balance is insufficient, platform covers the refund from the guarantee fund
- Provider's account is flagged; future payouts are held until the balance is settled
- Repeated refund-after-payout incidents result in account termination

---

## 1.4 Anti-Disintermediation — The Complete Arsenal

### Understanding the Threat

Research from Harvard Business School, Wharton, and real-world platform data shows:
- On freelancing platforms, up to 90% of transactions involve some disintermediation after initial match
- The #1 driver is high commission rates (>20% total)
- The #2 driver is repeat relationships — after one good experience, both sides want to go direct
- The #3 driver is the platform providing no value after the initial match

Home services marketplaces are EXTREMELY vulnerable because:
- The provider physically goes to the customer's home — exchanging phone numbers is trivial
- Services are often recurring (weekly cleaning, quarterly pest control)
- The customer-provider relationship naturally becomes personal
- Filipino culture values "suki" (loyal patronage) relationships

### Strategy 1: Make Commission Worth Paying (VALUE)

**For Providers — The SaaS Value Stack:**
The platform must become an indispensable business tool, not just a lead source.

What providers get that they lose if they go off-platform:
1. **Guaranteed payment** — money in wallet within 24 hours of job completion, withdrawable to GCash instantly. Off-platform, they chase customers for payment, deal with "I'll pay you later," and risk being stiffed entirely.
2. **Scheduling system** — calendar management, availability settings, automated reminders, conflict detection. Off-platform, they manage this in their head or on paper.
3. **Customer acquisition** — new customers find them through the app. Off-platform, they spend money on Facebook ads or word-of-mouth.
4. **Professional profile** — verified badge, ratings, reviews, portfolio. Off-platform, they have a Facebook page with 12 likes.
5. **Invoicing and receipts** — automatic invoices, payment records, BIR-compliant records. Off-platform, they handwrite receipts or don't bother.
6. **Dispute protection** — if a customer makes a false claim, the platform mediates. Off-platform, they're on their own.
7. **Business analytics** — earnings trends, popular services, customer demographics. Off-platform, nothing.
8. **Insurance/guarantee coverage** — if they accidentally damage property, the platform's guarantee covers it. Off-platform, they're personally liable.

**For Customers — The Trust Stack:**
What customers get that they lose if they go off-platform:
1. **Buyer protection guarantee** — if something goes wrong, the platform makes it right. Off-platform, they have no recourse.
2. **Verified providers** — NBI-cleared, ID-verified, rated by other customers. Off-platform, they're trusting a stranger.
3. **Escrow security** — money is held until they confirm the job is done right. Off-platform, they pay upfront and hope for the best.
4. **Easy rebooking** — one tap to rebook the same provider or try someone new. Off-platform, they dig through their phone contacts.
5. **Dispute resolution** — a neutral third party handles complaints. Off-platform, they argue directly with the provider.
6. **Paper trail** — complete record of every job, every payment, every communication. Off-platform, nothing.

### Strategy 2: Tiered Commission (INCENTIVE)

Providers who stay loyal to the platform get rewarded with lower commission rates. This directly addresses the #1 driver of disintermediation.

| Tier | Requirements | Commission Rate | Monthly Jobs via App |
|------|-------------|-----------------|---------------------|
| New | Just onboarded | 15% | 0-4 |
| Verified | 5+ jobs, 4.0+ rating, ID verified | 13% | 5-14 |
| Pro | 25+ jobs, 4.5+ rating, zero disputes | 11% | 15-29 |
| Elite | 100+ jobs, 4.7+ rating, TESDA certified | 9% | 30+ |

An Elite provider keeping ₱20,000/month on-platform pays ₱1,800 in commission (9%). The same provider going off-platform saves ₱1,800 but loses: guaranteed payment, scheduling tools, new customer acquisition, insurance coverage, reputation/reviews, and dispute protection. The math doesn't work for going off-platform once they're at Pro or Elite tier.

### Strategy 3: Communication Control (FRICTION)

- All messaging happens in-app before and during the job
- Phone numbers are masked using a relay system (like Grab/Uber) — customer calls a platform number that forwards to provider's real number. Neither side sees the other's actual phone number.
- After job completion, the masked number expires. Customer can only contact the provider again by rebooking through the app.
- In-app messaging scans for patterns: phone numbers, email addresses, Viber/Messenger/Telegram links, GCash numbers. If detected, a gentle warning is shown: "Sharing contact information directly may void your buyer protection coverage."
- This is NOT aggressive blocking. The message is educational, not punitive. The goal is to remind them of what they lose.

### Strategy 4: The "Suki" Loyalty Program (CULTURAL)

Built around the Filipino concept of "suki" — a loyal, preferred vendor relationship.

**How it works:**
- After 3 completed jobs with the same provider, the customer automatically earns "Suki" status with that provider
- Suki benefits for the customer:
  - 5% automatic discount on future bookings with that provider
  - Priority scheduling (provider's calendar shows preferred slots for Sukis first)
  - Free minor add-ons (e.g., free bathroom touch-up with house cleaning)
- Suki benefits for the provider:
  - Higher visibility in search when Sukis are browsing
  - "Trusted Pro" badge visible to all customers
  - 1% commission reduction for each Suki customer (up to 3% reduction)
  - Access to "Suki Blast" — bulk notification to all their Suki customers when they have availability

**Why this works as anti-disintermediation:**
The loyalty benefits ONLY exist on the platform. If the customer goes direct, they lose their Suki discounts. If the provider goes direct, they lose the Suki system that keeps customers coming back.

### Strategy 5: Buyer Protection as Marketing Moat (INSURANCE)

The platform guarantee is the SINGLE most powerful anti-disintermediation tool.

**The marketing message is simple:**
"Every booking is protected by SiguradoShield™. If your provider doesn't show up, does incomplete work, or damages your property, you're covered for up to ₱50,000. Book directly? You're on your own."

This message appears:
- On the booking confirmation screen
- In every receipt/invoice
- In the post-job confirmation flow
- In all marketing materials
- On the provider's profile ("Bookings through [App Name] include SiguradoShield™ protection")

### Strategy 6: Non-Circumvention Enforcement (CONTRACTUAL)

**Provider Agreement includes:**
- Non-circumvention clause: provider agrees not to solicit off-platform transactions with customers matched through the platform for 12 months
- If caught: first offense = warning + 30-day commission surcharge (2% increase). Second offense = 90-day suspension. Third offense = permanent ban.
- Detection methods (see Chapter 9): message scanning, unusual booking patterns, customer reports

**Customer Terms of Service include:**
- "Transactions conducted outside the platform are not covered by SiguradoShield™ buyer protection"
- "For your safety, we recommend keeping all communications on-platform"
- No punishment for customers — the deterrent is loss of protection, not penalties

---

## 1.5 Pricing Architecture — The Three Tiers

### Tier 1: Fixed-Price Catalog Services

These are standardized jobs with predictable scope, time, and cost. The platform sets the prices centrally (with provider input). Customers see a clear, all-in price.

**How prices are set:**
1. Research competitor pricing (GoodWork, local Facebook groups, Google)
2. Survey providers in the area for their typical rates
3. Set platform price at the market median
4. Test and adjust based on booking volume and provider availability

**Price includes:**
- Provider labor
- Basic consumables (cleaning agents, basic supplies)
- Platform service fee (already included in the displayed price)

**Does NOT include (priced as add-ons):**
- Special materials or equipment
- Extra rooms, areas, or complexity
- Rush/same-day surcharge

**Example catalog for a municipality launch:**

| Service | Description | Base Price (₱) | Duration | Add-ons |
|---------|-------------|----------------|----------|---------|
| Studio condo cleaning | Bedroom, bathroom, kitchen, living area | 449 | 2 hours | Extra bathroom +₱150 |
| 1-BR apartment cleaning | 1 bedroom + common areas | 649 | 3 hours | Balcony +₱100, extra bathroom +₱150 |
| 2-BR house cleaning | 2 bedrooms + common areas | 899 | 4 hours | Per extra room +₱200 |
| 3-BR house cleaning | 3 bedrooms + common areas | 1,149 | 5 hours | Per extra room +₱200 |
| Deep clean (any size) | Move-in/move-out grade | Base × 1.5 | Base × 1.5 | Windows +₱300, oven +₱200 |
| Mattress deep clean (single) | Steam clean + sanitize | 500 | 1 hour | Queen +₱200, King +₱300 |
| Mattress deep clean (queen) | Steam clean + sanitize | 700 | 1.5 hours | |
| Carpet cleaning (per sqm) | Shampoo + extraction | 80/sqm | Varies | Stain treatment +₱50/stain |
| Sofa/couch cleaning (3-seater) | Shampoo + extraction | 600 | 1 hour | Per extra seat +₱150 |
| Aircon cleaning (window) | Disassemble, clean, reassemble | 600 | 1 hour | |
| Aircon cleaning (split type) | Indoor + outdoor unit | 800 | 1.5 hours | |
| Laundry pickup + delivery | Wash, dry, fold, deliver | 35/kg | 2-3 days | Rush (next day) +50% |
| Fan cleaning (stand/wall) | Disassemble, clean, reassemble | 250 | 30 min | |
| Fan cleaning (ceiling) | On-site cleaning | 400 | 45 min | |
| Pest control (apartment) | General spray treatment | 1,500 | 1 hour | Termite treatment +₱2,000 |
| Pest control (house) | General spray treatment | 2,500 | 2 hours | Per extra 50sqm +₱500 |
| Lawn mowing (small yard) | Mow + trim edges | 400 | 1 hour | Hedge trimming +₱300 |

### Tier 2: Menu-Based Services with Configurator

These services have a base price but vary by scope. The app presents a step-by-step configurator.

**Example: House Painting Configurator**

Step 1: Type
- Interior walls only
- Exterior walls only
- Both interior and exterior

Step 2: Rooms (multi-select + quantity)
- Living room (1)
- Bedroom (quantity: __)
- Bathroom (quantity: __)
- Kitchen (1)
- Hallway (quantity: __)

Step 3: Special Surfaces
- Ceiling (per room): +₱500
- Wood trim/molding: +₱200/room
- Metal gates/grills: +₱1,000

Step 4: Paint
- Customer provides paint: ₱0
- Platform sources paint (standard): per sqm rate
- Platform sources paint (premium): per sqm rate

Step 5: Current Wall Condition
- Good condition (just repainting): base rate
- Minor patches needed: +15%
- Major prep work needed (peeling, water damage): +30%

The configurator calculates a price range (e.g., ₱12,000-₱15,000) and the customer submits the job. Matched providers review and submit a final quote within the range (or outside the range with explanation).

### Tier 3: Custom Quote Services

These require provider assessment before any pricing. The app facilitates a structured quoting process.

**Services in this tier:**
- Plumbing repairs (scope unknown until inspection)
- Electrical work (rewiring, panel upgrades)
- Appliance repair (diagnosis needed first)
- Renovation work (kitchen, bathroom, room additions)
- Tiling, waterproofing, structural repairs
- Custom carpentry/woodwork
- Full commercial cleaning (offices, restaurants)

**The Custom Quote Flow:**

1. **Customer submits Job Request:**
   - Service category (dropdown)
   - Description (text, min 50 characters)
   - Photos (required, min 2, max 10)
   - Video (optional, max 60 seconds)
   - Location (auto-detected or manually entered)
   - Urgency: Same-day / Within 3 days / Within a week / Flexible
   - Budget range (optional): helps providers know what's realistic

2. **Platform broadcasts to matched providers:**
   - Providers within the service area and category receive notification
   - Maximum 5 providers can quote per job (prevents over-competition)
   - Providers have 4 hours to submit a quote (same-day urgency) or 24 hours (standard)

3. **Provider submits Structured Quote:**
   - Line items (labor, materials, equipment rental)
   - Each line item has: description, quantity, unit price, total
   - Estimated timeline (start date, duration, completion date)
   - Terms/conditions (any special requirements)
   - Provider can include photos of similar past work
   - Provider can request a diagnostic visit (paid, ₱200-₱500)

4. **Customer reviews and compares quotes:**
   - Side-by-side comparison view showing all quotes
   - Each provider's rating, completed jobs, specialties visible
   - Customer can ask questions to any quoting provider via in-app chat
   - Customer selects a provider and approves the quote

5. **Payment and escrow:**
   - Customer pays the approved quote amount + service fee into escrow
   - For jobs >₱10,000: milestone-based payment option available
   - For diagnostic visits: diagnostic fee is charged separately and non-refundable

---

# CHAPTER 2: COMPLETE USER STORIES FOR ALL USER TYPES

## 2.1 User Types Overview

The platform has 7 distinct user types, each with different interfaces, permissions, and workflows:

1. **Customer** — the person booking services
2. **Provider (Freelancer)** — individual service professional
3. **Provider (Company)** — registered business with team members
4. **Admin (Super Admin)** — platform owner/operator (you, Ken)
5. **Support Agent** — customer/provider support staff
6. **Finance Staff** — handles payouts, refunds, financial reports
7. **Moderator/Arbitrator** — handles disputes and content moderation

---

## 2.2 Customer User Stories — Complete Set

### 2.2.1 Onboarding & Account

**US-C001: Customer Registration**
- AS A new user, I WANT TO create an account using my phone number SO THAT I can book services
- Flow: Open app → "Sign Up" → Enter mobile number → Receive OTP via SMS → Enter OTP → Set display name → Set service address (map picker) → Optional: add email, link GCash/Maya → Account created
- Edge cases: Invalid phone number, OTP timeout (resend after 60 seconds), duplicate phone number ("This number is already registered"), no internet connection
- Acceptance criteria: Account is created, phone is verified, user lands on home dashboard

**US-C002: Customer Login**
- AS A returning user, I WANT TO log in using my phone number and OTP SO THAT I can access my account
- Flow: Open app → "Log In" → Enter phone number → Receive OTP → Enter OTP → Home dashboard
- Edge cases: Account not found, OTP expired, account suspended, new device (show security notification)

**US-C003: Customer Profile Management**
- AS A customer, I WANT TO manage my profile SO THAT my information is accurate
- Editable fields: Display name, email, phone number (requires re-verification), profile photo, saved addresses (home, work, other), preferred payment method, notification preferences
- Edge cases: Changing phone number requires OTP on both old and new number, deleting account requires 30-day cooling period

**US-C004: Customer Saved Addresses**
- AS A customer, I WANT TO save multiple addresses SO THAT I can quickly book services at different locations
- Saved address includes: Label (Home/Work/Custom), full address, floor/unit number, special instructions ("Gate code is 1234", "Use the side entrance"), GPS coordinates (auto or manual pin)
- Edge cases: Address outside service area (show "We're not available in this area yet — we'll notify you when we expand"), invalid address, maximum 10 saved addresses

**US-C005: Customer Payment Methods**
- AS A customer, I WANT TO save my payment methods SO THAT checkout is fast
- Supported methods: GCash (linked via OAuth), Maya (linked via OAuth), Credit/Debit card (Visa, Mastercard via PayMongo tokenization), QR Ph (generated per transaction), Over-the-counter (7-Eleven, Cebuana, M Lhuillier — available for prepaid balance top-up only)
- Edge cases: GCash linking failure (retry with manual GCash number), expired card, insufficient balance (show real-time balance check for GCash/Maya before confirming), payment method removal (cannot remove if there's an active booking using it)

### 2.2.2 Browsing & Discovery

**US-C006: Browse Service Categories**
- AS A customer, I WANT TO browse all available service categories SO THAT I can find what I need
- Categories displayed as icon grid (similar to Grab/GoJek home screen)
- Primary categories: Cleaning, Plumbing, Electrical, Painting, HVAC/Aircon, Pest Control, Moving, Carpentry, Appliance Repair, Lawn/Garden, Spa/Wellness, Laundry, Deep Cleaning, Handyman (catch-all)
- Each category opens to subcategories (e.g., Cleaning → Condo Cleaning, House Cleaning, Office Cleaning, Move-in/Move-out Cleaning, Carpet Cleaning, Sofa Cleaning, Mattress Cleaning)

**US-C007: Search for Services**
- AS A customer, I WANT TO search by keyword SO THAT I can quickly find a specific service
- Search bar at top of home screen
- Searches across: service names, categories, provider names, keywords
- Auto-complete suggestions as user types
- Recent searches shown when search is focused
- Edge cases: No results (show "No services match '[query]'. Try: [suggested alternatives]"), typo correction

**US-C008: View Provider Profiles**
- AS A customer, I WANT TO view a provider's full profile SO THAT I can assess their quality
- Profile shows: Name, photo, verified badge, rating (overall + per category), total completed jobs, years on platform, services offered, service area, availability calendar, portfolio photos (past work), reviews (with photos), response time, "Suki" count, TESDA certifications (if any)
- Edge cases: New provider with no reviews (show "New on [Platform]" badge), provider with reviews in a different category than what customer is looking for

**US-C009: Filter and Sort Providers**
- AS A customer, I WANT TO filter providers SO THAT I find the best match
- Filters: Rating (4.0+, 4.5+, 4.8+), Price range, Availability (today, this week, specific date), Distance, Verified/Pro/Elite badge, Service-specific (e.g., "has equipment for deep cleaning")
- Sort: Recommended (platform algorithm), Price (low to high), Rating (high to low), Distance (nearest), Most jobs completed

### 2.2.3 Booking — Fixed-Price Services

**US-C010: Book a Fixed-Price Service**
- AS A customer, I WANT TO book a standard service at a fixed price SO THAT I know exactly what I'm paying
- Flow: Select category → Select service → Choose options/add-ons → Select address → Select date and time → See price breakdown → Select payment method → Confirm → Pay into escrow → Booking confirmed
- Price breakdown shows: Base price, add-ons, service fee, total
- Edge cases: No providers available for selected date/time (suggest alternative slots), address outside service area, payment failure (retry with different method), double-booking prevention (same address, same time = warning)

**US-C011: Book a Recurring Service**
- AS A customer, I WANT TO set up a recurring booking SO THAT my regular cleaning/maintenance is automated
- Flow: Complete first booking → On confirmation screen, offer "Make this recurring?" → Select frequency (weekly, bi-weekly, monthly) → Select preferred day and time → Confirm recurring setup → Auto-charges each period
- Edge cases: Provider unavailable for a specific instance (platform auto-substitutes), customer wants to skip one instance (skip without canceling the whole subscription), price change (notify customer 7 days in advance), payment failure on auto-charge (retry once, then notify customer)

### 2.2.4 Booking — Custom Quote Services

**US-C012: Submit a Custom Job Request**
- AS A customer, I WANT TO describe a custom job and get quotes SO THAT I can find the right provider at the right price
- Flow: Select category → "Request Custom Quote" → Describe problem (text) → Upload photos/video → Set location → Set urgency → Set budget range (optional) → Submit → Wait for quotes
- Validation: Description minimum 50 characters, at least 2 photos required, location must be within service area
- Edge cases: No providers quote within the time window (notify customer, suggest broadening criteria), all quotes exceed budget range (show quotes anyway with note about budget mismatch)

**US-C013: Compare and Select Quotes**
- AS A customer, I WANT TO compare multiple provider quotes side-by-side SO THAT I can choose the best option
- Comparison view shows: Provider name/rating/photo, total quoted price, itemized breakdown, estimated timeline, number of similar past jobs, sample photos of past work
- Customer can: Chat with quoting providers, request quote revision, accept a quote, decline all quotes
- Edge cases: Provider withdraws quote before customer decides, quote expires after 48 hours (auto-withdraw), customer wants to negotiate price (in-app chat only)

**US-C014: Approve a Change Order**
- AS A customer with an active job, I WANT TO review and approve additional work SO THAT scope changes are handled transparently
- Notification: "Your provider [Name] has requested additional work on Job #[ID]"
- Change order shows: Description of additional work, photos, additional cost, new estimated timeline
- Customer can: Approve (additional funds charged to escrow), Decline (provider completes only original scope), Ask questions (in-app chat)
- Edge cases: Customer doesn't respond for 24 hours (provider can escalate to support), change order exceeds 50% of original quote (requires admin approval before proceeding)

### 2.2.5 During Service

**US-C015: Track Provider En Route**
- AS A customer, I WANT TO see my provider's location in real-time SO THAT I know when they'll arrive
- Map view with provider's live location (updated every 10 seconds)
- ETA display
- Masked phone call button (calls provider through platform relay)
- In-app chat button
- Edge cases: Provider GPS is off (prompt provider to enable), provider is stuck in traffic (auto-update ETA), provider is heading wrong direction (alert provider)

**US-C016: Communicate During Service**
- AS A customer, I WANT TO message my provider during the job SO THAT I can provide instructions or feedback
- In-app chat with text + photo + voice message
- Chat history preserved for dispute resolution
- Edge cases: Customer wants to add something to the scope while provider is working (must go through change order flow, not informal chat agreement)

### 2.2.6 Post-Service

**US-C017: Confirm Job Completion**
- AS A customer, I WANT TO confirm that the job was done satisfactorily SO THAT the provider gets paid
- Notification: "Is your [Service] complete and satisfactory?"
- Options: "Yes, looks great!" → Escrow released, proceed to rating. "Something's not right" → Opens dispute flow (Chapter 7)
- Auto-confirm after 24 hours if no response
- Edge cases: Customer accidentally confirms but wants to dispute later (can file dispute within 48 hours of completion even after confirming)

**US-C018: Rate and Review Provider**
- AS A customer, I WANT TO rate and review my provider SO THAT other customers can benefit
- Rating: 1-5 stars (required)
- Subcategories: Quality of work, Punctuality, Professionalism, Communication, Value for money
- Written review: optional, min 20 characters if provided
- Photo upload: optional, max 5 photos of completed work
- Edge cases: Customer tries to leave a review with profanity/personal attacks (auto-flagged, held for moderation), customer tries to edit review after 7 days (locked), provider responds to review (visible to all)

**US-C019: Tip Provider**
- AS A customer, I WANT TO tip my provider SO THAT I can show appreciation
- Tip screen shown after rating (never before)
- Preset options: 10%, 15%, 20%, Custom amount
- "100% goes to the provider" displayed prominently
- No platform commission on tips
- Payment charged to the same method used for the booking
- Edge cases: Customer wants to tip in cash (discouraged but not blocked — show message "Tips through the app ensure your provider gets full credit"), tip amount exceeds booking amount (cap at 100% of booking amount)

**US-C020: File a Dispute**
- AS A customer, I WANT TO file a complaint about a service SO THAT I can get resolution
- See Chapter 7 for complete dispute resolution system

**US-C021: Rebook a Provider**
- AS A customer, I WANT TO easily rebook a provider I've used before SO THAT I don't have to search again
- "Quick Re-book" section on home screen showing recent providers
- One-tap rebook with same service, address, and payment method
- Option to change date/time
- Edge cases: Provider is no longer active, provider is fully booked, service price has changed since last booking (show new price with note)

### 2.2.7 Account & Financial

**US-C022: View Booking History**
- AS A customer, I WANT TO see all my past bookings SO THAT I can track my service history
- List view: date, service type, provider name, amount paid, status, rating given
- Filterable by: date range, service category, provider, status
- Tap any booking to see full details including receipt, chat history, photos

**US-C023: View and Download Receipts**
- AS A customer, I WANT TO download receipts SO THAT I can expense or file them
- Receipt shows: Booking ID, date, service description, provider name, itemized pricing, payment method, platform service fee, total, BIR-compliant format
- Downloadable as PDF
- Edge cases: Receipt for disputed/refunded booking (shows original amount + refund details)

**US-C024: Manage Wallet (Customer Wallet)**
- AS A customer, I WANT TO maintain a platform wallet balance SO THAT I can pay faster
- Top up via: GCash, Maya, card, over-the-counter
- Use wallet balance for bookings (selected as payment method at checkout)
- Wallet earns loyalty points on top-up (₱1 = 1 point, 100 points = ₱1 discount)
- Edge cases: Refund goes to wallet by default (customer can request refund to original payment method), wallet balance expiry (12 months of inactivity)

**US-C025: Referral Program**
- AS A customer, I WANT TO refer friends SO THAT we both get discounts
- Unique referral code per customer
- Referred friend gets ₱100 off first booking
- Referrer gets ₱100 credit when referred friend completes first booking
- Shareable via: WhatsApp, SMS, Messenger, Facebook, copy link
- Edge cases: Self-referral detection (same device, same address), referral code abuse (cap at 20 referrals per customer)

---

## 2.3 Provider (Freelancer) User Stories — Complete Set

### 2.3.1 Onboarding & Verification

**US-P001: Provider Registration**
- AS A new provider, I WANT TO create a provider account SO THAT I can start getting jobs
- Flow: Download app → "Register as Provider" → Enter mobile number → OTP → Basic info (name, email, address) → Select service categories (multi-select) → Select service area (map with radius) → Upload government ID → Upload NBI clearance → Upload selfie (for ID matching) → Agree to terms → Submit for review
- Status after submission: "Application Pending" — provider cannot accept jobs until approved
- Estimated review time: 24-48 hours
- Edge cases: Invalid/expired ID, NBI clearance older than 6 months (rejected with reason), selfie doesn't match ID (rejected), duplicate application (same phone number or ID number)

**US-P002: Provider Verification Flow**
- AS A provider applicant, I WANT TO track my verification status SO THAT I know when I can start working
- Verification steps (shown as progress bar):
  1. Phone verified ✓
  2. Government ID uploaded → Under review
  3. NBI clearance uploaded → Under review
  4. Profile completed → Under review
  5. Admin approved → Account active
- If any step fails: clear explanation of why + how to fix
- Edge cases: Admin requests additional documents (e.g., TESDA certificate for electrical), admin requests video interview (for certain high-risk categories)

**US-P003: Provider Profile Setup**
- AS a newly approved provider, I WANT TO complete my profile SO THAT customers can find and trust me
- Profile fields: Display name, professional photo, bio/description, services offered (from catalog), pricing (for services where provider sets price), service area (map + radius), working hours/availability, portfolio photos (past work), certifications/training, years of experience, equipment owned (for relevant services)
- Edge cases: Provider wants to offer a service not in the catalog (can request addition via support), provider sets prices significantly above or below market (platform shows guidance range)

### 2.3.2 Receiving and Managing Jobs

**US-P004: Receive Job Notification**
- AS A provider, I WANT TO be notified of new job opportunities SO THAT I can accept and earn money
- Notification types: Push notification, in-app alert, SMS (for providers with poor internet)
- Notification shows: Service type, price, location (approximate), date/time, customer rating
- Time to respond: 45 seconds for fixed-price auto-match, 4-24 hours for custom quote requests
- Edge cases: Multiple simultaneous notifications (queue them, show one at a time), notification while on another job (can view but priority given to current job), notification during do-not-disturb hours (suppressed, auto-decline)

**US-P005: Accept or Decline a Fixed-Price Job**
- AS A provider, I WANT TO accept or decline job offers SO THAT I control my workload
- Accept → Job added to schedule, customer notified, escrow confirmed
- Decline → Job offered to next matched provider, no penalty (but acceptance rate tracked)
- Edge cases: Accept but then can't make it (cancellation within 2 hours = warning, cancellation within 30 minutes = strike), job conflicts with existing booking (system prevents double-booking)

**US-P006: Submit a Quote for Custom Job**
- AS A provider, I WANT TO submit a detailed quote SO THAT I can win custom jobs
- Quote builder:
  - Line items (add/remove): Description, Quantity, Unit, Unit Price, Total
  - Subtotals: Labor, Materials, Equipment
  - Estimated timeline
  - Notes/conditions
  - Optional: photos of similar past work
  - Optional: request diagnostic visit (set fee)
- Edge cases: Customer has already received 5 quotes (provider notified "Maximum quotes reached"), quote significantly outside customer's budget range (provider warned but can still submit)

**US-P007: View My Schedule**
- AS A provider, I WANT TO see my upcoming jobs in a calendar view SO THAT I can plan my day
- Calendar view (day/week/month)
- Each job shows: Time, service type, location (with map), customer name, price
- Color-coded by status: confirmed (blue), in progress (green), pending payment (yellow)
- Edge cases: Overlapping jobs (should never happen — system prevents), job cancelled while provider is en route (immediate notification + cancellation fee)

**US-P008: Set Availability**
- AS A provider, I WANT TO set my available hours SO THAT I only get job offers when I can work
- Default schedule: set weekly recurring hours (e.g., Mon-Fri 8am-5pm, Sat 8am-12pm)
- Override: block specific dates/times, mark as "on vacation"
- Instant toggle: "Available Now" / "Unavailable" for real-time status
- Edge cases: Provider forgets to set availability back to "on" after vacation (send reminder after 7 days), provider has set availability but declines 5 consecutive jobs (send check-in notification)

### 2.3.3 Performing Services

**US-P009: Navigate to Job Location**
- AS A provider, I WANT TO navigate to the customer's location SO THAT I arrive on time
- Integrated map with directions
- Option to open in Waze or Google Maps
- ETA visible to customer
- "Arrived" button (requires GPS proximity to job location — within 200 meters)
- Edge cases: GPS not working (manual "I've arrived" with customer confirmation), customer's address is wrong (chat with customer, update address), provider can't find the location (platform support help)

**US-P010: Start and Track Job**
- AS A provider, I WANT TO mark job milestones SO THAT the platform and customer know my progress
- Buttons: "Started" → "In Progress" → "Completed"
- For multi-day jobs: "Day 1 Complete" → "Day 2 Started" → etc.
- Photo upload required at: arrival (before), during (for long jobs), completion (after)
- Timer: tracks actual time on-site (for hourly-rate services)
- Edge cases: Phone dies during job (provider can complete tracking when phone charges), customer not home at arrival (wait 15 minutes, then notify support)

**US-P011: Submit Change Order**
- AS A provider, I WANT TO formally request additional work/cost SO THAT scope changes are documented
- Change order form: Description of additional work, reason, photos, additional cost, additional time
- Customer must approve before provider proceeds
- Edge cases: Emergency additional work (e.g., discovered water damage during cleaning) — provider can proceed with ₱500 emergency threshold without pre-approval, must document immediately after

### 2.3.4 Getting Paid

**US-P012: View Wallet and Earnings**
- AS A provider, I WANT TO see my earnings and wallet balance SO THAT I can track my income
- Dashboard shows: Available balance, pending (in escrow), earned today, earned this week, earned this month
- Chart: earnings over time (daily, weekly, monthly)
- Transaction list: each job with amount, commission deducted, net payment, status
- Edge cases: Disputed job (funds shown as "held" with explanation), refunded job (deduction shown with reason)

**US-P013: Withdraw Funds**
- AS A provider, I WANT TO withdraw my earnings SO THAT I get paid
- Withdrawal to: GCash (instant), Maya (instant), Bank transfer (1-2 business days)
- Minimum withdrawal: ₱100
- No withdrawal fees
- Edge cases: Withdrawal exceeds available balance (blocked), GCash limit reached (₱100,000/month for basic GCash — suggest upgrading to fully verified), bank details incorrect (failed transfer, returned to wallet with notification)

**US-P014: View Payout History**
- AS A provider, I WANT TO see all my past payouts SO THAT I can reconcile my finances
- List: date, amount, method, status (processing/completed/failed), reference number
- Downloadable as CSV for BIR reporting
- Monthly summary (total earnings, total commission, total tips, total payouts)

### 2.3.5 Reputation

**US-P015: View My Ratings and Reviews**
- AS A provider, I WANT TO see my ratings and reviews SO THAT I know how I'm performing
- Overall rating + breakdown by subcategory
- All reviews with customer name, date, rating, text, photos
- Provider can respond to each review (one response per review)
- Edge cases: Fake/malicious review (provider can flag for admin review), customer edits review after provider responds (notification sent to provider)

**US-P016: Earn Tier Upgrades**
- AS A provider, I WANT TO see my progress toward the next tier SO THAT I'm motivated to stay on-platform
- Progress bar: current tier → next tier
- Requirements for next tier clearly shown
- Benefits of next tier clearly shown
- Notification when tier upgrade is earned

---

## 2.4 Provider (Company) User Stories

**US-PC001: Company Registration**
- AS A company owner, I WANT TO register my company SO THAT my team can accept jobs
- Additional requirements: DTI/SEC registration, business permit, BIR registration (TIN), list of team members, company logo
- Company account is separate from individual provider accounts
- Edge cases: Company has team members who are also individual providers (they choose which account to use per job)

**US-PC002: Team Management**
- AS A company owner, I WANT TO manage my team members SO THAT I can assign jobs and track performance
- Add team members by phone number
- Assign services each team member can perform
- View each team member's ratings, completed jobs, earnings
- Admin can: reassign jobs between team members, set different commission splits, deactivate team members

**US-PC003: Company Dashboard**
- AS A company owner, I WANT TO see company-wide analytics SO THAT I can manage my business
- Total revenue, total jobs, average rating, customer retention rate
- Per-team-member breakdown
- Most popular services
- Revenue trends

---

## 2.5 Admin (Super Admin) User Stories

**US-A001: Admin Dashboard**
- AS A platform admin, I WANT TO see real-time platform health SO THAT I can make decisions
- Metrics: Total active bookings, today's revenue, today's transactions, new registrations (customers + providers), open disputes, average customer rating given, average job value, GMV (daily/weekly/monthly)
- Alerts: Disputes requiring intervention, providers with falling ratings, unusual transaction patterns, system errors

**US-A002: Manage Service Catalog**
- AS an admin, I WANT TO manage the service catalog SO THAT offerings are current
- Add/edit/disable service categories and subcategories
- Set/update fixed prices per service per area
- Configure add-ons and their prices
- Set configurator options for menu-based services
- Edge cases: Disabling a service that has active bookings (honor existing bookings, prevent new ones)

**US-A003: Manage Providers**
- AS an admin, I WANT TO approve, suspend, and manage providers SO THAT quality is maintained
- Provider list with filters: status (pending/verified/suspended), tier, category, rating, area
- Per-provider actions: approve/reject application, view verification documents, suspend (with reason), reactivate, change tier, adjust commission rate, view complete job history, view dispute history
- Bulk actions: approve multiple pending providers, send notification to all providers in a category

**US-A004: Manage Customers**
- AS an admin, I WANT TO manage customer accounts SO THAT I can handle issues
- Customer list with search and filters
- Per-customer: view profile, booking history, payment history, dispute history, referral history
- Actions: suspend account (with reason), issue credit/refund, reset password, merge duplicate accounts

**US-A005: Financial Management**
- AS an admin, I WANT TO manage platform finances SO THAT revenue is tracked and correct
- Revenue dashboard: daily/weekly/monthly revenue, commission earned, service fees earned, refunds issued, guarantee fund balance
- Payout management: pending payouts, completed payouts, failed payouts
- Reconciliation: PayMongo account balance vs. platform wallet balances vs. expected amounts
- Export: financial reports as CSV/Excel for accounting

**US-A006: Dispute Management**
- AS an admin, I WANT TO review and resolve disputes SO THAT both sides are treated fairly
- Dispute queue: sorted by priority (age + amount + escalation level)
- Per-dispute: all evidence (photos, chat history, GPS data, timeline), customer's claim, provider's response, previous disputes for both parties
- Resolution options: full refund, partial refund, no refund + explanation, split decision
- See Chapter 7 for complete dispute resolution system

**US-A007: Platform Configuration**
- AS an admin, I WANT TO configure platform-wide settings SO THAT the platform operates correctly
- Configurable settings: commission rates (per tier, per category), service fee percentage, escrow auto-confirm timeout (default 24 hours), cancellation fee percentages, minimum withdrawal amount, referral reward amounts, surge pricing multipliers, service area boundaries

**US-A008: Analytics and Reporting**
- AS an admin, I WANT comprehensive analytics SO THAT I can make data-driven decisions
- Reports: GMV over time, transaction volume, average order value, customer acquisition cost (if running ads), customer lifetime value, provider utilization rate, category popularity, geographic heat map of demand, churn rate (customers and providers), NPS score

---

## 2.6 Support Agent User Stories

**US-S001: Handle Support Tickets**
- AS a support agent, I WANT TO manage customer and provider support tickets SO THAT issues are resolved
- Ticket queue with priority sorting
- Ticket types: booking issue, payment issue, provider no-show, app bug, account issue, general inquiry
- Agent can: respond to customer/provider, escalate to admin, issue refund (if permitted), reschedule booking, contact provider directly

**US-S002: Live Chat Support**
- AS a support agent, I WANT TO chat with users in real-time SO THAT urgent issues are resolved quickly
- Live chat interface with customer context (current booking, payment status, history)
- Quick-action buttons: "Where is my pro?", "Reschedule", "Cancel booking", "Issue refund"
- Canned responses for common issues
- Ability to transfer to another agent or escalate

---

## 2.7 Moderator/Arbitrator User Stories

**US-M001: Review Flagged Content**
- AS a moderator, I WANT TO review flagged reviews and messages SO THAT the platform stays professional
- Queue of flagged content (reviews, messages, profile descriptions)
- Actions: approve, edit, remove, warn user

**US-M002: Arbitrate Disputes**
- AS an arbitrator, I WANT TO make binding decisions on escalated disputes SO THAT both parties get closure
- Full evidence package (see Chapter 7)
- Decision must include: finding of fact, decision (refund amount/action), reasoning
- Decision is final and binding per Terms of Service

---

# CHAPTER 3: SCREEN-BY-SCREEN UI/UX SPECIFICATION

## 3.1 Complete Screen Inventory

The platform requires the following screens across all user interfaces:

### Customer Mobile App (27 screens)
1. Splash/Loading Screen
2. Onboarding Walkthrough (3-slide carousel)
3. Registration Screen (phone + OTP)
4. Login Screen
5. Home Dashboard
6. Service Category Grid
7. Service Subcategory List
8. Service Detail / Configuration Screen
9. Provider List (search results)
10. Provider Profile Detail
11. Booking Form (fixed-price)
12. Job Request Form (custom quote)
13. Quote Comparison Screen
14. Address Picker (map)
15. Date/Time Picker
16. Checkout / Payment Screen
17. Booking Confirmation Screen
18. Active Booking Tracker (provider en route)
19. In-Service Chat
20. Job Completion Confirmation
21. Rating & Review Screen
22. Tip Provider Screen
23. Booking History List
24. Booking Detail / Receipt
25. Customer Wallet
26. Customer Profile / Settings
27. Referral Program Screen

### Provider Mobile App (22 screens)
1. Provider Registration (multi-step)
2. Verification Status Tracker
3. Provider Home / Job Queue
4. New Job Notification (modal/overlay)
5. Job Detail (accept/decline)
6. Quote Builder
7. My Schedule (calendar)
8. Availability Settings
9. Navigation to Job
10. Active Job Tracker (start/progress/complete)
11. Change Order Form
12. Photo Upload (before/during/after)
13. Provider Wallet / Earnings Dashboard
14. Withdrawal Screen
15. Payout History
16. Payout Schedule Settings
17. My Ratings & Reviews
18. My Profile (edit)
19. My Services & Pricing
20. Suki Customer List
21. Provider Support / Help
22. Provider Settings

### Admin Web Dashboard (15+ screens)
1. Admin Login (2FA)
2. Main Dashboard (KPIs)
3. Provider Management (list + detail)
4. Customer Management (list + detail)
5. Booking Management (list + detail)
6. Dispute Queue + Resolution Interface
7. Service Catalog Management
8. Pricing Management
9. Financial Dashboard + Reports
10. Payout Management
11. Analytics Dashboard
12. System Settings / Configuration
13. Staff / Roles / Permissions
14. Notification Template Management
15. Audit Log Viewer
16. Support Ticket Queue

---

## 3.2 Customer App Screens — Detailed Specification

### Screen 1: Splash / Loading Screen

**Purpose:** Brand impression while app loads
**Duration:** 1-3 seconds
**Content:**
- App logo (centered)
- App name
- Tagline: "Trusted Home Services"
- Loading indicator (subtle animation)
**Design notes:**
- Brand color background
- No skeleton screen needed — this is purely a branded loading moment
- If user is already logged in, go directly to Home Dashboard
- If not logged in, go to Onboarding Walkthrough (first time) or Login (returning)

### Screen 2: Onboarding Walkthrough

**Purpose:** Explain the app's value to new users
**Format:** 3-slide carousel with "Skip" and "Next" buttons, dots indicator
**Slide 1:**
- Illustration: person relaxing while professional cleans their home
- Headline: "Verified Professionals, Anytime"
- Subtext: "Book trusted, NBI-cleared service providers for any home service"
**Slide 2:**
- Illustration: phone showing escrow payment flow
- Headline: "Secure Escrow Payments"
- Subtext: "Your payment is held safely until you confirm the job is done right"
**Slide 3:**
- Illustration: shield with checkmark
- Headline: "SiguradoShield™ Protection"
- Subtext: "Every booking is covered. If anything goes wrong, we make it right."
- CTA button: "Get Started"

### Screen 3: Registration Screen

**Purpose:** Create a new customer account
**Layout:**
- Header: "Create Account"
- Phone number input (auto-detect country code +63)
- "Send OTP" button
- OTP input (6 digits, auto-focus next field)
- "Verify" button
- After verification: Name input, email input (optional)
- "Create Account" button
- Footer: "Already have an account? Log in"
- Social login options: "Continue with Google" (Phase 2)
**Validation:**
- Phone: 10-11 digits after country code, starts with 09xx or 9xx
- OTP: exactly 6 digits, expires after 5 minutes, resend available after 60 seconds
- Name: 2-50 characters, letters and spaces only
**Design notes:**
- Currency must be ₱ (Philippine Peso) everywhere
- All addresses must be Philippine format (barangay, municipality, province)
- Language: English only (standard for Philippine apps)
- NO dollar signs anywhere in the entire app

### Screen 5: Home Dashboard (CRITICAL — Main Screen)

**Purpose:** The primary screen customers see. Must enable quick booking and show relevant information.

**Layout (top to bottom):**

**Header bar:**
- Left: User avatar (tap → Profile)
- Center: Current location label (tap → change address). Format: "Brgy. [Name], [Municipality]"
- Right: Notification bell (with badge count)

**Active Booking Card (if any):**
- Prominent card at top (blue/accent background)
- Shows: Service type, provider name + photo, status badge (Confirmed/En Route/In Progress), scheduled time
- CTA: "Track Status" button
- Swipeable if multiple active bookings

**"What do you need?" section:**
- Icon grid: 4 columns × 2 rows (8 visible)
- Icons: Cleaning, Plumbing, Electrical, Painting, Aircon, Pest Control, Moving, "More +"
- Tap any icon → service subcategory screen
- "More +" opens full category list

**Search bar:**
- Below icon grid
- Placeholder: "Search services or providers..."
- Tap → opens search screen with keyboard

**Promotions carousel:**
- Horizontal swipeable cards
- Shows current promos, first-booking discounts, seasonal offers
- Each card: image, headline, subtext, CTA
- No USD dollar signs, no US imagery — Filipino-localized visuals

**"Your Suki Pros" section (if returning customer):**
- Horizontal scroll of provider cards (providers they've used 3+ times)
- Each card: photo, name, rating, service type, "Book Again" button
- Tap card → provider profile

**"Quick Re-book" section:**
- Last 3 completed bookings
- Each shows: service type, provider name, price, "Book Again" button
- Tap → pre-filled booking form

**Bottom navigation bar:**
- 4 tabs: Home, Bookings, Wallet, Profile
- Active tab highlighted with brand color

**CRITICAL DIFFERENCES FROM STITCH DESIGN:**
- Your Stitch design shows "123 Main St, New York" — this MUST be Philippine address format
- Your Stitch shows "$45.00" and "$80.00" — MUST be ₱ amounts (₱449, ₱800, etc.)
- Your Stitch shows "Lawn Mowing $45" — price must reflect Philippine market
- The promo card "20% Off First Booking" concept is good but needs Filipino imagery/copy
- Missing: search bar, Suki Pros section, bottom nav should include Wallet tab

### Screen 16: Checkout / Payment Screen (CRITICAL)

**Purpose:** Final payment screen before booking is confirmed

**Layout (top to bottom):**

**Header:** "Checkout" with back arrow

**Amount display:**
- "TOTAL AMOUNT" label
- Large amount: "₱550.00"
- Breakdown link: "View breakdown >"

**Price Breakdown (expandable):**
- Service: Condo Cleaning — ₱449.00
- Add-on: Extra bathroom — ₱150.00
- Subtotal: ₱599.00
- Platform Service Fee (10%): ₱59.90
- Less: Promo discount — ₱(100.00)
- **Total: ₱558.90**
- SiguradoShield™ Protection: ✓ Included

**Order Summary card:**
- Service name + icon
- Date and time
- Provider name (if already matched) or "Best available provider"
- Address

**Payment Method section:**
- Selected payment method with radio buttons:
  - 🟢 GCash (linked: 09XX XXX XXXX) — PRIMARY
  - Maya (linked: 09XX XXX XXXX)
  - Visa ending in 4242
  - QR Ph (generate at checkout)
  - Platform Wallet (Balance: ₱200.00)
  - "+ Add Payment Method"
- GCash and Maya should be listed FIRST — they are the dominant methods

**Trust indicators:**
- 🔒 "Secured by PayMongo"
- 🛡️ "Protected by SiguradoShield™"
- "Your payment is held in escrow until you confirm the job is complete"

**CTA button:**
- "Pay ₱558.90 →" (large, primary color)

**Legal footer:**
- "By confirming payment, you agree to our Terms of Service and Privacy Policy"

**CRITICAL DIFFERENCES FROM STITCH DESIGN:**
- Your Stitch shows "Visa ending in 4242" as PRIMARY and "Apple Pay" — this is completely wrong for the Philippine market. GCash must be the default/primary payment method, followed by Maya, then cards
- Your Stitch shows $120.00 in USD — must be PHP
- Your Stitch doesn't show price breakdown — customers need to see exactly what they're paying for
- Your Stitch doesn't mention escrow — the single most important trust signal is missing
- Your Stitch doesn't show SiguradoShield — your competitive advantage is invisible

---

# CHAPTER 4: PHILIPPINE REGULATORY & LEGAL COMPLIANCE

## 4.1 Business Registration Requirements

### Step 1: SEC Registration (Corporation)
- Register as a domestic corporation with the Securities and Exchange Commission
- Why corporation (not sole proprietorship): you need corporate liability protection, the ability to raise investment, and separation of business and personal assets
- Capital requirement: minimum ₱5,000 paid-up capital for Filipino-owned corporation
- If any foreign ownership: minimum $200,000 paid-up capital (but if registered with BOI as a startup, this may be reduced to $100,000)
- Required documents: Articles of Incorporation, By-laws, Treasurer's Affidavit, bank certificate of deposit
- Processing time: 5-15 business days
- Register through SEC eSPARC portal

### Step 2: BIR Registration
- Register with the Bureau of Internal Revenue for tax compliance
- Obtain Tax Identification Number (TIN) for the corporation
- Register business activities and books of accounts
- Obtain Authority to Print (ATP) for official receipts or use BIR-accredited electronic invoicing
- Register for VAT if expected revenue exceeds ₱3,000,000/year (likely within first year)
- VAT rate: 12% on services (this affects your pricing — you may need to include VAT in the service fee or add it separately)

### Step 3: Local Government Permits
- Barangay Clearance from the barangay where your office/operations are based
- Mayor's Permit / Business Permit from the city or municipality
- Requirements: SEC certificate, barangay clearance, lease contract for office, zoning clearance, fire safety inspection certificate
- Renewal: annually (January)

### Step 4: NPC Registration (Data Privacy)
- Register with the National Privacy Commission (NPC) as a Personal Information Controller (PIC)
- Required for any business processing 1,000+ records of personal data
- You will be processing customer names, addresses, phone numbers, payment info, government IDs (for providers), GPS location data — ALL of this is personal data under the Data Privacy Act
- Requirements: Appoint a Data Protection Officer (DPO) within 90 days, register data processing systems within 20 days of operation, conduct Privacy Impact Assessment (PIA), implement Privacy Management Program
- Display the NPC Seal of Registration on your app and website
- Penalties for non-compliance: Administrative fines of ₱20,000-₱50,000 per incident (max ₱5,000,000 per violation), plus criminal penalties up to 3-6 years imprisonment and ₱1,000,000-₱5,000,000 fine for willful violations

### Step 5: DOLE Compliance (if you have employees)
- If you hire full-time employees (support agents, admin staff): register with DOLE
- If you have 5+ employees: encouraged to register. If 50+: required to register
- Mandatory registrations: SSS, PhilHealth, Pag-IBIG for all employees
- CRITICAL: Your service providers are classified as INDEPENDENT CONTRACTORS, not employees. This is a massive legal issue. See section 4.2.

## 4.2 The Independent Contractor Classification Minefield

### The Risk
The Philippine Supreme Court's 2023 ruling in Borromeo v. Lazada found that Lazada's delivery riders — classified as independent contractors — were actually employees. The court looked at the "economic reality" of the relationship: Lazada controlled work methods, schedules, and the riders were economically dependent on Lazada.

If your service providers are ever re-classified as employees, you would owe:
- Back pay for minimum wage differentials
- 13th month pay (retroactive)
- SSS, PhilHealth, Pag-IBIG contributions (retroactive)
- Service incentive leave monetization
- Overtime pay
- Separation pay

### How to Ensure Your Providers Are Genuinely Independent Contractors

The Philippine "four-fold test" for employment:
1. **Selection and engagement** — you select them, but they choose whether to accept each job ✓ (they can decline any job)
2. **Payment of wages** — you don't pay wages, you facilitate payment from customers ✓ (they earn per job, not a salary)
3. **Power of dismissal** — you can deactivate their account for cause, but not "fire" them ✓ (they can leave anytime, work for competitors)
4. **Control over work** — THIS IS THE CRITICAL ONE. You must NOT control the means and methods of how they do their work.

**To stay safe, your platform MUST:**
- Allow providers to set their own rates (at least for custom-quoted services)
- Allow providers to set their own schedules
- NOT require them to wear uniforms or follow specific work procedures
- NOT set minimum hours or minimum jobs per week/month
- NOT provide tools or equipment
- Allow them to work on other platforms simultaneously
- Have a clear Independent Contractor Agreement (not an "employment contract")
- Pay them per job, not per hour or per month (even if individual jobs have hourly rates, the relationship is per-engagement)

**What you CAN do:**
- Set quality standards (minimum rating to stay active)
- Require verification documents (NBI, ID)
- Set pricing for fixed-price catalog services (this is pricing the SERVICE, not wage-setting for the WORKER)
- Deactivate accounts for Terms of Service violations
- Require photo documentation of completed work (this is quality assurance, not work supervision)

## 4.3 Consumer Protection Compliance

The Consumer Act of the Philippines (RA 7394) and the E-Commerce Act (RA 8792) apply to your platform.

Key requirements:
- Clear disclosure of all fees before payment
- No deceptive or misleading advertising
- Right to refund for services not delivered as described
- Proper handling of complaints
- Display of DTI Fair Trade permit number on the app

## 4.4 Data Privacy Act Compliance

Under RA 10173 (Data Privacy Act of 2012) and NPC Circular 2023-06:

**Data you collect and process:**
- Customer: name, phone, email, addresses, payment info, booking history, GPS location, chat messages, photos
- Provider: name, phone, email, address, government ID, NBI clearance, selfie, bank/GCash details, GPS location, earnings data, photos

**Required measures:**
1. Privacy-by-Design: build privacy controls into the app from day one
2. Privacy-by-Default: collect only what's necessary, don't enable tracking by default
3. Consent: explicit consent before collecting data (clear privacy notice at registration)
4. Data minimization: don't collect more than needed
5. Storage limitation: delete data when no longer needed (define retention periods)
6. Security: encryption at rest and in transit, access controls, audit logs
7. Breach notification: 72 hours to notify NPC of any data breach
8. Data subject rights: right to access, correct, delete, port their data
9. Annual Security Incident Report (ASIR): submit to NPC by March 31 each year
10. Appoint a Data Protection Officer

**Practical implementation:**
- Privacy notice / privacy policy: prominently linked in the app and at registration
- Cookie consent (for web version)
- Data export feature (customer can download their data)
- Account deletion feature (with 30-day retention then permanent deletion)
- Encrypted storage for: government IDs, NBI clearances, payment tokens, chat messages
- Access logging: who accessed what data, when, from where

---

# CHAPTER 5: PAYMENT ARCHITECTURE DEEP DIVE

## 5.1 Payment Gateway Comparison for Philippine Market

### Option 1: PayMongo (RECOMMENDED PRIMARY)

**Why PayMongo:**
- Philippine-founded, Y Combinator-backed, 10,000+ businesses
- Specifically built for the Philippine market
- PayMongo Platforms product is DESIGNED for marketplaces — supports sub-merchant onboarding, payment splitting, wallet management, and programmatic payouts
- PCI DSS Level 1, SOC 2 Type 2 compliant
- Real-time fraud detection

**Fees:**
- Cards (Visa/Mastercard): 3.5% + ₱15 per transaction
- E-wallets (GCash, Maya, GrabPay): 3.0% per transaction
- QR Ph: 1.5% per transaction ← cheapest option
- Over-the-counter (7-Eleven, Cebuana, M Lhuillier): 2.0% per transaction
- Bank transfer (InstaPay): 1.5% + ₱15 per transaction
- Payouts to bank: free
- Payouts to GCash/Maya: via InstaPay/PESONet (included in wallet features)

**Platform-specific features:**
- Payment Splitting API: automatically split payment between platform and provider at checkout
- Sub-merchant onboarding: each provider can be a "child account" with their own wallet
- Escrow via wallets: hold funds in platform wallet, release to provider wallet on confirmation
- Pricing: ₱75/month per active sub-account (provider)

**Settlement:**
- Funds clear in 2-5 banking days depending on payment method
- Payouts generated every Wednesday
- Instant settlement available for additional fee (up to 2-3%)

### Option 2: Xendit (RECOMMENDED SECONDARY / BACKUP)

**Why Xendit as backup:**
- SEA-wide platform (Indonesia, Philippines, Malaysia, Thailand)
- Stronger enterprise features if you scale to multiple countries
- Disbursement/payout tools are excellent
- No additional fee for API integration

**Fees:**
- Cards: 3.5% + ₱15
- E-wallets: 2.8%
- Direct bank debit: 1.5% + ₱15
- Over-the-counter: varies
- Disbursements: ₱15-₱25 per payout

### Option 3: Direct GCash/Maya Integration (LOWEST FEES)

**For reducing processing fees on your highest-volume payment method:**

Direct integration with GCash Webpay or Maya Checkout bypasses the PayMongo middleman.

**Potential fees with direct integration:**
- GCash direct: 1.5-2.5% (negotiable based on volume) — vs 3% through PayMongo
- Maya direct: 1.5-2.5% (negotiable) — vs 3% through PayMongo

**Savings at scale:**
If you process ₱1,000,000/month via e-wallets:
- Through PayMongo (3%): ₱30,000/month in fees
- Direct GCash/Maya (2%): ₱20,000/month in fees
- **Savings: ₱10,000/month**

**Trade-off:** Direct integration requires:
- More development work (separate API for each wallet)
- Separate merchant agreements with GCash and Maya
- You lose PayMongo's unified dashboard and fraud screening
- You need to build your own reconciliation

**Recommendation:** Start with PayMongo for everything (simpler, faster to launch). Once you're processing >₱500,000/month through e-wallets, add direct GCash integration for cost savings. Keep PayMongo for cards and over-the-counter.

### Option 4: QR Ph (LOWEST POSSIBLE FEES)

QR Ph is the BSP's (Bangko Sentral ng Pilipinas) interoperable QR code payment system. All major banks and e-wallets in the Philippines can scan and pay QR Ph codes.

**Fee through PayMongo:** 1.5% — the cheapest payment method available

**How it works for your app:**
1. Customer selects "QR Ph" at checkout
2. App generates a QR code (via PayMongo API) with the exact amount
3. Customer opens their GCash, Maya, or banking app and scans the QR code
4. Payment is confirmed via webhook
5. Done — you just collected payment at 1.5% instead of 3%

**Trade-off:** Slightly more friction for the customer (they have to switch apps to scan). But the cost savings are significant, especially for high-value jobs.

**Recommendation:** Offer QR Ph as a secondary option alongside linked GCash/Maya. Some price-sensitive customers will prefer it if you pass the savings to them (e.g., "Save ₱15 by paying with QR Ph").

## 5.2 Fee Impact on Pricing

Your pricing must account for payment processing fees. Here's how:

| Payment Method | Fee | On a ₱1,000 job | Net to Platform |
|---|---|---|---|
| GCash (via PayMongo) | 3.0% | ₱30 | ₱970 |
| Maya (via PayMongo) | 3.0% | ₱30 | ₱970 |
| Credit card | 3.5% + ₱15 | ₱50 | ₱950 |
| QR Ph | 1.5% | ₱15 | ₱985 |
| Bank transfer | 1.5% + ₱15 | ₱30 | ₱970 |
| Platform Wallet (pre-funded) | 0% (already collected) | ₱0 | ₱1,000 |

**Platform wallet is the most profitable payment method.** Consider incentivizing wallet top-ups with bonus credits (e.g., "Top up ₱1,000, get ₱1,050 in wallet balance").

## 5.3 How Escrow Works Technically (PayMongo Implementation)

Using PayMongo Platforms:

1. **Customer pays:** PayMongo creates a Payment Intent → customer authorizes via GCash/Maya/card → payment captured → funds land in your PLATFORM PayMongo wallet

2. **Funds held in escrow:** The funds sit in your platform wallet. They are NOT in the provider's sub-account yet. This IS the escrow.

3. **Job completed + customer confirms:** Your backend triggers a Transfer via PayMongo API from your platform wallet to the provider's sub-account wallet, minus commission.

4. **Provider withdraws:** Provider requests withdrawal from their sub-account → PayMongo sends to their GCash/Maya/bank account.

**Key technical detail:** PayMongo's wallets support "segmented balances" — you can tag funds as "escrow" vs "available" vs "guarantee_fund" within your platform wallet. This makes reconciliation clean.

## 5.4 Handling Refunds

**Full refund:**
- If paid via GCash/Maya: refund directly to the same wallet via PayMongo API
- If paid via card: refund to original card (takes 5-10 business days to appear)
- If paid via QR Ph: refund to platform wallet (customer can withdraw or use for next booking)

**Partial refund:**
- Same as above but for a partial amount
- Remaining amount is released to provider (if applicable)

**Refund timing:**
- Escrow not yet released: instant refund (funds haven't left your wallet)
- Escrow already released to provider: deduct from provider wallet; if insufficient, cover from guarantee fund and create a debt on provider's account

---

*[Document continues in Part 2 with Chapters 6-10 and Appendices]*
# CHAPTER 6: ADMIN PANEL & WEB DASHBOARD COMPLETE SPECIFICATION

## 6.1 Admin Panel Architecture

The admin panel is a web application (NOT a mobile app) accessible at admin.yourplatform.com. It is the command center for platform operations.

**Tech stack:** React SPA with role-based access control
**Authentication:** Email + password + 2FA (Google Authenticator or SMS OTP)
**Access:** Desktop browsers only (responsive but not mobile-optimized — admin work requires desktop)

## 6.2 Admin Dashboard (Main Screen)

### Real-Time KPI Cards (top row)
- **Today's Revenue:** ₱XX,XXX (commission + service fees earned today)
- **Active Bookings:** XX (jobs currently in progress)
- **Pending Disputes:** XX (requires attention badge if >0)
- **New Signups:** XX customers / XX providers (today)
- **Provider Approval Queue:** XX pending (requires attention badge if >0)
- **Platform Wallet Balance:** ₱XXX,XXX (total held in PayMongo)

### Charts (second row)
- **Revenue trend:** line chart, last 30 days, daily granularity
- **Booking volume:** bar chart, last 7 days, by category
- **Customer acquisition:** line chart, new registrations per day

### Alert Feed (sidebar or below charts)
- "Provider [Name] has 3 consecutive 1-star ratings — review required"
- "Dispute #4821 has been open for 48 hours — escalation needed"
- "PayMongo webhook failure detected — 3 payments pending confirmation"
- "Provider [Name]'s NBI clearance expires in 7 days"
- "Unusual activity: Customer [Name] filed 5 disputes in 7 days"

### Quick Actions
- "Approve Pending Providers" button (shows count)
- "Review Disputes" button (shows count)
- "Generate Daily Report" button

## 6.3 Provider Management

### Provider List View
- Table with columns: Name, Photo, Rating, Tier (New/Verified/Pro/Elite), Categories, Status (Active/Suspended/Pending), Total Jobs, Join Date, Last Active
- Filters: Status, Tier, Category, Rating range, Date range, Area
- Search: by name, phone, email, ID number
- Bulk actions: Approve selected, Suspend selected, Send notification to selected
- Export: CSV/Excel

### Provider Detail View
- **Profile tab:** All profile information, verification documents (viewable), government ID image, NBI clearance image, selfie, registration date
- **Jobs tab:** Complete job history with status, amounts, ratings
- **Financials tab:** Total earnings, commission paid, wallet balance, payout history, pending payouts
- **Reviews tab:** All reviews received, flagged reviews, response history
- **Disputes tab:** All disputes involving this provider, outcomes, pattern analysis
- **Activity log tab:** Login history, app usage, location data (during active jobs)
- **Actions:** Edit profile, Change tier, Adjust commission, Suspend (with reason dropdown + notes), Reactivate, Permanently ban, Send message, Request additional documents

### Provider Approval Workflow
- Queue of pending applications
- Each application shows: name, photo, ID documents, NBI clearance, selfie, requested categories, requested area
- Admin can: Approve, Reject (with reason), Request More Info
- Auto-checks: ID number format validation, NBI clearance expiry check, duplicate detection (same ID number or phone)

## 6.4 Dispute Resolution Interface

### Dispute Queue
- Table: Dispute ID, Booking ID, Customer Name, Provider Name, Category, Amount, Status (Open/Under Review/Escalated/Resolved), Age (hours since filed), Priority (auto-calculated: amount × age)
- Sort by: Priority (default), Age, Amount
- Filter by: Status, Category, Amount range

### Dispute Detail View (Full Evidence Package)
- **Booking summary:** Service type, date, amount, provider, customer
- **Customer's claim:** Text description, uploaded photos/videos, claim type (incomplete work / property damage / no-show / overcharge / theft / other)
- **Provider's response:** Text description, uploaded photos/videos
- **Chat history:** Complete in-app messaging between customer and provider for this booking
- **GPS data:** Provider's location timeline during the job (arrived time, departure time)
- **Photo evidence:** Before photos (provider arrival), progress photos, after photos (completion)
- **Past dispute history:** Both customer and provider's previous disputes and outcomes
- **Resolution options (admin selects):**
  - Full refund to customer (provider gets nothing)
  - Partial refund (admin sets %) — remaining goes to provider
  - No refund — explain why to customer
  - Refund + provider warning
  - Refund + provider suspension
  - Split decision (custom allocation)
- **Decision form:** Selected resolution, amount, written reasoning (required), internal notes (not visible to users)
- **Communication:** Send resolution notification to both parties with explanation

## 6.5 Financial Management

### Revenue Dashboard
- Total GMV (gross merchandise value): daily/weekly/monthly/yearly
- Platform revenue: commission earned + service fees earned
- Breakdown by: service category, payment method, area
- Refunds issued: count + total amount
- Guarantee fund: balance, claims paid, replenishment needed
- Payment processing fees: total paid to PayMongo

### Payout Management
- Pending payouts: list of providers with unreleased escrow funds
- Completed payouts: history with amounts and methods
- Failed payouts: list with failure reason (insufficient provider wallet, invalid bank details, etc.)
- Manual payout trigger: for special cases where auto-payout fails

### Reconciliation
- PayMongo account balance vs. sum of all platform wallets
- Discrepancy alerts: any mismatch >₱100 triggers an alert
- Daily reconciliation report (automated)

## 6.6 Service Catalog Management

### Category Management
- Add/edit/disable categories and subcategories
- Set icon and display order
- Set which areas each category is available in

### Pricing Management
- Fixed-price catalog: set prices per service per area
- Configurator management: set options, add-ons, and their prices per service
- Commission rates: set per tier, per category, per area
- Service fee percentages: set globally or per category
- Surge pricing: set multipliers for rush/emergency bookings

## 6.7 Notification Template Management

### Templates for Each Event
Every notification sent by the platform uses a template that admins can customize:

**Customer notifications:**
- Booking confirmed
- Provider assigned
- Provider en route
- Provider arrived
- Job completed — please confirm
- Auto-confirmed (24h timeout)
- Refund processed
- Dispute update
- Recurring booking reminder
- Payment method expiring
- Promo/discount available

**Provider notifications:**
- New job available
- Job accepted confirmation
- Customer cancelled
- Change order approved/declined
- Payment released to wallet
- Withdrawal processed
- Rating received
- Tier upgrade earned
- NBI clearance expiring
- Account warning/suspension

Each template has: SMS version (160 char limit), push notification version (short), email version (full), in-app version. Templates support variables: [CustomerName], [ProviderName], [ServiceType], [Amount], [Date], [Time], [BookingID]

---

# CHAPTER 7: DISPUTE RESOLUTION, ARBITRATION, INSURANCE & TRUST SYSTEMS

## 7.1 SiguradoShield™ Buyer Protection Program

### What It Covers

| Coverage Type | Description | Maximum Coverage | Deductible |
|---|---|---|---|
| **No-show** | Provider doesn't arrive within 30 min of scheduled time | Full refund | ₱0 |
| **Incomplete work** | Provider leaves before job is finished | Full or partial refund based on completion % | ₱0 |
| **Substandard work** | Work doesn't meet reasonable quality standards | Up to 100% refund or free redo by different provider | ₱0 |
| **Property damage** | Provider damages customer's property during service | Up to ₱50,000 per incident | ₱500 |
| **Theft** | Items go missing after provider visit | Up to ₱25,000 per incident (with police report) | ₱0 |
| **Personal injury** | Customer is injured due to provider negligence | Up to ₱100,000 (with medical documentation) | ₱0 |

### What It Does NOT Cover
- Damage to items the customer was warned about (e.g., "This old pipe may break during repair")
- Pre-existing conditions of property
- Jobs performed off-platform
- Jobs where the customer interfered with or directed the work in a way that caused the issue
- Cosmetic dissatisfaction with subjective quality (e.g., "I don't like the paint color" when the customer chose the color)
- Jobs cancelled by the customer after completion
- Tips or gratuities

### How the Guarantee Fund Works

**Funding:**
- 1.5% of every service fee collected goes into the SiguradoShield™ guarantee fund
- At ₱500,000/month GMV with 10% service fee, that's ₱750/month into the fund
- At ₱5,000,000/month GMV, that's ₱7,500/month
- The fund accumulates over time and is only drawn down for approved claims

**Fund management:**
- Fund balance tracked in admin dashboard
- If fund drops below ₱50,000, alert to admin for replenishment (from general revenue)
- Monthly report: claims paid vs. fund contributions
- Target fund balance: 3x average monthly claims paid

**Phase 2: Insurance Partner**
- Once you have 6+ months of claims data, approach a Philippine microinsurance provider (Pioneer Insurance, Malayan Insurance, Cebuana Lhuillier Insurance)
- They can underwrite the SiguradoShield™ program based on your actual claims data
- This transfers the financial risk from your platform to the insurer
- You pay a monthly premium; they handle claims above a threshold

## 7.2 Complete Dispute Resolution Process

### Tier 1: Automated Resolution (target: 80% of disputes)

**Step 1: Customer files dispute**
- Within 48 hours of job completion (or 24 hours of auto-confirmation)
- Selects dispute type: No-show, Incomplete work, Substandard work, Property damage, Theft, Overcharge, Other
- Provides description (required, min 50 characters)
- Uploads evidence (photos/video, required for property damage and theft)

**Step 2: Automatic assessment**
- System checks: Did provider GPS confirm arrival? Did provider upload completion photos? Was the job duration reasonable for the service type? Does the customer have a history of frequent disputes?
- For "No-show" disputes: if provider never checked in via GPS → auto-approve full refund
- For "Incomplete work": if provider marked job as complete in <50% of estimated time → flag for review with high probability of customer-favorable outcome

**Step 3: Provider notification**
- Provider receives: "Customer [Name] has reported an issue with Job #[ID]: [Type]. Please review and respond within 24 hours."
- Provider can: Accept (agree to refund), Contest (provide their side + evidence), Offer partial resolution (propose a partial refund or free redo)

**Step 4: Automated resolution**
- If provider accepts → refund processed automatically
- If provider offers partial resolution and customer accepts → processed automatically
- If provider doesn't respond within 24 hours → auto-resolve in customer's favor (pro-customer platform)
- If provider contests → escalate to Tier 2

### Tier 2: Support Agent Review (target: 15% of disputes)

**Step 1: Agent assigned**
- First available support agent with dispute resolution permission
- Agent sees: full evidence package (Chapter 6 dispute detail view)

**Step 2: Investigation**
- Agent reviews all evidence
- Agent can: contact customer for additional info, contact provider for additional info, review GPS and timestamp data, compare before/after photos, check provider's dispute history

**Step 3: Decision**
- Agent selects resolution: full refund / partial refund (set %) / no refund / free redo
- Agent writes decision reasoning (required)
- Both parties notified with decision and reasoning
- Either party can escalate to Tier 3 within 48 hours

### Tier 3: Arbitration (target: 5% of disputes)

**Step 1: Escalation**
- Triggered by: either party rejecting Tier 2 decision, or disputes involving >₱5,000, or property damage/theft claims

**Step 2: Senior review**
- Reviewed by admin or senior moderator (not the same agent from Tier 2)
- May include: phone call with both parties, request for additional documentation, on-site inspection (for high-value property damage)

**Step 3: Binding decision**
- Decision is FINAL per Terms of Service
- Both parties notified with detailed reasoning
- If decision involves refund: processed immediately
- If decision involves provider penalty: applied immediately

### Pro-Customer Policy

**The platform defaults to believing the customer when evidence is ambiguous.** This is a deliberate business decision. Here's why:

1. Customers are harder to acquire than providers. Losing a customer to a bad experience means losing all their future bookings.
2. Word-of-mouth in the Philippines is POWERFUL. One angry customer tells 50 people. One satisfied customer tells 5.
3. Providers who consistently generate disputes are removed from the platform. The few unfair losses they experience are offset by the volume of business the platform provides.
4. The guarantee fund absorbs the cost of pro-customer decisions, so individual providers aren't directly penalized for ambiguous cases.

**However, this is not unlimited:**
- Customers who file disputes on >20% of their bookings are flagged for review
- Customers who file 3+ consecutive disputes are required to provide video evidence
- Customers who are found to be fraudulently filing disputes are suspended
- Provider dispute patterns are tracked: a provider with disputes from many different customers = genuine quality issue. A provider with disputes from only one or two customers = possible problem customers.

## 7.3 Specific Dispute Scenarios and Resolutions

**Scenario 1: "The cleaner didn't clean the bathroom"**
- Customer claim: incomplete work
- Provider response: "I cleaned everything, including the bathroom"
- Evidence: Provider's completion photos show bathroom from one angle; customer's photos show dirt behind toilet
- Resolution: Partial refund (25%) + provider returns to complete the bathroom at no charge, OR full refund if customer doesn't want the same provider back

**Scenario 2: "The plumber made the leak worse"**
- Customer claim: substandard work + additional damage
- Provider response: "The pipe was already corroded; I warned the customer it might break"
- Evidence: Provider's before photos show corroded pipe; customer acknowledges verbal warning
- Resolution: No refund for the original service (provider performed the work), but SiguradoShield™ covers the additional damage repair up to ₱50,000 with ₱500 deductible

**Scenario 3: "My ring is missing after the cleaning service"**
- Customer claim: theft
- Provider response: "I didn't take anything"
- Evidence: No camera footage; customer files police report
- Resolution: Escalate to Tier 3. Require police report. If police report filed, SiguradoShield™ covers up to ₱25,000. Provider account suspended pending investigation. If pattern of theft reports involving this provider exists, permanent ban.

**Scenario 4: "The painter used cheap paint, not the brand I paid for"**
- Customer claim: materials fraud
- Provider response: "I used the paint the customer selected"
- Evidence: Customer's quote specified Boysen paint; provider's receipt shows generic brand
- Resolution: Full refund + provider suspended. Provider committed fraud by charging for premium materials and using cheap ones.

**Scenario 5: "The provider asked me to pay them directly via GCash for the next booking"**
- Customer report: platform bypass solicitation
- Resolution: Provider receives warning (first offense). Message screenshot saved. Provider's future messages monitored. If repeated, account suspended.

---

# CHAPTER 8: SERVICE CATEGORY BIBLE

## 8.1 Category Architecture

### Primary Categories (visible on home screen)

1. **Cleaning** — residential, commercial, specialty
2. **Plumbing** — repairs, installation, maintenance
3. **Electrical** — repairs, installation, safety
4. **Painting** — interior, exterior, specialty
5. **HVAC/Aircon** — cleaning, repair, installation
6. **Pest Control** — residential, commercial, termite
7. **Moving** — local, packing, furniture assembly
8. **Carpentry** — repairs, custom, installation
9. **Appliance Repair** — major, small, electronics
10. **Lawn & Garden** — mowing, landscaping, tree trimming
11. **Spa & Wellness** — massage, nail care, hair services
12. **Laundry** — pickup/delivery, dry cleaning
13. **Deep Cleaning** — post-construction, move-in/out, disaster recovery
14. **Handyman** — catch-all for miscellaneous tasks

### Per-Category Detail: What's Fixed, What's Quoted, Provider Requirements

**CLEANING (highest volume category)**

| Subcategory | Pricing Model | Provider Requirement | Avg Price Range |
|---|---|---|---|
| Condo cleaning | Fixed (by size + add-ons) | Basic training | ₱449-₱1,149 |
| House cleaning | Fixed (by bedrooms + add-ons) | Basic training | ₱649-₱2,000 |
| Office cleaning | Quoted (by sqm) | Commercial experience | ₱1,500-₱10,000 |
| Move-in/move-out | Fixed (by size, premium rate) | Deep clean experience | ₱1,500-₱5,000 |
| Carpet cleaning | Fixed (per sqm) | Equipment required | ₱80/sqm |
| Sofa/upholstery | Fixed (per seat) | Equipment required | ₱150-₱250/seat |
| Mattress cleaning | Fixed (by size) | Equipment required | ₱500-₱900 |
| Window cleaning | Quoted (by count + height) | Safety equipment for >2 floors | ₱50-₱200/window |
| Post-construction | Quoted (by sqm) | Heavy-duty experience | ₱100-₱200/sqm |

**PLUMBING**

| Subcategory | Pricing Model | Provider Requirement | Avg Price Range |
|---|---|---|---|
| Leak repair | Quoted | Plumbing experience, tools | ₱500-₱5,000 |
| Drain unclogging | Fixed or quoted | Plumbing experience | ₱500-₱2,000 |
| Faucet installation | Fixed | Basic plumbing | ₱300-₱800 + materials |
| Toilet repair | Quoted | Plumbing experience | ₱500-₱3,000 |
| Water heater install | Quoted | Licensed preferred | ₱2,000-₱8,000 |
| Pipe replacement | Quoted (diagnostic visit) | Licensed, heavy tools | ₱3,000-₱30,000 |
| Septic/drainage | Quoted | Specialized equipment | ₱5,000-₱50,000 |

**ELECTRICAL**

| Subcategory | Pricing Model | Provider Requirement | Avg Price Range |
|---|---|---|---|
| Outlet/switch install | Fixed | Electrical experience | ₱300-₱600/point |
| Light fixture install | Fixed | Basic electrical | ₱200-₱500/fixture |
| Ceiling fan install | Fixed | Electrical experience | ₱500-₱1,000 |
| Circuit breaker repair | Quoted | Licensed electrician | ₱1,000-₱5,000 |
| Rewiring | Quoted (diagnostic) | Licensed, TESDA preferred | ₱5,000-₱50,000 |
| Generator install | Quoted | Licensed | ₱10,000-₱50,000 |

---

# CHAPTER 9: SECURITY, FRAUD DETECTION & PLATFORM INTEGRITY

## 9.1 Platform Bypass Detection

### Message Scanning (Automated)

All in-app messages are scanned for patterns indicating off-platform coordination:

**Patterns detected:**
- Phone number formats: 09XX-XXX-XXXX, +639XXXXXXXXX, "text me at 09..."
- Email addresses: any @domain.com pattern
- Social media references: "add me on FB", "Viber", "Messenger", "Telegram", "WhatsApp"
- GCash/Maya direct payment: "send to my GCash", "Maya number", "just transfer"
- Off-platform meeting: "let's talk outside the app", "call me directly"

**Response to detection:**
- First instance: gentle warning overlay: "For your protection, SiguradoShield™ only covers bookings made through the app. Sharing contact details directly may void your coverage."
- Second instance: same warning + internal flag for monitoring
- Third instance: internal alert to admin + provider warned formally
- Message is NOT blocked (don't break the user experience) — just warned

### Behavioral Analytics

**Suspicious patterns:**
- Customer books once with a provider, then never books again but the provider's total jobs don't match their off-platform income (requires voluntary tax data — hard to detect)
- Provider's job acceptance rate drops suddenly (might be getting jobs directly)
- Customer and provider both go offline at the same time repeatedly (might be communicating off-app)
- Provider repeatedly declines auto-matched jobs but accepts custom-quoted jobs from specific customers (might be cherry-picking Suki customers for off-platform)

**Response:** Flag for manual review. These are signals, not proof. Never punish without evidence.

### GPS Validation

- Provider must check in at job location (GPS within 200m)
- Provider must check out at job location
- If provider spends <50% of estimated job duration on-site, flag for review
- If provider's GPS shows them at the same customer address on days without a platform booking, flag for review (possible off-platform repeat visit)

## 9.2 Account Security

- **Customer accounts:** Phone + OTP authentication. Optional: biometric (fingerprint/face) for app access. Session timeout: 30 days of inactivity.
- **Provider accounts:** Phone + OTP + ID verification. Session timeout: 7 days of inactivity. Must re-authenticate for: withdrawals, profile changes, accepting high-value jobs (>₱10,000).
- **Admin accounts:** Email + password + 2FA (mandatory). Session timeout: 1 hour of inactivity. All actions logged with IP address and timestamp. Cannot delete audit logs.

## 9.3 Data Security

- All data encrypted in transit (TLS 1.3)
- Sensitive data encrypted at rest: government IDs, NBI clearances, payment tokens, chat messages
- Database: PostgreSQL 18 with row-level security
- File storage: encrypted S3-compatible object storage
- Regular backups: daily automated, 30-day retention
- Access controls: role-based, principle of least privilege
- Penetration testing: before launch + annually

---

# CHAPTER 10: TECHNICAL ARCHITECTURE & AI CODER INSTRUCTIONS

## 10.1 System Architecture Overview

```
[Customer Mobile App] → [API Gateway (Node.js 24 LTS / Express 5.2)] → [PostgreSQL 18 Database]
[Provider Mobile App]  →                ↕                              → [Redis 8.6 Cache]
[Admin Web Dashboard] →  [PayMongo API]                                → [S3 File Storage]
                          [Firebase FCM]                                → [Elasticsearch 9.3 (search)]
                          [Google Maps API]                             → [Socket.io 4.8 (real-time)]
                          [SMS Gateway (Semaphore)]
```

## 10.2 Tech Stack (All versions verified as of April 14, 2026)

| Component | Technology | Version | Reason |
|---|---|---|---|
| Customer App | React Native (Expo managed) | Expo SDK 55 (RN 0.83) | Cross-platform (iOS + Android), New Architecture required |
| Provider App | React Native (Expo managed) | Expo SDK 55 (RN 0.83) | Same framework as customer app for code sharing |
| Admin Web | React + TypeScript + Tailwind CSS | React 19.0.x + TS 6.0.x + Tailwind 4.2.x | Ken's team already knows React |
| Backend API | Node.js + Express + TypeScript | Node 24 LTS + Express 5.2.x + TS 6.0.x | Node 20 EOL April 2026, Express 5 is now npm default |
| Database | PostgreSQL | 18 (latest: 18.3) | ACID-compliant, async I/O, UUIDv7, financial transactions |
| Cache | Redis | 8.6.x | Session management, rate limiting, real-time status |
| Search | Elasticsearch | 9.3.x | Full-text search for services, providers |
| Real-time | Socket.io | 4.8.x | Live chat, GPS tracking, job status updates |
| File Storage | AWS S3 or DigitalOcean Spaces | @aws-sdk/client-s3 v3 | Photos, videos, documents |
| Payment | PayMongo API | Latest SDK | Philippine payments (see Chapter 5) |
| Maps | Google Maps Platform | Latest | Geocoding, directions, distance matrix |
| Push Notifications | Firebase Cloud Messaging | Firebase JS SDK 12.12.x | iOS + Android push |
| SMS | Semaphore | Latest | OTP, critical notifications (₱0.50/credit) |
| Email | Resend or SendGrid | Resend 6.11.x / SendGrid 8.1.x | Transactional emails |
| Monitoring | Sentry + Grafana + Prometheus | Sentry 10.x + Grafana 12.4.x + Prometheus 3.11.x | Production monitoring |
| Containerization | Docker | Engine 29.x | Local dev + production deployment |
| Reverse Proxy | Nginx | 1.28.x (stable) | Load balancing, SSL termination |

## 10.3 Database Schema (Core Tables)

```sql
-- Users (both customers and providers)
users (id, type [customer|provider|admin|staff], phone, email, name, 
       avatar_url, status [active|suspended|banned], created_at, updated_at)

-- Provider-specific
providers (user_id FK, tier [new|verified|pro|elite], commission_rate, 
           nbi_clearance_url, government_id_url, selfie_url, bio, 
           service_area_lat, service_area_lng, service_area_radius_km,
           verified_at, is_company, company_name, dti_sec_number)

-- Services catalog
service_categories (id, name, slug, icon_url, display_order, is_active)
service_subcategories (id, category_id FK, name, slug, pricing_model 
                       [fixed|configurator|quoted], base_price, description)

-- Bookings
bookings (id, customer_id FK, provider_id FK, subcategory_id FK,
          status [requested|quoted|accepted|paid|in_progress|completed|
                  confirmed|disputed|cancelled|refunded],
          address_id FK, scheduled_at, started_at, completed_at,
          confirmed_at, service_price, service_fee, total_charged,
          commission_amount, provider_payout, payment_method,
          paymongo_payment_id, escrow_status [held|released|disputed|refunded])

-- Quotes (for custom-quoted services)
quotes (id, booking_id FK, provider_id FK, status [submitted|accepted|
        declined|expired], total_amount, labor_amount, materials_amount,
        estimated_days, notes, created_at, expires_at)

quote_line_items (id, quote_id FK, description, quantity, unit, 
                  unit_price, total)

-- Change orders
change_orders (id, booking_id FK, provider_id FK, description, 
               additional_amount, status [pending|approved|declined],
               photos, created_at, approved_at)

-- Wallets
wallets (id, user_id FK, type [customer|provider|platform|guarantee],
         available_balance, pending_balance, currency [PHP])

wallet_transactions (id, wallet_id FK, type [credit|debit], amount,
                     reference_type [booking|payout|refund|topup|fee|tip],
                     reference_id, description, created_at)

-- Payouts
payouts (id, provider_id FK, amount, method [gcash|maya|bank],
         destination_account, status [processing|completed|failed],
         paymongo_transfer_id, created_at, completed_at)

-- Reviews
reviews (id, booking_id FK, reviewer_id FK, reviewee_id FK,
         overall_rating, quality_rating, punctuality_rating,
         professionalism_rating, communication_rating, value_rating,
         text, photos, provider_response, created_at)

-- Disputes
disputes (id, booking_id FK, filed_by FK, type [no_show|incomplete|
          substandard|damage|theft|overcharge|other],
          description, evidence_photos, evidence_videos,
          status [open|under_review|escalated|resolved],
          tier [1|2|3], assigned_to FK, resolution_type,
          refund_amount, decision_notes, resolved_at)

-- Messages (in-app chat)
messages (id, booking_id FK, sender_id FK, receiver_id FK,
          content, content_type [text|photo|voice|system],
          has_bypass_flag, created_at, read_at)

-- Addresses
addresses (id, user_id FK, label, full_address, barangay,
           municipality, province, lat, lng, floor_unit,
           special_instructions, is_default)

-- Notifications
notifications (id, user_id FK, type, title, body, 
               data_json, is_read, created_at)

-- Audit log
audit_log (id, user_id FK, action, resource_type, resource_id,
           details_json, ip_address, created_at)
```

## 10.4 Key API Endpoints

```
Authentication:
POST /auth/send-otp          { phone }
POST /auth/verify-otp        { phone, otp }
POST /auth/refresh-token     { refresh_token }

Customer:
GET  /services/categories
GET  /services/:categoryId/subcategories
GET  /services/:subcategoryId/providers    ?lat=&lng=&date=&filters=
GET  /providers/:id
POST /bookings                             { subcategory_id, address_id, ... }
POST /bookings/:id/pay                     { payment_method }
POST /bookings/:id/confirm
POST /bookings/:id/dispute                 { type, description, evidence }
GET  /bookings/history
POST /reviews                              { booking_id, ratings, text }

Provider:
GET  /provider/jobs/available
POST /provider/jobs/:id/accept
POST /provider/jobs/:id/decline
POST /provider/jobs/:id/start
POST /provider/jobs/:id/complete           { photos }
POST /provider/jobs/:id/change-order       { description, amount, photos }
POST /quotes                               { booking_id, line_items, ... }
GET  /provider/wallet
POST /provider/wallet/withdraw             { amount, method, destination }
GET  /provider/schedule
PUT  /provider/availability                { schedule }

Admin:
GET  /admin/dashboard/kpis
GET  /admin/providers                      ?status=&tier=&filters=
PUT  /admin/providers/:id/approve
PUT  /admin/providers/:id/suspend
GET  /admin/disputes                       ?status=&priority=
PUT  /admin/disputes/:id/resolve           { resolution_type, amount, notes }
GET  /admin/financials/revenue             ?period=
GET  /admin/financials/payouts
```

## 10.5 Job State Machine

```
REQUESTED (customer submitted)
  → QUOTED (providers submitted quotes — custom jobs only)
    → ACCEPTED (customer selected a provider/quote)
      → PAID (customer paid into escrow)
        → PROVIDER_EN_ROUTE (provider heading to location)
          → IN_PROGRESS (provider started work)
            → COMPLETED (provider marked as done)
              → CONFIRMED (customer confirmed — escrow released)
                → PAID_OUT (provider withdrew funds)
              → DISPUTED (customer filed dispute)
                → RESOLVED (dispute resolved)

Cancellation can happen from: REQUESTED, QUOTED, ACCEPTED, PAID, PROVIDER_EN_ROUTE
Each cancellation state has its own refund rules (see Chapter 1)
```

---

# APPENDIX A: GOOGLE STITCH DESIGN AUDIT (17 Screens)

## Critical Issues Found Across All Screens

### Issue #1: WRONG CURRENCY (Severity: CRITICAL)
Every single screen shows US dollars ($). The entire app must use Philippine Pesos (₱). This is not a cosmetic issue — it signals to users that the app is not built for them.

**Affected screens:** ALL 17 screens
**Fix:** Replace every $ with ₱. Adjust all amounts to Philippine market pricing.

### Issue #2: WRONG GEOGRAPHY (Severity: CRITICAL)
Screens show US locations: "123 Main St, New York", "120 Pike St, Seattle, WA 98101", "San Francisco, CA 94105", "Springfield, IL"
**Fix:** All placeholder content must use Philippine locations: "Brgy. Poblacion, Cagayan de Oro", "Unit 4B, Camella Homes, Quezon City"

### Issue #3: WRONG PAYMENT METHODS (Severity: CRITICAL)
Checkout screen shows "Visa ending in 4242" as PRIMARY and "Apple Pay" as secondary.
**Fix:** GCash must be the first/primary payment method. Then Maya. Then cards. Apple Pay is irrelevant in the Philippines. Add QR Ph option.

### Issue #4: MISSING ESCROW VISIBILITY (Severity: HIGH)
No screen shows the customer that their payment is "held in escrow." This is the core trust mechanism.
**Fix:** Every payment-related screen must show escrow status: "Your ₱550 is held securely until you confirm the service is complete."

### Issue #5: NO QUOTING FLOW (Severity: HIGH)
There are NO screens for the custom quoting flow — no job request form, no quote builder, no quote comparison. This is critical for variable-price services.
**Fix:** Add 3-4 new screens: Job Request Form, Quote Builder (provider), Quote Comparison (customer), Quote Detail

### Issue #6: MISSING ~40 SCREENS (Severity: HIGH)
17 screens out of 55+ needed. Missing screens listed in Chapter 3.

## Per-Screen Audit

### customer_home_dashboard
**What's good:** Category icon grid concept, active booking card, "Quick Re-book" section, bottom navigation
**What's wrong:** USD amounts, US address, "Lawn Mowing $45" (wrong currency + price), missing search bar, missing "Suki Pros" section, promo card imagery is US-generic
**Fix:** Localize everything. Add search. Add Suki section. Use Filipino-relevant imagery in promos.

### job_request (provider view)
**What's good:** Timer countdown for response, job details layout, accept/decline buttons, estimated drive time
**What's wrong:** "$120.00" in USD, "HVAC Repair" category tag is US-centric (use "Aircon Repair"), "123 Main St, Downtown" is US address, "2.5 miles away" should be kilometers, map placeholder is blank
**Fix:** PHP amounts, PH addresses, kilometers, populated map, PH-relevant service names

### accept_decline_job
**What's good:** Countdown timer, map with route, job details, client info with rating, accept/decline buttons at bottom
**What's wrong:** "$125.00" USD, "Seattle, WA 98101" address, "5.2 mi" (should be km), notes truncated with no "read more"
**Fix:** Full localization. Show full notes. Add: estimated earnings after commission, provider's current distance from job.

### confirmation_screen
**What's good:** Checkmark success state, booking ID, pending assignment status, booking details card, map preview, satisfaction guarantee mention
**What's wrong:** "$110.00/$10.00/$120.00" USD, "New York, NY 10001" address, "Satisfaction Guarantee Included" is vague — should specifically say "SiguradoShield™ Protection"
**Fix:** PHP, PH address, specific guarantee branding, add estimated provider assignment time

### one_time_payment (checkout)
**What's good:** Clean layout, order summary with image, payment method selection, security indicator
**What's wrong:** "$120.00" USD, Visa as PRIMARY (GCash must be primary), Apple Pay shown (irrelevant), no escrow explanation, no price breakdown visible, no SiguradoShield mention
**Fix:** Complete redesign per Screen 16 specification in Chapter 3

### wallet_balance (provider)
**What's good:** Balance display, earned today/pending split, earnings chart, transaction list with status
**What's wrong:** All USD, "Chase Bank" payout reference (no Chase in PH), "Payout to Chase Bank" should be "Payout to BDO/BPI/GCash"
**Fix:** PHP, Philippine bank names, add commission breakdown per transaction, add "Withdraw to GCash" prominent button

### navigation_to_job
**What's good:** Full-screen map, route display, ETA, distance, Waze/Google Maps integration, call/message buttons
**What's wrong:** US map (Springfield, IL), "5.2 mi" (kilometers), "LIMIT 45" speed sign is US
**Fix:** Philippine map, kilometers, remove US road signs, add Philippine-relevant navigation context

### map_address_picker
**What's good:** Draggable pin concept, search bar, selected address display, confirm button
**What's wrong:** "San Francisco, CA 94105", "123 Tech Lane" — all US
**Fix:** Philippine map, PH address format, add barangay field, add landmarks/special instructions field

### tip_provider
**What's good:** Provider photo + verification badge, "100% goes to the provider" transparency, percentage presets, custom amount option
**What's wrong:** USD amounts, "John Doe" generic name, "Handyman Services" label
**Fix:** PHP amounts, Filipino name, category-specific label, add "No commission on tips" explicitly

### payout_schedule (provider)
**What's good:** Next payout estimate, processing timeline (Processed→Sent→Arriving), frequency/threshold display, payout method with verified badge, recent payouts list
**What's wrong:** All USD, "Chase Checking" (no Chase in PH), "Secured by Stripe" (using PayMongo), "Update Bank Info" should include GCash/Maya options
**Fix:** PHP, Philippine bank names (BDO, BPI, Metrobank, UnionBank), "Secured by PayMongo", payout methods include GCash/Maya prominently

### referral_program_landing_page
**What's good:** Clear value proposition, step-by-step visual, unique code display, copy button, share via channels, invite from contacts
**What's wrong:** "$20/$20" in USD, generic gift box imagery, WhatsApp shown (Filipinos use Messenger more), share channels should prioritize Facebook Messenger
**Fix:** "₱100/₱100" in PHP, Filipino-relevant imagery, share channels: Messenger (first), SMS, Facebook, WhatsApp, More

### live_chat_support
**What's good:** Agent photo + verified badge, encrypted message indicator, quick action buttons ("Where is my pro?", "Reschedule", "Upload screenshot"), ticket ID
**What's wrong:** "Sarah M." generic agent name, mostly cosmetic issues
**Fix:** Filipino agent name, add estimated wait time if not yet connected

### provider_management_table (admin)
**What's good:** Status filters (All/Pending/Verified/Suspended), provider cards with photo/rating/categories/status, action buttons (Edit/Suspend/Logs, Approve/Reject, Reactivate)
**What's wrong:** Presented as mobile view — this should be a WEB dashboard table, not a mobile screen. Admin panel should be desktop-first. Names are all Western.
**Fix:** Redesign as web table with sortable columns. Use Filipino names. Add: tier column, commission rate, total earnings, last active date.

### staff_roles_permissions
**What's good:** Role editing interface, permission checkboxes organized by category (Financial, Data Access), assigned staff list
**What's wrong:** Mobile layout for what should be a web admin screen. "Can override blocks — Bypass security locks for testing" is dangerous and should not exist in production.
**Fix:** Web layout. Remove "override blocks" permission entirely. Add: Dispute Resolution permissions, Payout permissions, Catalog Management permissions.

### global_system_settings
**What's good:** Tabs (Roles/Notifications/Audit Logs/Security), notification templates with edit buttons, system logs with timestamps and IP addresses
**What's wrong:** Mobile layout for web admin. "Admin Alex changed commission rate to 15%" — good audit logging concept.
**Fix:** Web layout. Add: payment gateway configuration, escrow timeout settings, surge pricing configuration, service area management, guarantee fund management.

### dashboard_loading_state
**What's good:** Proper skeleton loading UI that matches the dashboard layout
**What's wrong:** None — this is well-designed
**Fix:** Minimal — ensure skeleton matches the actual final dashboard layout after all the above changes

### price_breakdown_1
**Note:** This directory was empty — no screen.png found. This screen needs to be created from scratch per the Checkout specification in Chapter 3.

---

# APPENDIX B: COMPLETE SCREEN LIST WITH MISSING SCREENS IDENTIFIED

## Customer App — Missing Screens to Design

| # | Screen | Priority | Notes |
|---|--------|----------|-------|
| 1 | Splash/Loading | Medium | Simple branded loading |
| 2 | Onboarding Carousel (3 slides) | High | First impression, set expectations |
| 3 | Registration (phone + OTP) | Critical | No screen exists |
| 4 | Login | Critical | No screen exists |
| 5 | Service Subcategory List | High | After tapping a category icon |
| 6 | Service Configuration (add-ons) | High | For menu-based pricing |
| 7 | Provider Search Results | High | List of available providers |
| 8 | Provider Profile Detail | High | Full provider info before booking |
| 9 | Booking Form (fixed-price) | High | Date, time, address, options |
| 10 | Custom Job Request Form | Critical | For variable-price services — NO SCREEN EXISTS |
| 11 | Quote Comparison View | Critical | Side-by-side quotes — NO SCREEN EXISTS |
| 12 | Date/Time Picker | Medium | Standard date picker |
| 13 | Active Booking Tracker | High | Real-time provider tracking during service |
| 14 | In-Service Chat | Medium | Chat with provider during job |
| 15 | Job Completion Confirmation | High | Confirm + dispute flow entry |
| 16 | Rating & Review Form | High | Stars + text + photos |
| 17 | Booking History List | Medium | Past bookings |
| 18 | Booking Detail / Receipt | Medium | Individual booking detail |
| 19 | Customer Profile / Settings | Medium | Account management |
| 20 | Dispute Filing Form | High | File a complaint — NO SCREEN EXISTS |
| 21 | Dispute Status Tracker | Medium | Track dispute progress |

## Provider App — Missing Screens to Design

| # | Screen | Priority | Notes |
|---|--------|----------|-------|
| 1 | Provider Registration (multi-step) | Critical | NO SCREEN EXISTS |
| 2 | Verification Status Tracker | High | NO SCREEN EXISTS |
| 3 | Provider Home / Job Queue | High | Partially exists |
| 4 | Quote Builder | Critical | NO SCREEN EXISTS |
| 5 | Availability Settings | High | NO SCREEN EXISTS |
| 6 | Active Job Tracker | High | Start/progress/complete flow |
| 7 | Change Order Form | High | NO SCREEN EXISTS |
| 8 | Photo Upload (before/during/after) | Medium | NO SCREEN EXISTS |
| 9 | My Ratings & Reviews | Medium | NO SCREEN EXISTS |
| 10 | My Services & Pricing | Medium | NO SCREEN EXISTS |
| 11 | Suki Customer List | Low | Phase 2 |

## Admin Web — Missing Screens to Design

| # | Screen | Priority | Notes |
|---|--------|----------|-------|
| 1 | Admin Login (2FA) | Critical | NO SCREEN EXISTS |
| 2 | Main Dashboard (KPIs) | Critical | Exists but as mobile — need web version |
| 3 | Customer Management | High | NO SCREEN EXISTS |
| 4 | Booking Management | High | NO SCREEN EXISTS |
| 5 | Dispute Queue + Resolution | Critical | NO SCREEN EXISTS |
| 6 | Service Catalog Management | High | NO SCREEN EXISTS |
| 7 | Financial Dashboard | Critical | NO SCREEN EXISTS |
| 8 | Payout Management | High | NO SCREEN EXISTS |
| 9 | Analytics Dashboard | Medium | NO SCREEN EXISTS |
| 10 | Audit Log Viewer | Medium | Partially exists in system settings |
| 11 | Support Ticket Queue | High | NO SCREEN EXISTS |

---

# APPENDIX C: SUMMARY OF BLINDSPOTS, HOLES & RISKS

## Business Model Blindspots

1. **VAT impact on pricing:** 12% VAT on services will significantly affect your pricing. Decide: absorb VAT into service fee, or add it as a separate line item? Research if microenterprises (providers earning <₱3M/year) are VAT-exempt.

2. **Provider churn during slow months:** Some months (post-holiday, rainy season) will have low demand. Providers may leave the platform. Consider: guaranteed minimum earnings for top providers during slow months, or seasonal promotions to drive demand.

3. **Service quality inconsistency:** Different providers have wildly different skill levels. A 4.5-star cleaner and a 4.5-star plumber may have completely different quality. Consider: category-specific quality checklists, mystery shopper audits, video training modules.

4. **Multi-provider jobs:** Some jobs require multiple providers (e.g., a full house renovation needs a plumber, electrician, painter, carpenter). Current design assumes one provider per booking. Consider: "project" bookings that bundle multiple providers under one escrow.

5. **Provider tools and materials:** For many services, the provider needs tools and consumables. Who pays? If the provider, their costs eat into their earnings. If the customer, it adds complexity. Decision needed per category.

6. **Minimum viable provider density:** You need enough providers in an area to ensure reasonable wait times. If you have 5 cleaning providers and 2 are busy, customers wait. Research: minimum 3-5 active providers per category per municipality before launching.

7. **Cash-first culture:** Despite GCash's 76M users, many Filipinos (especially outside Metro Manila) still prefer cash. Your no-cash policy is strategically correct but may lose some early adopters. Consider: allow cash ONLY for first booking as a trial, then require digital payment for subsequent bookings.

## Technical Risks

1. **Internet connectivity:** Outside Metro Manila, internet can be unreliable. Ensure: offline capability for providers (cache job details), SMS fallback for notifications, low-bandwidth photo upload.

2. **GPS accuracy:** Philippine addresses can be imprecise. Many locations don't have street numbers. Ensure: pin-drop address confirmation, landmark-based directions, provider can call customer for directions.

3. **Payment gateway downtime:** PayMongo (or any gateway) can have outages. Ensure: fallback to secondary gateway (Xendit), or allow QR Ph manual payment with manual confirmation.

## Competitive Risks

1. **GoodWork expands outside Manila:** They have funding and could expand to your launch city. First-mover advantage + better escrow + insurance moat mitigates this.

2. **Facebook Marketplace / Groups:** Many home services are already traded informally in Facebook groups. Your platform needs to be significantly better than a Facebook post. The escrow + insurance + vetting is the differentiator.

3. **Grab expanding into services:** Grab has explored home services in other SEA markets. If they launch in PH, they have brand recognition and a massive user base. Your moat: specialization. You're focused 100% on home services; Grab is spread across food, transport, payments, etc.

---

*END OF DOCUMENT — Version 1.0*

*This document should be used as the master specification for all development, design, and business decisions. Each chapter can be expanded into its own detailed sub-document as development progresses.*

*Recommended next steps:*
*1. Upload your Google Stitch designs for a visual overlay comparison*
*2. Start with Chapter 3 screens at Critical priority*
*3. Set up PayMongo Platform account and test the APIs*
*4. Draft the Independent Contractor Agreement with a Philippine labor lawyer*
*5. Register your SEC corporation and begin BIR/NPC compliance*
*6. Identify your launch municipality and begin provider recruitment*
