# PHILIPPINE HOME SERVICES MARKETPLACE — EXPANSION DOCUMENT v2.0 April 14, 2026 (VERSIONS UPDATED)
# SDLC, SRS, Infrastructure, Detailed Screen Specs, Issues Database, Coding Instructions

**Companion to:** COMPLETE-PH-Home-Services-Platform-Specification.md v1.0
**Purpose:** Fill every gap, fix every vague point, add infrastructure for 1M concurrent users, full SDLC, SRS, page-by-page build plan, issues database, and step-by-step coding instructions

---

# SECTION 1: SOFTWARE DEVELOPMENT LIFECYCLE (SDLC)

## 1.1 Development Phases & Sprint Plan

### Phase 0: Foundation (Weeks 1-4) — NO CODE YET
**Objective:** Legal, business setup, design finalization

| Week | Tasks | Deliverables | Owner |
|------|-------|-------------|-------|
| 1 | SEC corporation registration, business name reservation | SEC certificate filed | Ken |
| 1 | Finalize brand name, logo, color palette, typography | Brand guidelines PDF | Designer/Ken |
| 1 | Hire/engage UX/UI designer (freelancer or agency) | Contract signed | Ken |
| 2 | BIR registration, barangay clearance, mayor's permit | Tax registration | Ken |
| 2 | PayMongo account registration + Platform API access request | PayMongo sandbox access | Ken |
| 2 | NPC registration, appoint Data Protection Officer | NPC filing | Ken/Lawyer |
| 3 | UX/UI designer produces high-fidelity mockups for ALL 55+ screens | Figma file with complete designs | Designer |
| 3 | Draft Independent Contractor Agreement (with PH labor lawyer) | Legal document | Lawyer |
| 3 | Draft Terms of Service + Privacy Policy (with PH lawyer) | Legal documents | Lawyer |
| 4 | Design review and approval | Approved Figma designs | Ken + Designer |
| 4 | Set up development environments, repos, CI/CD pipeline | Working dev environment | AI Coders |
| 4 | Finalize tech stack decisions, create project board (GitHub Projects or Linear) | Project board with all tasks | Ken |

### Phase 1: MVP Backend (Weeks 5-10)
**Objective:** Core API, database, authentication, basic booking flow

**Sprint 1 (Weeks 5-6): Core Infrastructure**
- Set up Node.js 24 LTS / Express 5.2.x / TypeScript 6.0.x project structure
- Set up PostgreSQL 18 database with schema (core tables only — use uuidv7() for PKs)
- Set up Redis 8.6 for sessions and caching
- Implement authentication (phone + OTP via Semaphore SMS)
- Implement user registration (customer + provider)
- Implement JWT token management with refresh tokens
- Set up file upload to S3-compatible storage
- Set up automated testing framework (Jest 30.x)
- Deliverable: Auth API working, can register and login

**Sprint 2 (Weeks 7-8): Service Catalog & Booking**
- Implement service categories and subcategories API
- Implement service catalog with fixed pricing
- Implement address management API
- Implement booking creation API (fixed-price services)
- Implement provider matching algorithm (v1: nearest available)
- Implement booking state machine
- Implement in-app messaging API (Socket.io)
- Deliverable: Can create a booking, get matched with a provider

**Sprint 3 (Weeks 9-10): Payments & Escrow**
- Integrate PayMongo API (payments, webhooks)
- Implement escrow flow (hold → release → payout)
- Implement wallet system (customer + provider + platform wallets)
- Implement provider payout API (to GCash/Maya/bank)
- Implement refund API
- Implement commission calculation engine
- Implement basic notification system (push via FCM)
- Deliverable: Full payment flow working end-to-end in sandbox

### Phase 2: MVP Mobile Apps (Weeks 11-18)
**Objective:** Customer app + Provider app, functional for testing

**Sprint 4 (Weeks 11-12): Customer App Core**
- Splash screen, onboarding walkthrough, registration, login
- Home dashboard with category grid
- Service browsing and selection
- Address picker (Google Maps integration)
- Booking form (fixed-price services)
- Checkout/payment screen (PayMongo integration)
- Booking confirmation screen

**Sprint 5 (Weeks 13-14): Customer App Completion**
- Active booking tracker (real-time provider location)
- In-service chat
- Job completion confirmation
- Rating and review submission
- Tip provider
- Booking history
- Customer wallet
- Profile and settings
- Push notifications

**Sprint 6 (Weeks 15-16): Provider App Core**
- Provider registration (multi-step with document upload)
- Verification status tracker
- Provider home / job queue
- Job notification with accept/decline
- Navigation to job (Google Maps / Waze integration)
- Active job tracker (start/progress/complete)
- Photo upload (before/during/after)
- Provider wallet and earnings dashboard

**Sprint 7 (Weeks 17-18): Provider App Completion**
- Withdrawal to GCash/Maya/bank
- Payout history
- Schedule/availability settings
- Ratings and reviews view
- Provider profile editing
- Provider settings
- Push notifications

### Phase 3: Admin Panel + Custom Quoting (Weeks 19-24)
**Objective:** Admin web dashboard, custom quote flow, dispute system

**Sprint 8 (Weeks 19-20): Admin Panel**
- Admin login with 2FA
- Main dashboard with KPIs
- Provider management (list + detail + approve/reject/suspend)
- Customer management
- Booking management
- Service catalog management (CRUD)

**Sprint 9 (Weeks 21-22): Custom Quoting & Dispute Resolution**
- Job request form (customer submits custom job with photos/video)
- Quote builder (provider submits structured quote)
- Quote comparison view (customer compares + selects)
- Change order system
- Dispute filing flow (customer)
- Dispute resolution interface (admin)
- Automated dispute resolution (Tier 1)

**Sprint 10 (Weeks 23-24): Polish & Launch Prep**
- Financial dashboard + reports
- Payout management interface
- Notification template management
- Referral program implementation
- Suki loyalty system implementation
- Bug fixes from internal testing
- Performance optimization
- Security audit
- Load testing
- App store submission prep (Google Play + Apple App Store)

### Phase 4: Soft Launch (Weeks 25-28)
**Objective:** Launch in one municipality with 20-50 providers

- Recruit and onboard 20-50 providers in launch city
- Run closed beta with 100 invited customers
- Monitor all metrics: booking success rate, payment success rate, average response time, crash rate
- Fix bugs discovered in beta
- Adjust pricing based on market feedback
- Submit to Google Play Store and Apple App Store
- Public launch in target municipality

### Phase 5: Growth & Optimization (Weeks 29-52)
**Objective:** Scale to multiple cities, add features, optimize

- Months 7-8: Add recurring bookings, subscription services
- Months 9-10: Add B2B/commercial tier
- Months 11-12: Expand to 2-3 additional municipalities
- Ongoing: Performance optimization, new service categories, provider tools enhancement

---

## 1.2 Team Composition

**For AI-coder-driven development (Ken's model):**

| Role | Who | Responsibilities |
|------|-----|-----------------|
| Product Owner / Director | Ken | All decisions, QA review, prompt engineering, direction |
| AI Coders | Cursor / Claude Code / Copilot | All code generation under Ken's direction |
| UX/UI Designer | Freelancer (Filipino preferred) | Figma mockups, design system, icon set |
| Philippine Labor Lawyer | Engaged consultant | IC agreement, ToS, compliance review |
| QA Tester | Ken + 1-2 beta testers | Manual testing, bug reporting |
| Data Protection Officer | Ken or designated staff | NPC compliance (can be part-time) |

---

# SECTION 2: SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## 2.1 Functional Requirements (FR)

### FR-001 through FR-050: Authentication & User Management

**FR-001:** System SHALL allow customer registration via Philippine mobile number (+63) with OTP verification
- Input: 10-11 digit phone number (09XX or 9XX format)
- OTP delivery: via SMS using Semaphore API (primary Philippine SMS gateway, ₱0.50/credit)
- OTP length: 6 digits
- OTP expiry: 5 minutes
- Max OTP attempts: 3 per session, then 15-minute lockout
- Max OTP requests: 5 per hour per phone number

**FR-002:** System SHALL allow provider registration via mobile number with multi-step verification
- Step 1: Phone + OTP (same as customer)
- Step 2: Personal info (name, email, address, DOB)
- Step 3: Service categories selection (multi-select from catalog)
- Step 4: Service area definition (map with adjustable radius, min 1km, max 25km)
- Step 5: Government ID upload (JPEG/PNG, max 5MB, front + back)
- Step 6: NBI clearance upload (JPEG/PNG, max 5MB)
- Step 7: Selfie for ID matching (camera capture, not gallery)
- Step 8: Bank/GCash/Maya details for payouts
- Step 9: Agreement to Independent Contractor Agreement + Terms of Service
- Status after completion: PENDING_REVIEW

**FR-003:** System SHALL support role-based access control with the following roles:
- CUSTOMER: can book, pay, review, dispute, manage own account
- PROVIDER: can accept jobs, submit quotes, manage availability, withdraw funds
- PROVIDER_COMPANY: all PROVIDER permissions + team management
- SUPPORT_AGENT: can view bookings, chat with users, create tickets, process simple refunds
- MODERATOR: can review flagged content, resolve Tier 1-2 disputes
- FINANCE: can view financial reports, manage payouts, process refunds
- ADMIN: all permissions including system configuration
- SUPER_ADMIN: all ADMIN + can create/modify admin accounts, access audit logs, delete data

**FR-004:** System SHALL implement session management with:
- JWT access token: 15-minute expiry
- JWT refresh token: 30-day expiry (customer), 7-day expiry (provider), 1-hour expiry (admin)
- Concurrent session limit: 3 devices per customer, 2 devices per provider, 1 device per admin
- Session revocation: on password change, on suspicious activity detection, on admin action

**FR-005 through FR-010:** [Profile management, address management, payment method management - detailed field-level specifications]

### FR-050 through FR-100: Booking & Service Delivery

**FR-050:** System SHALL support three booking types:
- Type A: FIXED_PRICE — customer selects service, sees price, books instantly
- Type B: CONFIGURED_PRICE — customer selects options via configurator, price calculated, books
- Type C: CUSTOM_QUOTE — customer submits job request, providers submit quotes, customer selects

**FR-051:** For Type A bookings, the matching algorithm SHALL:
1. Filter providers by: service category match AND service area overlap AND availability on requested date/time AND status = ACTIVE AND tier >= minimum_tier_for_category
2. Score remaining providers by: (rating × 0.4) + (distance_inverse × 0.3) + (acceptance_rate × 0.2) + (tier_bonus × 0.1)
3. Offer job to highest-scored provider first
4. If provider doesn't respond within 45 seconds, offer to next provider
5. If no provider accepts within 5 minutes, notify customer: "No providers available for this time. Would you like to try a different time?"
6. Maximum 10 provider attempts per booking before failing

**FR-052:** For Type C bookings, the quoting system SHALL:
1. Customer submits: category, description (50-500 chars), photos (2-10, JPEG/PNG, max 5MB each), video (optional, max 60 sec, max 50MB), location, urgency, budget range (optional)
2. System broadcasts to matching providers (max 20 notified, max 5 can quote)
3. Provider quote includes: line items (1-20), each with description + quantity + unit + unit_price, total, estimated_days, notes, optional portfolio photos
4. Quotes expire after 48 hours if not accepted
5. Customer can: accept one quote, decline all, chat with quoting providers
6. Upon acceptance: customer pays quoted amount + service fee into escrow

**FR-053:** Booking state machine SHALL enforce these transitions ONLY:
```
REQUESTED → QUOTED (only for Type C)
REQUESTED → MATCHED (only for Type A/B, when provider accepts)
QUOTED → ACCEPTED (customer selects a quote)
MATCHED → PAYMENT_PENDING
ACCEPTED → PAYMENT_PENDING
PAYMENT_PENDING → PAID (payment succeeds)
PAYMENT_PENDING → PAYMENT_FAILED (payment fails — return to PAYMENT_PENDING)
PAID → PROVIDER_EN_ROUTE (provider starts navigation)
PROVIDER_EN_ROUTE → PROVIDER_ARRIVED (GPS check-in within 200m of job location)
PROVIDER_ARRIVED → IN_PROGRESS (provider taps "Start")
IN_PROGRESS → COMPLETED_BY_PROVIDER (provider taps "Complete" + uploads photos)
COMPLETED_BY_PROVIDER → CONFIRMED (customer confirms within 24h OR auto-confirm)
COMPLETED_BY_PROVIDER → DISPUTED (customer files dispute within 48h)
CONFIRMED → PAYOUT_READY (escrow released to provider wallet)
PAYOUT_READY → PAID_OUT (provider withdraws)
DISPUTED → RESOLVED (dispute resolution complete)

Cancellation transitions (from any pre-completion state):
REQUESTED/QUOTED/MATCHED/PAYMENT_PENDING → CANCELLED_BY_CUSTOMER
PAID/PROVIDER_EN_ROUTE → CANCELLED_BY_CUSTOMER (with applicable cancellation fee)
Any state → CANCELLED_BY_PROVIDER (with applicable penalties)
Any state → CANCELLED_BY_ADMIN (admin override)
```

**FR-054:** Invalid state transitions SHALL be rejected by the API with HTTP 409 Conflict and logged as a security event.

### FR-100 through FR-150: Payment & Financial

**FR-100:** System SHALL support the following payment methods for customers:
- GCash (via PayMongo E-wallet source)
- Maya (via PayMongo E-wallet source)
- Credit/Debit card — Visa, Mastercard (via PayMongo card source)
- QR Ph (via PayMongo QR Ph source)
- Platform wallet balance (internal)
- Over-the-counter (7-Eleven, Cebuana, M Lhuillier — via PayMongo OTC source, for wallet top-up only)

**FR-101:** System SHALL implement escrow with the following rules:
- Customer payment goes to platform's PayMongo wallet
- Funds are tagged as "escrow_booking_{id}" in internal ledger
- Upon customer confirmation: platform deducts commission, transfers remainder to provider sub-wallet
- Commission is calculated as: service_price × commission_rate_for_provider_tier
- Service fee is calculated as: service_price × service_fee_rate_for_category
- Provider receives: service_price - commission
- Platform retains: commission + service_fee
- Guarantee fund allocation: 1.5% of service_fee goes to guarantee_fund_wallet

**FR-102:** Cancellation refund rules:
| Cancellation Timing | Customer Refund | Provider Compensation |
|---------------------|----------------|----------------------|
| >24h before scheduled time | 100% | ₱0 |
| 2-24h before | 100% | ₱0 |
| 1-2h before | 90% | 10% of service price |
| 30min-1h before | 80% | 20% of service price |
| <30min before or after provider en route | 70% | 30% of service price |
| After provider arrived | 50% | 50% of service price |
| Customer no-show (provider at location, customer unresponsive for 30min) | 0% | 100% of service price |

**FR-103:** Provider payout methods SHALL include:
- GCash: instant transfer, no fee, min ₱100, max ₱100,000/day (GCash limit for basic verified)
- Maya: instant transfer, no fee, min ₱100
- Bank transfer (InstaPay): 1-2 business days, no fee from platform, min ₱100
- Bank transfer (PESONet): next business day, no fee, min ₱100
- Check pickup: for providers without digital wallets (Phase 2, manual process)

### FR-150 through FR-200: Reviews, Ratings, Reputation

**FR-150:** After job confirmation, customer SHALL be prompted to rate provider with:
- Overall rating: 1-5 stars (REQUIRED)
- Subcategory ratings (OPTIONAL, shown as expandable):
  - Quality of work (1-5)
  - Punctuality (1-5)
  - Professionalism (1-5)
  - Communication (1-5)
  - Value for money (1-5)
- Written review: optional, 20-1000 characters if provided
- Photos: optional, max 5, JPEG/PNG, max 5MB each
- Review is immutable after 7 days

**FR-151:** Provider CAN respond to any review ONCE with:
- Text response: 20-500 characters
- Response is visible to all users viewing the review
- Response cannot be edited or deleted by provider after 24 hours

**FR-152:** Review moderation:
- Auto-flag reviews containing: profanity (Filipino + English wordlist), personal information (phone numbers, addresses), threats or harassment (keyword + ML detection)
- Flagged reviews held for moderation (not visible until approved)
- Moderator can: approve, edit (removing offending content), reject (with reason to reviewer)

**FR-153:** Provider rating SHALL be calculated as:
- Overall = weighted average of last 50 reviews (more recent = higher weight)
- New providers (< 5 reviews): show "New" badge instead of rating
- Rating updates: recalculated after each new review (not batch)
- Provider with rating < 3.5 for 10+ consecutive reviews: auto-flagged for admin review
- Provider with rating < 3.0 at any point: auto-suspended pending review

---

## 2.2 Non-Functional Requirements (NFR)

**NFR-001: Performance**
- API response time: p50 < 200ms, p95 < 500ms, p99 < 1000ms
- Page load time (mobile app): < 3 seconds on 3G connection
- Search results: < 1 second
- Real-time updates (GPS, chat): < 2 second latency
- Payment processing: < 5 seconds end-to-end
- Photo upload: < 10 seconds for 5MB image on 4G

**NFR-002: Scalability**
- System SHALL support 1,000,000 concurrent users
- System SHALL support 100,000 active bookings simultaneously
- System SHALL support 10,000 transactions per second (payments)
- System SHALL scale horizontally without downtime

**NFR-003: Availability**
- System uptime: 99.9% (maximum 8.76 hours downtime per year)
- Planned maintenance window: Sunday 2:00-4:00 AM PHT
- Payment system availability: 99.95%
- No single point of failure for any critical path

**NFR-004: Security**
- All data encrypted in transit (TLS 1.3)
- Sensitive data encrypted at rest (AES-256): government IDs, NBI clearances, payment tokens
- PCI DSS compliance for payment data (handled by PayMongo — we never touch card numbers)
- OWASP Top 10 protection
- Rate limiting: 100 requests/minute per user, 10 requests/minute for auth endpoints
- SQL injection prevention (parameterized queries only)
- XSS prevention (input sanitization + CSP headers)
- CSRF protection (double-submit cookie)

**NFR-005: Data Retention**
- Active user data: retained indefinitely while account is active
- Deleted user data: anonymized after 30-day cooling period, permanently deleted after 1 year
- Chat messages: retained for 2 years for dispute purposes, then deleted
- Government IDs and NBI clearances: retained while provider is active, deleted 90 days after account deactivation
- Financial records: retained for 10 years (BIR requirement)
- Audit logs: retained for 5 years

**NFR-006: Accessibility**
- WCAG 2.1 Level AA compliance
- Support for screen readers (Android TalkBack, iOS VoiceOver)
- Minimum touch target: 44×44 points
- Color contrast ratio: minimum 4.5:1 for text, 3:1 for large text
- All images have alt text
- All forms have labels

**NFR-007: Language**
- App language: English only (all Philippine apps use English as the universal UI language)
- No i18n framework, translation files, or language switcher needed
- Date format: Month DD, YYYY (or DD/MM/YYYY with locale toggle)
- Time format: 12-hour with AM/PM
- Currency: ₱ (PHP) only — no other currencies
- Number format: comma for thousands (₱1,000.00)
- Phone format: +63 9XX XXX XXXX

---

# SECTION 3: INFRASTRUCTURE FOR 1,000,000 CONCURRENT USERS

## 3.1 Scaling Stages

The infrastructure scales in stages. DON'T build for 1M users on day one — that's premature optimization. Build for the current stage and have a clear plan for the next.

### Stage 1: Launch (0-1,000 users)
**Monthly infra cost: ~₱15,000-₱25,000 ($300-$500)**

```
[Customer App] ──→ [Single App Server]       ──→ [PostgreSQL 18]
[Provider App]  ──→ [Node.js 24 + Express 5]  ──→ [Redis 8.6 (single instance)]
[Admin Web]     ──→ [on same server]          ──→ [S3 storage]
                    [Nginx 1.28 reverse proxy]
```

- 1× DigitalOcean Droplet (4 vCPU, 8GB RAM): $48/month
- 1× Managed PostgreSQL 18 (1GB RAM, 10GB storage): $15/month
- 1× Redis 8.6 (1GB): $10/month via DigitalOcean or self-hosted on same server
- S3-compatible storage (DigitalOcean Spaces): $5/month
- Domain + SSL: $10/year
- SMS (Semaphore): ~₱0.35/SMS × estimated 500 OTPs/month = ₱175/month
- Firebase FCM: free tier
- Google Maps: $200/month free credit covers ~28,000 map loads

### Stage 2: Growth (1,000-10,000 users)
**Monthly infra cost: ~₱50,000-₱100,000 ($1,000-$2,000)**

```
[CDN (Cloudflare)]
        │
[Load Balancer (Nginx)]
    ┌───┴───┐
[App Server 1] [App Server 2]
    └───┬───┘
    [Redis Cluster]
    [PgBouncer]
    ┌───┴───┐
[PostgreSQL Primary] → [PostgreSQL Read Replica]
    [S3 Storage]
    [Message Queue (BullMQ on Redis)]
```

- 2× App servers (4 vCPU, 8GB RAM each): $96/month
- 1× Load balancer: $12/month
- 1× PostgreSQL primary (4GB RAM, 50GB storage): $60/month
- 1× PostgreSQL read replica: $60/month
- 1× Redis (2GB, high availability): $25/month
- CDN (Cloudflare Pro): $20/month
- S3 storage: $10/month
- Monitoring (Grafana Cloud free tier): $0

### Stage 3: Scale (10,000-100,000 users)
**Monthly infra cost: ~₱250,000-₱500,000 ($5,000-$10,000)**

```
[CDN (Cloudflare Pro)]
        │
[Application Load Balancer]
    ┌───┼───┼───┼───┐
[App 1] [App 2] [App 3] [App N] (auto-scale 3-8)
    └───────┬───────┘
    [Redis Cluster (3 nodes)]
    [PgBouncer (connection pooling)]
    ┌───────┴───────┐
[PostgreSQL Primary] → [Read Replica 1] [Read Replica 2]
    │
[Background Workers (BullMQ)]
    │
[Elasticsearch 9.3 (search)]
    │
[S3 Storage + CDN for images]
```

Key changes at this stage:
- Auto-scaling app servers (min 3, max 8)
- PgBouncer 1.25.x for connection pooling (critical — PostgreSQL can't handle 1000s of direct connections)
- 2 read replicas for read-heavy queries (provider search, booking history)
- Elasticsearch 9.3.x for full-text search
- Background workers (BullMQ 5.73.x on Redis 8.6) for: email sending, SMS sending, notification delivery, report generation
- Separate servers for real-time (Socket.io 4.8.x) vs REST API

### Stage 4: Enterprise (100,000-1,000,000 users)
**Monthly infra cost: ~₱2,500,000-₱5,000,000 ($50,000-$100,000)**

```
[Global CDN (Cloudflare Enterprise)]
            │
[GeoDNS / Global Load Balancer]
    ┌───────┴───────┐
[Luzon Region]    [Visayas/Mindanao Region]
    │                    │
[Regional LB]       [Regional LB]
    │                    │
[App Cluster         [App Cluster
 Auto-scale           Auto-scale
 5-20 nodes]          5-20 nodes]
    │                    │
[Redis Cluster       [Redis Cluster
 6 nodes]             6 nodes]
    │                    │
[PgBouncer]          [PgBouncer]
    │                    │
[PostgreSQL          [PostgreSQL
 Primary +            Read Replicas
 2 Read Replicas]     (logical replication
    │                  from primary)]
    │
[Kafka 4.2 / RabbitMQ (event streaming)]
    │
[Elasticsearch 9.3 Cluster (3 nodes)]
    │
[S3 + CloudFront for media]
    │
[Monitoring: Prometheus 3.11 + Grafana 12.4 + Sentry 10.x + PagerDuty]
```

Key changes at this stage:
- Multi-region deployment (at minimum 2 AWS/GCP regions in Philippines or Singapore)
- PostgreSQL 18 sharding by region or entity type (bookings sharded by date range, users by ID hash)
- PgBouncer 1.25.x managing 100,000+ connections multiplexed to 200 actual DB connections
- Kafka 4.2 for event streaming (booking events, payment events, notification events)
- Microservice extraction: split monolith into: Auth Service, Booking Service, Payment Service, Notification Service, Search Service, Chat Service
- Kubernetes 1.35.x (EKS/GKE) for container orchestration
- Docker Engine 29.x for containerization
- Each microservice auto-scales independently

## 3.2 Database Design for Scale

### Connection Pooling (CRITICAL for PostgreSQL)

PostgreSQL 18 handles hundreds of connections well, thousands badly. At 1M users, you might have 50,000 concurrent database queries.

**Solution: PgBouncer 1.25.x** (supports LDAP auth, direct TLS, SCRAM authentication)
```ini
[databases]
homeservices = host=primary.db port=7383 dbname=homeservices

[pgbouncer]
pool_mode = transaction          # Release connection after each transaction
max_client_conn = 100000         # Accept up to 100K app connections
default_pool_size = 100          # Only 100 actual PostgreSQL connections
reserve_pool_size = 20           # Extra connections for spikes
server_idle_timeout = 300        # Close idle connections after 5 min
```

### Table Partitioning (for tables that grow unbounded)

**Bookings table:** Partition by month (range partitioning on created_at)
```sql
-- PostgreSQL 18: use uuidv7() for time-sortable UUIDs with better index performance
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'requested',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ... other columns
) PARTITION BY RANGE (created_at);

CREATE TABLE bookings_2026_04 PARTITION OF bookings
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE bookings_2026_05 PARTITION OF bookings
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- Auto-create future partitions via cron job or pg_partman extension
```

**Messages table:** Partition by month (highest volume table)
```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

**Wallet transactions:** Partition by month
**Audit log:** Partition by month, with automatic drop of partitions older than 5 years

### Essential Indexes

```sql
-- Users
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_type_status ON users(type, status);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Providers
CREATE INDEX idx_providers_tier ON providers(tier);
CREATE INDEX idx_providers_location ON providers USING GIST (
    ST_MakePoint(service_area_lng, service_area_lat)
);  -- PostGIS spatial index for location-based queries

-- Bookings
CREATE INDEX idx_bookings_customer ON bookings(customer_id, created_at DESC);
CREATE INDEX idx_bookings_provider ON bookings(provider_id, created_at DESC);
CREATE INDEX idx_bookings_status ON bookings(status) WHERE status NOT IN ('confirmed', 'paid_out', 'cancelled');
CREATE INDEX idx_bookings_scheduled ON bookings(scheduled_at) WHERE status IN ('paid', 'provider_en_route');

-- Provider-service mapping
CREATE INDEX idx_provider_services ON provider_services(subcategory_id, provider_id);

-- Messages
CREATE INDEX idx_messages_booking ON messages(booking_id, created_at);

-- Reviews
CREATE INDEX idx_reviews_provider ON reviews(reviewee_id, created_at DESC);
CREATE INDEX idx_reviews_rating ON reviews(reviewee_id, overall_rating);

-- Wallet transactions
CREATE INDEX idx_wallet_txn_wallet ON wallet_transactions(wallet_id, created_at DESC);

-- Disputes
CREATE INDEX idx_disputes_status ON disputes(status, created_at);
CREATE INDEX idx_disputes_booking ON disputes(booking_id);
```

### Read/Write Splitting

```typescript
// In Node.js 24 LTS application code (ES modules)
import { Pool } from 'pg';

const writePool = new Pool({
  host: process.env.DB_PRIMARY_HOST,
  database: 'homeservices',
  max: 20,  // Limited write connections
});

const readPool = new Pool({
  host: process.env.DB_REPLICA_HOST,
  database: 'homeservices',
  max: 50,  // More read connections
});

// Usage
async function getProviderProfile(id) {
  return readPool.query('SELECT * FROM providers WHERE user_id = $1', [id]);
}

async function createBooking(data) {
  return writePool.query('INSERT INTO bookings (...) VALUES (...)', [...]);
}
```

### Redis Caching Strategy

```
Cache Key Pattern → TTL → Purpose
──────────────────────────────────────────────────────
user:{id}:profile         → 1 hour    → User profile data
provider:{id}:profile     → 30 min    → Provider profile (changes more often)
provider:{id}:rating      → 5 min     → Calculated rating (refreshed often)
service:categories        → 24 hours  → Category list (rarely changes)
service:subcategories:{id}→ 24 hours  → Subcategory list
booking:{id}:status       → 5 min     → Current booking status
provider:{id}:location    → 10 sec    → Real-time GPS (very short TTL)
search:providers:{hash}   → 5 min     → Search results (hash of query params)
session:{token}           → per JWT   → Session data
rate_limit:{ip}           → 1 min     → Rate limiting counter
```

Cache invalidation: when data changes, delete the relevant cache key. The next read will miss the cache and re-populate from database.

---

# SECTION 4: DETAILED SCREEN SPECIFICATIONS (EVERY STATE)

## 4.1 Screen Specification Format

Every screen is documented with:
- **Purpose**: What this screen does
- **Entry points**: How does the user get here
- **Layout**: Exact component hierarchy
- **States**: Empty, Loading, Loaded, Error, Offline
- **Interactions**: Every tap, swipe, scroll behavior
- **Data requirements**: What API calls are needed
- **Validation**: Every field's validation rules
- **Error handling**: What happens when things fail
- **Edge cases**: Every unusual scenario
- **AI Coder instruction**: Exact specification for implementation

## 4.2 Screen: Customer Home Dashboard (DETAILED)

### Purpose
The primary screen after login. Must enable: quick booking, status check on active jobs, rebooking, and discovery.

### Entry Points
- After login/registration
- Tap "Home" tab in bottom navigation
- Back from any sub-screen

### Layout (Component Tree)
```
SafeAreaView
├── StatusBar (light-content on colored header)
├── HeaderBar
│   ├── UserAvatar (32×32, circular, tap → Profile screen)
│   ├── LocationSelector (tap → Address picker)
│   │   ├── "Current Location" label (12pt, gray)
│   │   └── "Brgy. Poblacion, CDO" (14pt, bold, with ▼ dropdown icon)
│   └── NotificationBell (tap → Notifications screen)
│       └── Badge (red circle with count, hidden if 0)
├── ScrollView (pull-to-refresh enabled)
│   ├── ActiveBookingCard (CONDITIONAL — only if active booking exists)
│   │   ├── StatusBadge ("Confirmed" | "En Route" | "In Progress")
│   │   ├── ServiceName ("House Cleaning", 18pt, bold, white)
│   │   ├── StatusText ("Sarah J. is on the way", 14pt, white 70%)
│   │   ├── ProviderRow
│   │   │   ├── ProviderAvatar (28×28, circular)
│   │   │   ├── ProviderName (14pt, white)
│   │   │   └── "Track Status" button (outlined, white)
│   │   └── ScheduleText ("Today, 2:00 PM", 12pt, white 70%)
│   │   [Background: gradient blue, rounded corners 12px, shadow]
│   │   [Swipeable if multiple active bookings — dot indicators]
│   │
│   ├── SectionHeader ("What do you need?", 18pt, bold)
│   ├── CategoryGrid (4 columns, 2 rows visible + scroll for more)
│   │   ├── CategoryItem × 8+ [icon (40×40) + label (11pt)]
│   │   │   Cleaning | Plumbing | Electrical | Painting
│   │   │   Aircon   | Pest     | Moving     | More ▸
│   │   └── [Tap → Service Subcategory screen]
│   │
│   ├── SearchBar (tap → Search screen, 48px height)
│   │   └── Placeholder: "Search services or providers..."
│   │
│   ├── PromoCarousel (CONDITIONAL — only if active promos)
│   │   ├── PromoCard × N (horizontal scroll, snap)
│   │   │   ├── Image (full-width, 160px height, rounded 12px)
│   │   │   ├── Badge ("PROMO" | "NEW" | "LIMITED")
│   │   │   ├── Headline (16pt, bold)
│   │   │   ├── Subtext (13pt, gray)
│   │   │   └── CTA button
│   │   └── Dot indicators
│   │
│   ├── SectionHeader ("Your Suki Pros", 16pt) + "See all >"
│   │   [CONDITIONAL — only if customer has 3+ completed jobs with any provider]
│   ├── SukiProviderScroll (horizontal)
│   │   ├── ProviderMiniCard × N
│   │   │   ├── Avatar (48×48)
│   │   │   ├── Name (13pt, bold)
│   │   │   ├── Category (11pt, gray)
│   │   │   ├── Rating (⭐ 4.8)
│   │   │   └── "Book" button (small, outlined)
│   │   └── [Tap card → Provider Profile]
│   │
│   ├── SectionHeader ("Quick Re-book", 16pt) + "See all >"
│   │   [CONDITIONAL — only if customer has past bookings]
│   ├── RebookScroll (horizontal)
│   │   ├── RebookCard × 3 (last 3 bookings)
│   │   │   ├── ServiceIcon (32×32)
│   │   │   ├── ServiceName (13pt, bold)
│   │   │   ├── ProviderName (11pt, gray)
│   │   │   ├── Price (14pt, bold, ₱)
│   │   │   └── "Book Again" button (outlined)
│   │   └── [Tap → Pre-filled booking form]
│   │
│   └── Spacer (80px — to clear bottom nav)
│
└── BottomNavigation (fixed, elevated shadow)
    ├── HomeTab (icon + "Home", active = brand color)
    ├── BookingsTab (icon + "Bookings", badge if active)
    ├── WalletTab (icon + "Wallet")
    └── ProfileTab (icon + "Profile")
```

### States

**Loading State:**
```
Skeleton placeholders matching exact layout:
- Header: circle + rectangle + circle
- Active Booking: full-width rounded rectangle (160px)
- Category Grid: 8 rounded squares in 4×2 grid
- Promo: full-width rounded rectangle (160px)
- Re-book: 3 cards in horizontal scroll
Bottom nav: visible, non-interactive
```

**Empty State (new user, no bookings):**
```
- No ActiveBookingCard
- No SukiProviderScroll (section hidden entirely)
- No RebookScroll (section hidden entirely)
- Category Grid: shown
- PromoCarousel: shown with "first booking" promo prominent
- Below categories: illustration + "Book your first service!" + CTA button
```

**Error State (API failure):**
```
- Full screen error overlay (behind bottom nav)
- Illustration: sad phone/cloud icon
- Text: "Something went wrong. Please try again."
- "Retry" button
- Pull-to-refresh also retries
```

**Offline State:**
```
- Banner at top: "You're offline. Some features may not be available."
- Cached data shown if available (categories always cached)
- Active booking shown from local cache
- Booking/payment buttons disabled
```

### Data Requirements
```
API calls on screen load:
1. GET /bookings/active → active booking(s) for this customer
2. GET /services/categories → category list (cached 24h)
3. GET /promotions/active → active promos for customer's area
4. GET /customer/suki-providers → providers with 3+ completed jobs (if any)
5. GET /bookings/recent?limit=3 → last 3 completed bookings for re-book

Parallel calls: all 5 fire simultaneously
Cache: categories cached 24h, promos cached 1h, others cached 5 min
```

### AI Coder Instruction
```
Build this screen using React Native 0.83 (Expo SDK 55, New Architecture) with:
- FlatList for the main scroll (NOT ScrollView — FlatList has better performance)
- Animated skeleton placeholders during loading
- RefreshControl for pull-to-refresh
- All text in plain English directly in JSX (no i18n framework)
- All colors from a theme/design-token file
- All spacing from a spacing scale (4, 8, 12, 16, 24, 32, 48)
- Horizontal scrolls use FlatList with horizontal={true} and snapToInterval
- Category grid uses FlatList with numColumns={4}
- Active booking card background: LinearGradient from brand-blue to brand-blue-dark
- CURRENCY IS ALWAYS ₱ (PHP) — never $
- All prices formatted with: new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
```

---

# SECTION 5: ISSUES DATABASE — 500 IDENTIFIED PROBLEMS

## 5.1 Critical Issues (Must Fix Before Launch)

| # | Category | Issue | Impact | Fix |
|---|----------|-------|--------|-----|
| 1 | Currency | All Stitch screens use USD ($) instead of PHP (₱) | Users won't trust the app | Global find-replace, use Intl.NumberFormat with PHP |
| 2 | Payments | No GCash integration shown in checkout | 76M GCash users can't pay | GCash must be primary payment method |
| 3 | Payments | No Maya integration shown | 47M Maya users can't pay | Maya must be secondary payment method |
| 4 | Payments | Apple Pay shown (irrelevant in PH) | Confuses users, wastes screen space | Remove, replace with QR Ph |
| 5 | Escrow | No escrow status visible to users | Core trust mechanism invisible | Show escrow status on every booking screen |
| 6 | Geography | All addresses are US format | App looks foreign, not localized | Philippine address format (barangay, municipality, province) |
| 7 | Geography | Distance shown in miles | Philippines uses kilometers | Convert all distances to km |
| 8 | Quoting | No quote submission flow for providers | Cannot handle variable-price services | Build complete quote builder screen |
| 9 | Quoting | No quote comparison for customers | Customers can't choose between quotes | Build comparison screen |
| 10 | Registration | No customer registration screen | Users can't sign up | Build registration flow |
| 11 | Registration | No provider registration flow | Providers can't join | Build multi-step registration |
| 12 | Verification | No provider verification status screen | Providers don't know their status | Build verification tracker |
| 13 | Disputes | No dispute filing screen | Customers can't complain | Build dispute flow |
| 14 | Reviews | No review submission screen | No feedback loop | Build rating + review screen |
| 15 | Search | No search functionality | Users can't find services | Build search screen |
| 16 | Admin | Admin screens shown as mobile | Admin panel must be web/desktop | Redesign all admin screens for web |
| 17 | Security | Staff role "Can override blocks" exists | Massive security hole | Remove this permission entirely |
| 18 | Legal | No Terms of Service link in checkout | Legal requirement in Philippines | Add ToS + Privacy Policy links |
| 19 | Legal | No Privacy Policy consent at registration | NPC/DPA violation | Add explicit consent checkbox |
| 20 | Tax | No VAT handling in pricing | BIR compliance issue | Decide VAT strategy (inclusive vs additive) |

## 5.2 High Issues (Fix Before Beta)

| # | Issue | Fix |
|---|-------|-----|
| 21 | No loading states defined for any screen | Add skeleton loading for every screen |
| 22 | No error states defined for any screen | Add error + retry for every screen |
| 23 | No offline handling | Cache critical data, show offline banner |
| 24 | No empty states (new user with no history) | Design empty states for all list screens |
| 25 | No push notification handling (what happens when user taps notification) | Define deep-link targets for each notification type |
| 26 | No image compression before upload | Users on slow connections will timeout on photo uploads |
| 27 | No maximum file size enforcement on photo upload | Could crash app or overload storage |
| 28 | No photo orientation correction | Photos from some Android phones appear rotated |
| 29 | Provider rating shown as "$4.9" not "⭐ 4.9" | Stitch design bug |
| 30 | No back button navigation defined | Users will get stuck |
| 31 | No deep linking scheme defined | Can't link to specific screens from notifications/emails |
| 32 | Booking ID format "#HG-2023-8892" — year is 2023 | Should be dynamic, auto-generated |
| 33 | No booking cancellation flow | Missing critical user story |
| 34 | No provider cancellation handling | What happens when provider cancels mid-job |
| 35 | No GPS permission request flow | App needs to request GPS — what if user denies? |
| 36 | No camera permission request flow | Photo upload needs camera access |
| 37 | No notification permission request flow | iOS requires explicit permission |
| 38 | Chat has no read receipts | Users don't know if message was seen |
| 39 | Chat has no typing indicator | Users think the other person isn't responding |
| 40 | No "provider is typing" in customer chat | Missing real-time feedback |
| 41-50 | No date/time picker localized for PH timezone (PHT, UTC+8) | All dates must use Asia/Manila timezone |

## 5.3 Medium Issues (51-200)

| Range | Category | Issues |
|-------|----------|--------|
| 51-70 | Accessibility | No screen reader labels, no dynamic text sizing, no high-contrast mode, no colorblind-safe palette, touch targets too small on some buttons, no keyboard navigation for web admin |
| 71-90 | Performance | No image lazy loading, no list virtualization on long lists, no API response caching headers, no service worker for web admin, no code splitting for web admin, no bundle size optimization |
| 91-110 | Security | No rate limiting on OTP requests, no CAPTCHA after failed OTP attempts, no device fingerprinting for fraud detection, no IP blocking for suspicious activity, no encryption on locally stored data (SQLite/AsyncStorage), admin panel has no session timeout display |
| 111-130 | UX | No haptic feedback on button taps, no success animations, no transition animations between screens, no pull-to-refresh on all list screens, no "scroll to top" on long lists, promo carousel has no auto-play, no "end of list" indicator |
| 131-150 | Data | No data export for customers (GDPR/DPA right), no account deletion flow, no data anonymization pipeline, no backup verification tests, no disaster recovery plan |
| 151-170 | Business Logic | No surge pricing implementation, no holiday pricing, no provider unavailability auto-detection, no smart rebooking when provider cancels, no waitlist for fully-booked times |
| 171-190 | Provider | No earnings goal tracker, no "best time to work" insights, no demand heat map, no materials list generator for quoted jobs, no invoice generator for providers |
| 191-200 | Admin | No A/B testing framework for promos, no cohort analysis, no customer churn prediction, no automated provider quality scoring, no automated commission rate optimization |

## 5.4 Low Issues / Nice-to-Haves (201-500+)

Categories: social features (provider profiles shareable to Facebook), gamification (provider leaderboards), advanced analytics (ML-based matching), voice booking (call to book for non-smartphone users), WhatsApp/Messenger bot integration, provider certification program, customer membership tiers, seasonal/holiday themes, dark mode, widget for home screen (next booking), Apple Watch/WearOS companion app, QR code for provider profile sharing, NFC for check-in at job location, integration with Google Calendar/Apple Calendar for bookings, automated post-job follow-up surveys, video call for remote diagnosis, AR measurement tool for painting/renovation quotes, integration with hardware store catalogs for materials pricing, and hundreds more.

---

# SECTION 6: BUILD ORDER — WHICH SCREENS TO CODE FIRST

## Sprint-by-Sprint Screen Build Order

### Sprint 4 (Customer App Core) — Build These Screens:
1. **Splash Screen** — 2 hours
2. **Onboarding Walkthrough** — 4 hours
3. **Registration (Phone + OTP)** — 8 hours (includes OTP logic, validation, error handling)
4. **Login** — 4 hours (reuses OTP component from registration)
5. **Home Dashboard** — 16 hours (most complex screen, multiple sections, conditional rendering)
6. **Service Category Grid** — 4 hours
7. **Service Subcategory List** — 4 hours
8. **Address Picker (Map)** — 12 hours (Google Maps integration, geocoding, pin dragging)
9. **Booking Form (Fixed-Price)** — 12 hours (date picker, time picker, add-ons, price calculation)
10. **Checkout / Payment** — 16 hours (PayMongo integration, multiple payment methods, escrow)
11. **Booking Confirmation** — 4 hours

**Sprint 4 Total: ~86 hours of coding**

### Sprint 5 (Customer App Completion) — Build These Screens:
12. **Active Booking Tracker** — 16 hours (real-time GPS, Socket.io, map updates)
13. **In-Service Chat** — 16 hours (Socket.io, message persistence, photo sharing)
14. **Job Completion Confirmation** — 4 hours
15. **Rating & Review Form** — 8 hours (star rating component, photo upload)
16. **Tip Provider** — 4 hours
17. **Booking History List** — 8 hours (pagination, filtering)
18. **Booking Detail / Receipt** — 6 hours
19. **Customer Wallet** — 8 hours (balance, transactions, top-up)
20. **Customer Profile / Settings** — 8 hours
21. **Notifications List** — 4 hours
22. **Search Screen** — 8 hours (search API, results rendering, filters)
23. **Provider Profile Detail** — 8 hours (reviews, portfolio, booking CTA)

**Sprint 5 Total: ~98 hours of coding**

Each sprint = 2 weeks. With an AI coder working full-time under Ken's direction, ~50 hours/week of productive coding is achievable. Each sprint has buffer for testing and bug fixes.

---

*This expansion document is designed to be used alongside the v1.0 specification. Together they form the complete product bible for the Philippine Home Services Marketplace platform.*

*Total specification coverage across both documents: ~38,000 words, covering 10 chapters + 6 expansion sections + appendices, equivalent to approximately 120+ pages of dense specification content.*

*Next expansion priorities if requested: complete wireframe specifications for ALL 55+ screens at the same detail level as Section 4.2 (Home Dashboard), complete API documentation with request/response examples, complete test plan with test cases, deployment runbook, and go-to-market strategy.*
