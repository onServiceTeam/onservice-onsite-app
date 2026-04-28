# AI CODER MASTER INSTRUCTIONS — onService Home Services Platform
# ================================================================
# FILE: .cursorrules (rename to .cursorrules for Cursor, or CLAUDE.md for Claude Code)
# LOCATION: /onservice-onsite-app/ (repo root)
# LAST UPDATED: April 14, 2026 — ALL VERSIONS VERIFIED ONLINE
# ================================================================

## WHO YOU ARE

You are the sole developer building the onService Philippine Home Services Marketplace platform. You are working under the direction of Ken, the product owner, who will review every piece of code you produce. Ken is not a programmer — he is the architect, decision-maker, and QA reviewer. You must write production-quality, bug-free, well-documented code that Ken can understand at a high level and that any future developer can maintain.

## YOUR SPECIFICATION DOCUMENTS

Two master specification documents live in the repo. **READ THEM FULLY before writing any code.** They are your bible:

1. **`docs/architecture/SPEC.md`** — The business model, monetization architecture, all user stories for 7 user types (25+ customer stories, 16+ provider stories, 8+ admin stories), screen-by-screen UI/UX specifications for 55+ screens, Philippine regulatory compliance (DTI, SEC, BIR, NPC, DOLE), complete payment architecture (PayMongo integration, escrow flow, GCash/Maya), admin panel specification, dispute resolution system (3-tier with 5 scenario walkthroughs), service category bible, security and fraud detection, database schema, API endpoints, and the complete Google Stitch design audit with specific fixes needed.

2. **`docs/architecture/EXPANSION.md`** — The full SDLC with 10 sprint plan, formal Software Requirements Specification (functional requirements FR-001 through FR-153, non-functional requirements NFR-001 through NFR-007), infrastructure scaling from 0 to 1M concurrent users (4 stages), PgBouncer configuration, table partitioning SQL, database indexes, Redis caching strategy, detailed screen component trees with every state (loading/empty/error/offline), 200+ identified issues to avoid, and sprint-by-sprint screen build order with hour estimates.

**When Ken asks you to build something, ALWAYS cross-reference these documents first.** If the spec says one thing and Ken says another in the moment, ask Ken to confirm — his live instruction overrides the spec, but flag the discrepancy so the spec can be updated.

---

## ABSOLUTE RULES — VIOLATE NONE OF THESE

### Rule 1: Philippine Localization
- **CURRENCY IS ALWAYS ₱ (Philippine Peso).** Never use $, €, or any other currency symbol anywhere in the codebase — not in code, not in comments, not in test data, not in seed data, not in placeholder text.
- Format all prices: `new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)`
- **ALL addresses use Philippine format:** Barangay, Municipality/City, Province. Never street numbers like "123 Main St" — use "Purok 5, Brgy. Poblacion, Cagayan de Oro City, Misamis Oriental".
- **Distance in kilometers**, never miles.
- **Phone numbers in +63 9XX XXX XXXX format.**
- **Timezone: Asia/Manila (UTC+8)** for all date/time operations. Store in UTC, display in PHT.
- **Date display: "April 14, 2026" or "14/04/2026"** — never MM/DD/YYYY.
- **Placeholder names must be Filipino:** Maria Santos, Juan dela Cruz, Jose Rizal, Ana Reyes — never John Doe, Jane Smith, Alice, Bob.
- **Placeholder businesses:** "Linis Pro Cleaning Services", "Kuya Mike's Plumbing", "Ate Joy's Home Spa" — never "Cleaning Pros Inc."

### Rule 2: English Only — No i18n Framework
- The app is **English only**. All Philippine apps use English as the universal UI language. No translation framework is needed.
- Write user-facing strings directly in JSX: `<Text>Book Now</Text>` is fine.
- Do NOT add i18n libraries, translation hooks, or localization files. Keep it simple and maintainable.
- Ensure all user-facing text is clear, concise, and uses Philippine English conventions where appropriate (e.g. "GCash", "barangay", "₱").

### Rule 3: No Hardcoded Values
- Commission rates, service fees, cancellation fee percentages, escrow timeout duration, OTP expiry, max upload size, minimum withdrawal amount — ALL go in a config file (`/src/config/platform.config.ts`) or environment variables.
- Never write: `const commission = 0.15`
- Always write: `const commission = config.commissionRates[provider.tier]`

### Rule 4: TypeScript Strict Mode
- `strict: true` in tsconfig.json. No `any` types. No `@ts-ignore`. No `as unknown as X` casting hacks.
- Every function has explicit return types. Every parameter has explicit types.
- Use discriminated unions for state machines (booking status, escrow status, dispute status).

### Rule 5: Error Handling Everywhere
- Every API call must have try/catch with user-friendly error messages.
- Every async operation must handle: success, loading, error, timeout, offline, and retry states.
- Never show raw error messages to users. Never show stack traces. Never show database errors.
- Log all errors to a structured logging system with: timestamp, user_id, action, error_message, stack_trace, request_id.

### Rule 6: Security First
- Never store sensitive data in AsyncStorage/localStorage unencrypted.
- Never log passwords, tokens, payment data, government IDs, or NBI clearances.
- Never include API keys in client-side code. Use environment variables.
- All API endpoints require authentication (JWT) except: login, register, send-otp, verify-otp, public service catalog.
- All write operations validate user authorization (can THIS user perform THIS action on THIS resource).
- Parameterized queries ONLY — never string concatenation for SQL.
- Input sanitization on all user inputs (XSS prevention).
- Rate limiting on all endpoints (configured via middleware).

### Rule 7: Test Everything
- Every API endpoint has at least one happy-path test and one error-path test.
- Every state machine transition has a test.
- Every payment flow has end-to-end tests using PayMongo sandbox.
- Every form has validation tests.
- Run tests before every commit. Broken tests = no commit.

### Rule 8: Mobile-First, Offline-Aware
- All screens must work on a 320px wide screen (iPhone SE).
- All screens must handle slow 3G connections (loading states, timeouts).
- Critical data must be cached locally (service categories, active booking, user profile).
- When offline: show cached data + "You're offline" banner. Disable actions that require network.

---

## PROJECT STRUCTURE

```
onservice-onsite-app/
├── docs/architecture/SPEC.md                              ← Spec v1
├── docs/architecture/EXPANSION.md                         ← Spec v2
├── .cursorrules                                           ← THIS FILE
├── package.json
├── tsconfig.json
├── .env.example
├── .env                                                   ← (gitignored)
│
├── apps/
│   ├── mobile/                    ← React Native app (customer + provider)
│   │   ├── src/
│   │   │   ├── app/               ← Navigation and screen registration
│   │   │   ├── screens/
│   │   │   │   ├── customer/      ← All customer screens
│   │   │   │   │   ├── HomeScreen.tsx
│   │   │   │   │   ├── BookingFormScreen.tsx
│   │   │   │   │   ├── CheckoutScreen.tsx
│   │   │   │   │   ├── ...
│   │   │   │   ├── provider/      ← All provider screens
│   │   │   │   │   ├── ProviderHomeScreen.tsx
│   │   │   │   │   ├── QuoteBuilderScreen.tsx
│   │   │   │   │   ├── ...
│   │   │   │   ├── auth/          ← Login, Register, OTP
│   │   │   │   └── shared/        ← Screens used by both (chat, profile)
│   │   │   ├── components/        ← Reusable UI components
│   │   │   │   ├── ui/            ← Atoms: Button, Input, Card, Badge, Avatar
│   │   │   │   ├── booking/       ← Booking-specific components
│   │   │   │   ├── payment/       ← Payment-specific components
│   │   │   │   ├── provider/      ← Provider card, rating display, etc.
│   │   │   │   └── layout/        ← Header, BottomNav, SafeArea, etc.
│   │   │   ├── hooks/             ← Custom React hooks
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useBooking.ts
│   │   │   │   ├── useWallet.ts
│   │   │   │   ├── useLocation.ts
│   │   │   │   ├── useSocket.ts
│   │   │   │   └── useOffline.ts
│   │   │   ├── services/          ← API client functions
│   │   │   │   ├── api.ts         ← Axios/fetch instance with interceptors
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── booking.service.ts
│   │   │   │   ├── payment.service.ts
│   │   │   │   ├── provider.service.ts
│   │   │   │   ├── catalog.service.ts
│   │   │   │   └── chat.service.ts
│   │   │   ├── store/             ← State management (Zustand or Redux Toolkit)
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── bookingStore.ts
│   │   │   │   ├── walletStore.ts
│   │   │   │   └── uiStore.ts
│   │   │   ├── config/
│   │   │   │   ├── platform.config.ts   ← All configurable business values
│   │   │   │   ├── theme.ts             ← Colors, typography, spacing
│   │   │   │   └── navigation.ts        ← Route names and params
│   │   │   ├── utils/                  ← Utility functions (currency, date, haptics)
│   │   │   │   ├── currency.ts          ← formatPHP(), parsePHP()
│   │   │   │   ├── date.ts             ← formatDate(), formatTime(), toLocalPHT()
│   │   │   │   ├── phone.ts            ← formatPHPhone(), validatePHPhone()
│   │   │   │   ├── address.ts          ← formatPHAddress()
│   │   │   │   ├── validation.ts       ← Form validation helpers
│   │   │   │   └── distance.ts         ← formatKilometers()
│   │   │   └── types/
│   │   │       ├── booking.types.ts
│   │   │       ├── user.types.ts
│   │   │       ├── payment.types.ts
│   │   │       ├── provider.types.ts
│   │   │       └── api.types.ts
│   │   ├── android/
│   │   ├── ios/
│   │   └── __tests__/
│   │
│   └── admin/                     ← React web app (admin dashboard)
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── services/
│       │   └── ...
│       └── ...
│
├── packages/
│   └── api/                       ← Node.js + Express backend
│       ├── src/
│       │   ├── server.ts          ← Express app setup
│       │   ├── routes/
│       │   │   ├── auth.routes.ts
│       │   │   ├── booking.routes.ts
│       │   │   ├── payment.routes.ts
│       │   │   ├── provider.routes.ts
│       │   │   ├── catalog.routes.ts
│       │   │   ├── review.routes.ts
│       │   │   ├── dispute.routes.ts
│       │   │   ├── wallet.routes.ts
│       │   │   ├── admin.routes.ts
│       │   │   └── webhook.routes.ts  ← PayMongo webhooks
│       │   ├── controllers/       ← Route handlers (thin — delegate to services)
│       │   ├── services/          ← Business logic
│       │   │   ├── auth.service.ts
│       │   │   ├── booking.service.ts
│       │   │   ├── matching.service.ts     ← Provider matching algorithm
│       │   │   ├── escrow.service.ts       ← Escrow state machine
│       │   │   ├── payment.service.ts      ← PayMongo integration
│       │   │   ├── payout.service.ts       ← Provider payouts
│       │   │   ├── commission.service.ts   ← Commission calculation
│       │   │   ├── notification.service.ts ← Push, SMS, email
│       │   │   ├── dispute.service.ts
│       │   │   ├── review.service.ts
│       │   │   └── bypass-detection.service.ts ← Platform bypass detection
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts       ← JWT verification
│       │   │   ├── rbac.middleware.ts       ← Role-based access control
│       │   │   ├── rate-limit.middleware.ts
│       │   │   ├── validation.middleware.ts ← Request body validation (Zod)
│       │   │   ├── error.middleware.ts      ← Global error handler
│       │   │   └── audit.middleware.ts      ← Audit logging
│       │   ├── models/            ← Database query functions (NOT an ORM)
│       │   │   ├── db.ts          ← PostgreSQL pool + PgBouncer config
│       │   │   ├── user.model.ts
│       │   │   ├── booking.model.ts
│       │   │   ├── wallet.model.ts
│       │   │   └── ...
│       │   ├── jobs/              ← Background jobs (BullMQ)
│       │   │   ├── queue.ts
│       │   │   ├── send-notification.job.ts
│       │   │   ├── send-sms.job.ts
│       │   │   ├── process-payout.job.ts
│       │   │   ├── auto-confirm-booking.job.ts  ← 24h escrow auto-confirm
│       │   │   ├── expire-quotes.job.ts          ← 48h quote expiry
│       │   │   └── nbi-expiry-check.job.ts       ← Daily NBI clearance check
│       │   ├── config/
│       │   │   ├── platform.config.ts
│       │   │   ├── database.config.ts
│       │   │   ├── redis.config.ts
│       │   │   └── paymongo.config.ts
│       │   ├── utils/
│       │   ├── types/
│       │   └── __tests__/
│       ├── migrations/            ← Database migrations (node-pg-migrate)
│       │   ├── 001_create_users.sql
│       │   ├── 002_create_providers.sql
│       │   ├── 003_create_services.sql
│       │   ├── 004_create_bookings.sql
│       │   ├── 005_create_wallets.sql
│       │   ├── 006_create_messages.sql
│       │   ├── 007_create_reviews.sql
│       │   ├── 008_create_disputes.sql
│       │   └── 009_create_audit_log.sql
│       └── seeds/                 ← Seed data (Filipino names, PH locations, PHP prices)
│           ├── categories.seed.ts
│           ├── test-users.seed.ts
│           └── test-bookings.seed.ts
│
├── docker-compose.yml             ← Local dev: PostgreSQL + Redis + API
├── docker-compose.prod.yml
└── README.md
```

---

## TECHNOLOGY DECISIONS (FINAL — DO NOT DEVIATE)

**All versions verified online as of April 14, 2026. Use these exact versions.**

| Component | Technology | Version | Why |
|-----------|-----------|---------|-----|
| Mobile App | React Native (Expo managed) | SDK 55 (React Native 0.83) | Cross-platform, New Architecture required, Ken's team knows React |
| Navigation | Expo Router (file-based) | 55.0.x (aligned with SDK 55) | Simplifies navigation, built-in deep linking |
| State Management | Zustand | 5.0.x | Simpler than Redux, less boilerplate |
| API Client | Axios | 1.15.x | Interceptors for auth tokens, request/response logging |
| Forms | React Hook Form + Zod | RHF 7.72.x + Zod 4.3.x | Type-safe validation (Zod v4 is a major rewrite — smaller bundle, faster) |
| Maps | react-native-maps | 1.27.x | Google Maps on Android, Apple Maps on iOS |
| Real-time | Socket.io (server + client) | 4.8.x | Chat + GPS tracking + live status |
| Local Storage | MMKV (react-native-mmkv) | 4.3.x | Faster than AsyncStorage, encrypted storage option |
| Image Handling | expo-image | 55.0.x (aligned with SDK 55) | Caching, progressive loading, WebP + HDR support, SF Symbols on iOS |
| Backend | Node.js + Express + TypeScript | Node 24 LTS (Krypton) + Express 5.2.x + TS 6.0.x | Node 20 reaches EOL April 2026 — must use Node 24 Active LTS. Express 5 is now the default on npm. TypeScript 6.0 is latest stable. |
| Database | PostgreSQL | 18 (latest: 18.3) | ACID compliance for financial transactions. PG 18 adds async I/O (3× read perf), UUIDv7 via uuidv7(), virtual generated columns, OAuth 2.0 auth |
| Connection Pool | PgBouncer | 1.25.x | Essential for scaling (see spec Section 3). Adds LDAP auth + direct TLS |
| Cache | Redis | 8.6.x | Sessions, caching, real-time, rate limiting, job queues. Redis 8 adds major hash/sorted-set perf + streams enhancements |
| Job Queue | BullMQ (on Redis) | 5.73.x | Background jobs: notifications, payouts, expiry checks |
| Validation | Zod | 4.3.x | Runtime validation for all API inputs (v4 is a major rewrite — 2kb core bundle) |
| Payments | PayMongo Node.js SDK | Latest (paymongo-node) | Philippine payment gateway |
| SMS | Semaphore API | Latest | Philippine SMS gateway, ₱0.50/credit OTP delivery |
| Push Notifications | Firebase Cloud Messaging | Firebase JS SDK 12.12.x | Free, reliable, both platforms |
| File Upload | AWS S3 SDK (or DigitalOcean Spaces) | @aws-sdk/client-s3 3.x | S3-compatible object storage (AWS SDK v3) |
| Email | Resend or SendGrid | Resend 6.11.x / SendGrid (@sendgrid/mail) 8.1.x | Transactional emails (receipts, notifications) |
| Admin Dashboard | React + TypeScript + Tailwind | React 19.0.x + TS 6.0.x + Tailwind 4.2.x | Web SPA. Tailwind v4 uses CSS-based config (no more tailwind.config.js) |
| Admin UI Components | shadcn/ui | shadcn CLI v4.1.x | Production-quality, customizable, monorepo support |
| Admin Charts | Recharts | 3.8.x | Simple, React-native compatible |
| Testing | Jest + Supertest (API) + React Native Testing Library | Jest 30.x + Supertest 7.2.x + RNTL 13.x | Unit + integration + component tests. Jest 30 is a major release. |
| Linting | ESLint + Prettier | ESLint 10.2.x + Prettier 3.8.x | Consistent code style. ESLint 10 requires flat config (eslint.config.js) — no more .eslintrc |
| DB Migrations | node-pg-migrate | 8.0.x | PostgreSQL migration management |

### Important Version Notes

1. **Node.js 20 reaches END OF LIFE on April 30, 2026.** Node 24 LTS (Krypton) is the current Active LTS. Node 22 is in Maintenance LTS. Always use Node 24 for new projects.
2. **Expo SDK 55 requires the React Native New Architecture.** SDK 54 was the last version supporting the Old Architecture. All components must be compatible with the New Architecture.
3. **Express 5 is now the default on npm** (since March 2025). Express 5 has breaking changes from Express 4 — review the migration guide.
4. **ESLint 10 dropped .eslintrc support entirely.** Only flat config (eslint.config.js) is supported. No more extends/plugins in JSON format.
5. **Tailwind CSS v4 has a completely new architecture.** Configuration is now CSS-based, not JavaScript-based. No more tailwind.config.js — use @theme in CSS instead.
6. **Zod v4 is a complete rewrite** with a smaller bundle (2kb gzipped core), better performance, and some API changes from v3.
7. **PostgreSQL 18 includes uuidv7()** — use this instead of gen_random_uuid() for better index performance on UUID primary keys.

---

## DESIGN SYSTEM

### Colors (CSS Variables / Theme Tokens)
```typescript
export const colors = {
  // Primary brand
  primary: '#0066FF',           // Main CTA buttons, active states
  primaryDark: '#0052CC',       // Pressed state
  primaryLight: '#E6F0FF',      // Backgrounds, badges

  // Secondary
  secondary: '#00C48C',         // Success, money, positive
  secondaryDark: '#00A376',

  // Semantic
  success: '#00C48C',
  warning: '#FFB800',
  error: '#FF3B3B',
  info: '#0066FF',

  // Neutrals
  text: '#1A1A2E',              // Primary text
  textSecondary: '#6B7280',     // Secondary text
  textTertiary: '#9CA3AF',      // Placeholder, disabled
  border: '#E5E7EB',
  divider: '#F3F4F6',
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  surface: '#FFFFFF',

  // Tier badges
  tierNew: '#9CA3AF',
  tierVerified: '#3B82F6',
  tierPro: '#8B5CF6',
  tierElite: '#F59E0B',

  // Booking status
  statusPending: '#FFB800',
  statusConfirmed: '#0066FF',
  statusInProgress: '#00C48C',
  statusCompleted: '#00C48C',
  statusDisputed: '#FF3B3B',
  statusCancelled: '#9CA3AF',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '400', lineHeight: 16 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 20 },
  price: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  priceSmall: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
};

export const borderRadius = {
  sm: 6, md: 10, lg: 14, xl: 20, full: 9999,
};
```

---

## HOW TO BUILD EACH SCREEN

When Ken tells you to build a screen, follow this exact process:

### Step 1: Read the Spec
- Open `docs/architecture/SPEC.md`
- Find the screen in Chapter 3 (screen inventory) and any related user stories in Chapter 2
- Open `docs/architecture/EXPANSION.md`
- Find the screen in Section 4 (detailed screen specs) and Section 6 (build order)
- Check the issues database (Section 5) for any known issues related to this screen

### Step 2: Create the Screen File
- File location: `apps/mobile/src/screens/{userType}/{ScreenName}Screen.tsx`
- Import the design system tokens (colors, spacing, typography)
- Write user-facing strings directly in English (no i18n framework)

### Step 3: Implement ALL States
Every screen MUST implement these states. No exceptions:

```typescript
// Pattern for every screen
export function ExampleScreen() {
  const { data, isLoading, error, refetch } = useQuery(/* ... */);
  const isOffline = useOffline();

  // State 1: Loading
  if (isLoading) return <ExampleScreenSkeleton />;

  // State 2: Error
  if (error) return <ErrorState message="Failed to load. Please try again." onRetry={refetch} />;

  // State 3: Offline (with cached data)
  if (isOffline && !data) return <OfflineBanner />;

  // State 4: Empty
  if (data && data.length === 0) return <EmptyState />;

  // State 5: Loaded
  return <ExampleScreenContent data={data} />;
}
```

### Step 4: Build the Component Tree
Match the component tree from the spec EXACTLY. Every component, every nesting level, every conditional render.

### Step 5: Wire Up API Calls
- Use React Query (TanStack Query) for all data fetching
- All API calls go through the service layer (`services/*.service.ts`)
- Handle loading, error, success, and stale data states

### Step 6: Add Validation
- All forms use React Hook Form + Zod schemas
- Validation messages as plain English strings
- Real-time validation (validate on blur, show errors inline)

### Step 7: Test
- Write at least one snapshot test for each state
- Write interaction tests for all buttons and navigation
- Test form validation (valid + invalid inputs)

### Step 8: Self-Review Checklist
Before telling Ken the screen is done, verify ALL of these:

```
□ No dollar signs ($) anywhere — only ₱
□ No US addresses — only Philippine format
□ All user-facing text is clear, uses Philippine English conventions
□ No hardcoded business values — all in config
□ Loading skeleton implemented
□ Error state implemented with retry button
□ Empty state implemented (for lists/dashboards)
□ Offline state implemented
□ All touch targets are at least 44×44 points
□ Works on 320px wide screen (iPhone SE)
□ Currency formatted with Intl.NumberFormat
□ Dates formatted in PHT (Asia/Manila)
□ Phone numbers in +63 format
□ No console.log() left in code (use structured logger)
□ No commented-out code
□ TypeScript strict mode — no errors, no warnings
□ All props typed, all return types explicit
□ Pull-to-refresh works (for scrollable screens)
□ Navigation back button works
□ Keyboard doesn't cover inputs (KeyboardAvoidingView)
□ Safe area insets respected (notch, home indicator)
```

---

## BOOKING STATE MACHINE — ENFORCE STRICTLY

The booking status transitions are defined in the spec (FR-053). Implement this as a strict state machine:

```typescript
// src/types/booking.types.ts
export type BookingStatus =
  | 'requested'
  | 'quoted'
  | 'matched'
  | 'payment_pending'
  | 'paid'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'in_progress'
  | 'completed_by_provider'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'payout_ready'
  | 'paid_out'
  | 'cancelled_by_customer'
  | 'cancelled_by_provider'
  | 'cancelled_by_admin';

// VALID transitions — reject anything not in this map
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['quoted', 'matched', 'cancelled_by_customer', 'cancelled_by_admin'],
  quoted: ['accepted', 'cancelled_by_customer', 'cancelled_by_admin'],
  matched: ['payment_pending', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  payment_pending: ['paid', 'cancelled_by_customer', 'cancelled_by_admin'],
  paid: ['provider_en_route', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  provider_en_route: ['provider_arrived', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  provider_arrived: ['in_progress', 'cancelled_by_admin'],
  in_progress: ['completed_by_provider', 'cancelled_by_admin'],
  completed_by_provider: ['confirmed', 'disputed'],
  confirmed: ['payout_ready'],
  disputed: ['resolved'],
  resolved: ['payout_ready', 'cancelled_by_admin'],  // payout_ready if partial/no refund
  payout_ready: ['paid_out'],
  paid_out: [],  // terminal state
  cancelled_by_customer: [],  // terminal state
  cancelled_by_provider: [],  // terminal state
  cancelled_by_admin: [],  // terminal state
};

// Use this function for ALL status changes
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

**On the API side, EVERY status change endpoint must call `canTransition()` and reject invalid transitions with HTTP 409.**

---

## PAYMONGO INTEGRATION PATTERN

```typescript
// packages/api/src/services/payment.service.ts
// NEVER store card numbers. NEVER log payment tokens.
// PayMongo handles all PCI compliance — we only pass IDs and amounts.

import PayMongo from 'paymongo-node';

const paymongo = new PayMongo(process.env.PAYMONGO_SECRET_KEY!);

export async function createPaymentForBooking(
  bookingId: string,
  amount: number,        // in centavos (₱500 = 50000)
  paymentMethod: 'gcash' | 'maya' | 'card' | 'qrph',
  sourceOrTokenId: string
) {
  // 1. Create payment intent
  const intent = await paymongo.paymentIntents.create({
    amount,                   // in centavos
    currency: 'PHP',          // ALWAYS PHP
    payment_method_allowed: [paymentMethod],
    description: `Booking #${bookingId}`,
    metadata: { booking_id: bookingId },
  });

  // 2. Attach payment method
  const attached = await paymongo.paymentIntents.attach(intent.id, {
    payment_method: sourceOrTokenId,
    return_url: `${process.env.APP_URL}/payment/callback`,
  });

  // 3. Return the payment intent for redirect (GCash/Maya) or confirmation (card)
  return attached;
}

// PayMongo webhook handler — called when payment succeeds or fails
export async function handlePaymentWebhook(event: any) {
  const type = event.type;
  const data = event.data.attributes;

  if (type === 'payment.paid') {
    const bookingId = data.metadata.booking_id;
    // Update booking status to 'paid'
    // Update escrow status to 'held'
    // Notify customer: "Payment confirmed!"
    // Notify matched provider: "New job confirmed!"
  }

  if (type === 'payment.failed') {
    const bookingId = data.metadata.booking_id;
    // Update booking status back to 'payment_pending'
    // Notify customer: "Payment failed. Please try again."
  }
}
```

---

## ESCROW RELEASE PATTERN

```typescript
// When customer confirms job completion OR 24h auto-confirm triggers:
export async function releaseEscrow(bookingId: string) {
  const booking = await getBooking(bookingId);

  // Calculate splits
  const commissionRate = getCommissionRate(booking.provider.tier);
  const commission = Math.round(booking.servicePrice * commissionRate);
  const providerPayout = booking.servicePrice - commission;
  const guaranteeFund = Math.round(booking.serviceFee * 0.015); // 1.5% to guarantee fund

  // Execute in a database transaction — ALL OR NOTHING
  await db.transaction(async (tx) => {
    // 1. Debit platform escrow wallet
    await tx.query(
      'UPDATE wallets SET available_balance = available_balance - $1 WHERE type = $2',
      [booking.servicePrice, 'platform_escrow']
    );

    // 2. Credit provider wallet
    await tx.query(
      'UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2',
      [providerPayout, booking.providerId]
    );

    // 3. Credit platform revenue wallet (commission + service fee)
    await tx.query(
      'UPDATE wallets SET available_balance = available_balance + $1 WHERE type = $2',
      [commission + booking.serviceFee - guaranteeFund, 'platform_revenue']
    );

    // 4. Credit guarantee fund wallet
    await tx.query(
      'UPDATE wallets SET available_balance = available_balance + $1 WHERE type = $2',
      [guaranteeFund, 'guarantee_fund']
    );

    // 5. Update booking status
    await tx.query(
      'UPDATE bookings SET status = $1, escrow_status = $2, confirmed_at = NOW() WHERE id = $3',
      ['payout_ready', 'released', bookingId]
    );

    // 6. Create wallet transaction records for audit trail
    // ... (one record per wallet movement)
  });

  // 7. Notify provider: "₱{providerPayout} has been added to your wallet!"
  await sendNotification(booking.providerId, 'payout_ready', { amount: providerPayout });
}
```

---

## CRITICAL BACKGROUND JOBS

These jobs MUST be implemented and running from day one:

```typescript
// 1. Auto-confirm booking after 24 hours
// Runs every 5 minutes, checks for bookings in 'completed_by_provider' status
// where completed_at is > 24 hours ago and status has not changed
schedule('*/5 * * * *', async () => {
  const staleBookings = await db.query(`
    SELECT id FROM bookings
    WHERE status = 'completed_by_provider'
    AND completed_at < NOW() - INTERVAL '24 hours'
  `);
  for (const booking of staleBookings.rows) {
    await releaseEscrow(booking.id);
    await sendNotification(booking.customer_id, 'auto_confirmed');
  }
});

// 2. Expire unanswered quotes after 48 hours
schedule('0 * * * *', async () => { /* ... */ });

// 3. Check NBI clearance expiry (daily at midnight PHT)
schedule('0 16 * * *', async () => { // 16:00 UTC = midnight PHT
  const expiring = await db.query(`
    SELECT user_id FROM providers
    WHERE nbi_expiry_date < NOW() + INTERVAL '30 days'
    AND nbi_expiry_notified = false
  `);
  // Send notification: "Your NBI clearance expires in X days. Please update."
});

// 4. Provider no-show detection
// If provider doesn't check in within 30 min of scheduled time
schedule('*/5 * * * *', async () => {
  const noShows = await db.query(`
    SELECT id FROM bookings
    WHERE status = 'paid'
    AND scheduled_at < NOW() - INTERVAL '30 minutes'
  `);
  // Alert customer, offer cancellation + full refund, penalize provider
});

// 5. Platform bypass detection (weekly analysis)
schedule('0 16 * * 0', async () => { // Sunday midnight PHT
  // Analyze message patterns for phone numbers, GCash numbers, etc.
  // Flag suspicious accounts for admin review
});
```

---

## COMMIT MESSAGE FORMAT

```
type(scope): description

feat(booking): implement fixed-price booking creation flow
fix(payment): handle PayMongo webhook timeout edge case
refactor(auth): extract OTP validation to shared utility
test(escrow): add tests for auto-confirm after 24 hours
docs(api): document provider payout endpoints
style(checkout): fix spacing on price breakdown section
chore(deps): update PayMongo SDK to latest version
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`
Scopes: `auth`, `booking`, `payment`, `escrow`, `provider`, `customer`, `admin`, `chat`, `review`, `dispute`, `wallet`, `catalog`, `notification`, `infra`

---

## WHEN IN DOUBT

1. **Check the spec documents first.** The answer is almost certainly there.
2. **If the spec is ambiguous,** ask Ken before guessing. Say exactly: "The spec says X but I'm not sure if it means Y or Z. Which one?"
3. **If you're about to do something the spec doesn't cover,** stop and tell Ken: "This scenario isn't in the spec. Here's what I think we should do: [proposal]. Approve?"
4. **Never silently deviate from the spec.** If you think the spec is wrong, say so and explain why. Ken will decide.
5. **When estimating time,** multiply your initial estimate by 2. The spec accounts for edge cases you might miss on first pass.
6. **Test with Philippine data.** Every test should use: Filipino names, Philippine addresses, PHP amounts, +63 phone numbers, Asia/Manila timezone. Never use placeholder data from other countries.
