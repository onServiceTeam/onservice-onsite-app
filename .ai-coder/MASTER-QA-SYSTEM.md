# THE MASTER QA SYSTEM

**This is the comprehensive anti-laziness checklist. It is designed against the specific ways AI coders cut corners, not against laziness in general.**

The protocol is not "do these checks." It is: **the AI coder must produce an artifact (file, log, screenshot, hash) for every check item. Ken's `verify-evidence-manifest.sh` script reads the artifacts and confirms they exist, are non-empty, and were generated in the current session. An AI coder can fake a check; it cannot fake an artifact that doesn't exist.**

This file lists every check, organized by category. Each check has:
- **ID** — referenced in the evidence manifest
- **What it verifies** — the property under check
- **How** — the exact command or procedure
- **Artifact** — what file proves the check ran
- **Failure mode** — the specific way an AI coder might fake this

---

## PART A — THE 12 LAZINESS PATTERNS

Before listing checks, name the enemy. AI coders fall into these patterns. Every check below is designed against one of these:

1. **The Skim** — reads a check description, says "this would obviously pass," doesn't run it
2. **The Stub** — writes a test that calls the function but doesn't assert anything meaningful
3. **The Mock-Self** — mocks the very function it's testing, then "passes"
4. **The Comment-Out** — silences a failing check with `it.skip` or commented-out test
5. **The Suppress** — uses `// @ts-ignore`, `as any`, or `eslint-disable` to silence errors
6. **The Patch** — sees an error, patches the symptom not the cause
7. **The Phantom** — claims work was done; no file/diff evidence exists
8. **The Drift** — slowly adds dependencies, complexity, untyped code beyond the phase scope
9. **The Optimistic Path** — only handles the happy path, ignores nulls/errors/empties
10. **The Local-Only** — works on AI coder's setup, breaks on fresh clone
11. **The Forgot-Migration** — code references DB columns that exist locally but no migration creates them
12. **The Quiet Regression** — change breaks an unrelated thing, AI coder doesn't notice because it didn't run that test

---

## PART B — THE FRONTEND CHECKLIST (200+ items)

Every screen the AI coder creates or modifies must produce evidence for every applicable item.

### B1. Visual fidelity (15 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-V01 | Screen matches design tokens (colors from `tokens.json`) | Screenshot + token-trace.md (lists every CSS color used and its token source) |
| FE-V02 | Spacing matches token scale (4/8/12/16/24/32...) | Token-trace.md with spacing audit |
| FE-V03 | Typography matches tokens (font-family, weight, size) | Token-trace.md with typography audit |
| FE-V04 | No emoji used as iconography | `verify-no-emoji.sh` passes for the screen file |
| FE-V05 | All icons from `lucide-react` (admin) or `lucide-react-native` (mobile) | grep audit log showing only lucide imports |
| FE-V06 | All icons imported from centralized `@/components/icons` module | grep showing no direct lucide imports |
| FE-V07 | Loading state exists and renders | Screenshot of loading state |
| FE-V08 | Error state exists and renders | Screenshot of error state |
| FE-V09 | Empty state exists and renders | Screenshot of empty state |
| FE-V10 | Success state matches design | Screenshot |
| FE-V11 | Layout works at 1920×1080 | Screenshot |
| FE-V12 | Layout works at 1440×900 | Screenshot |
| FE-V13 | Layout works at 1280×720 | Screenshot |
| FE-V14 | Layout works at 768×1024 (tablet) | Screenshot |
| FE-V15 | Layout works at 375×667 (small phone) | Screenshot |

### B2. Interactive correctness (25 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-I01 | Every button responds to click | Interaction trace with each button + result |
| FE-I02 | Every form submits valid data successfully | Network tab screenshot showing 200/201 |
| FE-I03 | Every form rejects invalid data with helpful message | Screenshot of validation error |
| FE-I04 | Every form preserves user input on validation error | Screenshot before+after |
| FE-I05 | Every form has CSRF protection (or equivalent) | Code excerpt showing token |
| FE-I06 | Every input has correct type (`type=email`, `type=tel`, `inputMode=numeric` for amounts) | Code excerpt |
| FE-I07 | Every required field is marked visually | Screenshot |
| FE-I08 | Every required field is announced to screen reader (`aria-required`) | DevTools accessibility tree |
| FE-I09 | Every error message is linked to its field (`aria-describedby`) | DevTools accessibility tree |
| FE-I10 | Submit button disabled while submitting | Screenshot mid-submission |
| FE-I11 | Submit button shows loading indicator while submitting | Screenshot mid-submission |
| FE-I12 | Network failure shows user-friendly error, not stack trace | Screenshot with offline mode |
| FE-I13 | 401 response triggers re-login flow, not silent failure | Network log |
| FE-I14 | 403 response shows "you don't have permission" | Screenshot |
| FE-I15 | 404 on detail page shows "not found," not blank | Screenshot |
| FE-I16 | 500 response shows "something went wrong, try again" | Screenshot |
| FE-I17 | Slow network (3G simulation) shows skeleton or spinner within 200ms | Screenshot at 200ms |
| FE-I18 | All clickable elements have hover state (desktop) | Screenshot |
| FE-I19 | All clickable elements have focus state (keyboard) | Screenshot |
| FE-I20 | All clickable elements have active state (mid-click) | Screenshot |
| FE-I21 | All modals can be dismissed via Escape key | Test trace |
| FE-I22 | All modals can be dismissed via outside click (where appropriate) | Test trace |
| FE-I23 | All modals trap focus while open | DevTools accessibility audit |
| FE-I24 | All modals restore focus on close | Test trace |
| FE-I25 | Back button returns to previous page state, not initial state | Test trace |

### B3. Data correctness (20 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-D01 | Lists fetch from real API (no hardcoded mock data) | Network log showing API call |
| FE-D02 | Detail pages fetch by ID from URL param | Network log |
| FE-D03 | All money values displayed with `formatCurrency()` | grep showing no inline `₱` |
| FE-D04 | All dates displayed in Asia/Manila timezone | grep showing no `new Date(string)` without timezone |
| FE-D05 | All dates use `formatDate()` / `formatDateTime()` helpers | grep showing no `.toLocaleString` direct |
| FE-D06 | Phone numbers displayed in `+63 9XX XXX XXXX` format | grep showing `formatPhone()` use |
| FE-D07 | Empty list renders empty state, not blank | Screenshot |
| FE-D08 | Single-item list renders correctly (off-by-one bugs) | Screenshot |
| FE-D09 | List with 100+ items paginates or virtualizes | Screenshot showing pagination |
| FE-D10 | Long text truncates with ellipsis or wraps gracefully | Screenshot with long string |
| FE-D11 | Unicode (Filipino names, ñ, è) renders correctly | Screenshot |
| FE-D12 | Right-to-left text doesn't break layout (defensive) | Screenshot |
| FE-D13 | Stale data is refreshed on navigation (or cache invalidated) | Network log showing refetch |
| FE-D14 | Optimistic updates revert on server error | Test trace |
| FE-D15 | Real-time updates (socket) reflect on screen | Test trace with two browsers |
| FE-D16 | Search inputs debounce (no API call per keystroke) | Network log |
| FE-D17 | Filter changes reflect in URL (deep-linkable) | URL screenshots |
| FE-D18 | Sort changes reflect in URL | URL screenshots |
| FE-D19 | Pagination state preserved on detail-page back-navigation | Test trace |
| FE-D20 | Numbers >= 10000 display with locale-appropriate separators | Screenshot |

### B4. Accessibility (20 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-A01 | Every interactive element reachable via Tab | Keyboard nav trace |
| FE-A02 | Tab order is logical (top-to-bottom, left-to-right) | Tab trace |
| FE-A03 | Skip-to-content link exists at top of page | Screenshot |
| FE-A04 | Every image has alt text (or `alt=""` if decorative) | grep audit |
| FE-A05 | Every button has accessible name | DevTools a11y tree |
| FE-A06 | Every link has accessible name (no "click here") | DevTools a11y tree |
| FE-A07 | Color contrast ≥ 4.5:1 for body text | Screenshot + contrast checker output |
| FE-A08 | Color contrast ≥ 3:1 for large text | Screenshot |
| FE-A09 | Color is not the only signal (icons + text) | Screenshot |
| FE-A10 | Form errors announced to screen reader | aria-live region |
| FE-A11 | Loading state announced to screen reader | aria-live region |
| FE-A12 | Heading hierarchy correct (h1 → h2 → h3) | Outline tool screenshot |
| FE-A13 | Landmark regions used (`<main>`, `<nav>`, `<aside>`) | Outline tool screenshot |
| FE-A14 | Lists use `<ul>` / `<ol>`, not divs | Code grep |
| FE-A15 | Tables have `<th>` headers and scope | Code grep |
| FE-A16 | Form labels use `<label>` with `htmlFor` | Code grep |
| FE-A17 | Touch targets ≥ 44px × 44px on mobile | DevTools measurement |
| FE-A18 | Focus indicators visible (not just default browser blue) | Screenshot |
| FE-A19 | Animations respect `prefers-reduced-motion` | CSS audit |
| FE-A20 | Page works with JavaScript enabled (we don't need no-JS) | (N/A acceptable) |

### B5. Performance (15 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-P01 | First Contentful Paint < 2s on 3G | Lighthouse report |
| FE-P02 | Time To Interactive < 3.5s on 3G | Lighthouse report |
| FE-P03 | Largest Contentful Paint < 2.5s | Lighthouse report |
| FE-P04 | Cumulative Layout Shift < 0.1 | Lighthouse report |
| FE-P05 | Total bundle size < 500KB gzipped (admin) | Webpack/Vite build report |
| FE-P06 | No bundle import of entire icon library (tree-shaken) | Bundle analyzer screenshot |
| FE-P07 | No bundle import of entire date library | Bundle analyzer screenshot |
| FE-P08 | List views virtualize when N > 50 (or paginate) | Code excerpt |
| FE-P09 | Images lazy-load below the fold | Code excerpt |
| FE-P10 | Images served at appropriate size (no 4MB JPGs) | Network tab |
| FE-P11 | API calls debounced where applicable | Code excerpt |
| FE-P12 | API responses cached via React Query (where stable) | Code excerpt |
| FE-P13 | No layout thrash on scroll | DevTools rendering audit |
| FE-P14 | No memory leak on repeated navigation | Memory profile |
| FE-P15 | No console.warn / console.error in production build | Console log |

### B6. State and edge cases (15 checks)

| ID | Check | Artifact |
|---|---|---|
| FE-S01 | Page state survives browser refresh | Test trace |
| FE-S02 | Page state survives mobile app backgrounding | Test trace |
| FE-S03 | Cancellation of in-flight request on navigate | Network log |
| FE-S04 | Double-submit prevented (button disabled or idempotency key) | Test trace |
| FE-S05 | Race condition: rapid filter changes don't show stale data | Test trace |
| FE-S06 | Auth expiry mid-session triggers re-login | Test trace |
| FE-S07 | Permission revocation mid-session blocks action | Test trace |
| FE-S08 | Logged-out user redirected from auth-required pages | Test trace |
| FE-S09 | Already-logged-in user redirected from login page | Test trace |
| FE-S10 | Form dirty state warns on navigate-away | Test trace |
| FE-S11 | Notification system shows toast on success | Screenshot |
| FE-S12 | Notification system shows toast on error | Screenshot |
| FE-S13 | Multiple toasts queue, don't overlap | Screenshot |
| FE-S14 | Toast auto-dismisses (or has dismiss button) | Test trace |
| FE-S15 | Critical actions show confirmation dialog | Screenshot |

---

## PART C — THE BACKEND CHECKLIST (250+ items)

### C1. API contract (30 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-A01 | Every endpoint has explicit Zod schema for body | Code excerpt |
| BE-A02 | Every endpoint has explicit Zod schema for params | Code excerpt |
| BE-A03 | Every endpoint has explicit Zod schema for query | Code excerpt |
| BE-A04 | Every endpoint has explicit return type | Code excerpt |
| BE-A05 | Every endpoint has authentication middleware (or `// PUBLIC` comment justifying absence) | Code excerpt |
| BE-A06 | Every endpoint has authorization middleware (RBAC role check) | Code excerpt |
| BE-A07 | Every endpoint has rate limiting | Code excerpt |
| BE-A08 | Every endpoint validates request size (max body 1MB unless documented) | Express config audit |
| BE-A09 | Every endpoint logs request via structured logger | Code excerpt |
| BE-A10 | Every endpoint catches and rethrows errors via error middleware | Code excerpt |
| BE-A11 | Every endpoint returns consistent error shape `{error, code, details}` | Sample response |
| BE-A12 | Every endpoint returns consistent success shape `{data}` or `{data, meta}` | Sample response |
| BE-A13 | Every endpoint has at least one happy-path test | Test file path |
| BE-A14 | Every endpoint has at least one auth-failure test | Test file path |
| BE-A15 | Every endpoint has at least one validation-failure test | Test file path |
| BE-A16 | Every endpoint with side effects is idempotent OR uses idempotency key | Code excerpt |
| BE-A17 | Every list endpoint paginates | Code excerpt |
| BE-A18 | Every list endpoint has max LIMIT (default 50, max 200) | Code excerpt |
| BE-A19 | Every search endpoint sanitizes input for SQL/XSS | Code excerpt |
| BE-A20 | Every endpoint with file upload validates MIME type | Code excerpt |
| BE-A21 | Every endpoint with file upload validates max size | Code excerpt |
| BE-A22 | Every endpoint that sends notifications is idempotent | Code excerpt |
| BE-A23 | Every webhook endpoint validates signature | Code excerpt |
| BE-A24 | Every webhook endpoint is idempotent (handles replay) | Code excerpt |
| BE-A25 | Every endpoint with cascading deletes warns/confirms | Code excerpt |
| BE-A26 | Every endpoint with PII has audit log entry | Code excerpt |
| BE-A27 | Every endpoint with money movement has audit log entry | Code excerpt |
| BE-A28 | Every endpoint returns 200/201 for success, not 204 with body | Sample responses |
| BE-A29 | Every endpoint with async work returns 202 with operation ID | Sample responses |
| BE-A30 | Every endpoint exposed in OpenAPI / Swagger spec | Spec file |

### C2. Data integrity (30 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-D01 | Every money column is INTEGER (centavos) | Schema dump |
| BE-D02 | Every money column has `CHECK (column >= 0)` where appropriate | Schema dump |
| BE-D03 | Every timestamp column is `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Schema dump |
| BE-D04 | Every UUID column has `DEFAULT gen_random_uuid()` or app-generated UUID v7 | Schema dump |
| BE-D05 | Every foreign key has `ON DELETE` behavior specified | Schema dump |
| BE-D06 | Every status column has `CHECK` constraint listing allowed values | Schema dump |
| BE-D07 | Every soft-delete uses `deleted_at TIMESTAMPTZ NULL` | Schema dump |
| BE-D08 | Every JSON column has documented schema in code | Code excerpt |
| BE-D09 | Every column with PII is documented in `data-classification.md` | Doc file |
| BE-D10 | Every email column has email format validation | Schema or app code |
| BE-D11 | Every phone column has +63 format validation | Code excerpt |
| BE-D12 | Every index documented (purpose, expected use) | Schema dump with comments |
| BE-D13 | No N+1 queries in any list endpoint | Query log analysis |
| BE-D14 | Every transaction wraps multiple writes that must be atomic | Code excerpt |
| BE-D15 | Every read-modify-write uses `SELECT ... FOR UPDATE` or DB constraint | Code excerpt |
| BE-D16 | No raw SQL string concatenation; all parameterized | grep audit |
| BE-D17 | No `SELECT *` in production code | grep audit |
| BE-D18 | Every migration is idempotent (`IF NOT EXISTS` etc.) | Migration audit |
| BE-D19 | Every migration tested forward on empty DB | Migration log |
| BE-D20 | Every migration tested forward on populated DB (fixture) | Migration log |
| BE-D21 | No migration edits a previously-committed migration | Git log audit |
| BE-D22 | Every new column with NOT NULL has DEFAULT or backfill plan | Migration audit |
| BE-D23 | Every new index created CONCURRENTLY (production-safe) | Migration audit |
| BE-D24 | Every truncate / drop guarded by env check | grep audit |
| BE-D25 | Every cron job logs start, end, success, error | Code excerpt |
| BE-D26 | Every cron job has timeout | Code excerpt |
| BE-D27 | Every cron job is idempotent (re-run safely) | Test trace |
| BE-D28 | Every external API call has timeout (≤ 30s) | Code excerpt |
| BE-D29 | Every external API call has retry with exponential backoff (where appropriate) | Code excerpt |
| BE-D30 | Every external API failure is logged with context | Sample log entry |

### C3. Authentication and authorization (25 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-AUTH01 | Passwords hashed with bcrypt cost ≥ 10 (or argon2) | Code excerpt |
| BE-AUTH02 | Password reset tokens single-use, expire in ≤ 1 hour | Code excerpt + test |
| BE-AUTH03 | OTP tokens single-use, expire in ≤ 5 minutes | Code excerpt + test |
| BE-AUTH04 | OTP rate-limited (max 3 attempts per 60 seconds per phone) | Code excerpt + test |
| BE-AUTH05 | JWT signed with secret ≥ 32 bytes | Config audit |
| BE-AUTH06 | JWT expiry ≤ 24h for sessions, ≤ 15min for short-lived | Config audit |
| BE-AUTH07 | JWT refresh token rotation implemented | Code excerpt |
| BE-AUTH08 | Logout revokes refresh token | Code excerpt + test |
| BE-AUTH09 | Brute force detection on login (lock after 5 failures) | Code excerpt + test |
| BE-AUTH10 | 2FA TOTP available for admin | Code excerpt |
| BE-AUTH11 | 2FA TOTP enforced for super_admin and finance roles | Code excerpt |
| BE-AUTH12 | Session invalidated on password change | Code excerpt + test |
| BE-AUTH13 | Session invalidated on role change | Code excerpt + test |
| BE-AUTH14 | RBAC checked at endpoint AND at service layer (defense in depth) | Code excerpt |
| BE-AUTH15 | Admin actions on user data have admin user_id in audit log | Audit log sample |
| BE-AUTH16 | Privilege escalation tested negatively (customer can't act as admin) | Test file |
| BE-AUTH17 | Tenant isolation tested (one customer cannot read another's data) | Test file |
| BE-AUTH18 | API keys (if any) hashed at rest, displayed once | Schema audit |
| BE-AUTH19 | Cookie-based sessions use Secure, HttpOnly, SameSite | Config audit |
| BE-AUTH20 | CORS allowlist explicit (no `*` in production) | Config audit |
| BE-AUTH21 | CSRF protection on cookie-based mutating endpoints | Code excerpt |
| BE-AUTH22 | No credentials in URLs (passwords as query params) | grep audit |
| BE-AUTH23 | No credentials in error messages | Code excerpt |
| BE-AUTH24 | No credentials in logs | grep audit |
| BE-AUTH25 | OAuth callback validates state parameter | Code excerpt |

### C4. Money flow integrity (40 checks)

These are the sacred checks. Money flow correctness is foundational.

| ID | Check | Artifact |
|---|---|---|
| BE-M01 | All money values are INTEGER centavos in DB | Schema dump |
| BE-M02 | All money values are integer centavos in API response | Sample response |
| BE-M03 | All money math uses `+`, `-`, `*`, `Math.round()` only | grep audit (no `parseFloat`, no `/`) |
| BE-M04 | Commission calculation uses `service_price` not `total_amount` | Code excerpt + test |
| BE-M05 | Commission calculation correct for each tier (15% new / 13% verified / 11% pro / 9% elite — these are the real values in `packages/api/src/config/platform.config.ts`). Founding tier (10%) is a strategic recommendation NOT yet in code; if Phase 03 adds it, update this check. | Test file |
| BE-M06 | Service fee calculation: 10% with floor 2500, ceil 50000 | Test file |
| BE-M07 | Cancellation refund split matches FR-102 for every scenario | Test file |
| BE-M08 | Escrow money conservation: in = out for every flow | `escrow-money-conservation.test.ts` |
| BE-M09 | Escrow state machine: invalid transitions reject | State machine test |
| BE-M10 | Booking state machine: invalid transitions reject | State machine test |
| BE-M11 | Dispute resolution moves money correctly for each verdict | Dispute test file |
| BE-M12 | Refund issuance: full refund returns full to customer wallet/payment | Test file |
| BE-M13 | Refund issuance: partial refund correct split | Test file |
| BE-M14 | Provider payout: instant GCash returns receipt within 30s OR fails gracefully | Test file |
| BE-M15 | Provider payout: bank transfer queues for daily batch | Test file |
| BE-M16 | Provider payout: failed payout reverses wallet debit | Test file |
| BE-M17 | Provider payout: minimum withdrawal enforced (₱100) | Test file |
| BE-M18 | Provider payout: cannot withdraw negative or zero | Test file |
| BE-M19 | Wallet balance never goes negative without explicit `allow_negative` flag | DB constraint + test |
| BE-M20 | Wallet credit and debit are atomic (transaction) | Code excerpt |
| BE-M21 | Concurrent wallet updates are serialized (FOR UPDATE) | Code excerpt + concurrent test |
| BE-M22 | Double-spend prevention: idempotency keys on payment intents | Code excerpt |
| BE-M23 | PayMongo webhook signature validated | Code excerpt + negative test |
| BE-M24 | PayMongo webhook idempotent (replay safe) | Test file |
| BE-M25 | PayMongo webhook reconciliation cron runs and reports drift | Cron file |
| BE-M26 | Stripe / GCash / Maya webhooks similarly validated and idempotent | Code excerpt |
| BE-M27 | Surge pricing applied at booking creation, not later | Code excerpt + test |
| BE-M28 | Surge pricing logged on booking row | Schema audit |
| BE-M29 | VAT calculated correctly: 12% inclusive vs exclusive correct per spec | Test file |
| BE-M30 | BIR Form 2307 generated correctly per provider per month | Test file + sample PDF |
| BE-M31 | Sequential OR (Official Receipt) numbering: no gaps, no duplicates | Cron + test |
| BE-M32 | OR generation is atomic (no two bookings get same OR number) | Concurrent test |
| BE-M33 | Tip amounts handled separately from service price | Test file |
| BE-M34 | Tip not subject to commission (or per policy) | Code excerpt + test |
| BE-M35 | Promo codes correctly discount; platform absorbs cost (per setting) | Test file |
| BE-M36 | Suki discount applied correctly on rebooks | Test file |
| BE-M37 | Referral credit applied correctly on first booking | Test file |
| BE-M38 | Guarantee fund credited on every service fee | Test file |
| BE-M39 | Guarantee fund debited only on approved claim | Test file |
| BE-M40 | Daily reconciliation report compares wallet balances to ledger | Cron + sample report |

### C5. Security and privacy (30 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-S01 | All PII columns documented in `data-classification.md` | Doc file |
| BE-S02 | All PII encrypted at rest (DB-level or column-level) | Config audit |
| BE-S03 | All PII redacted in logs | grep + sample log |
| BE-S04 | All PII redacted in error messages | Sample errors |
| BE-S05 | Database connection over TLS | Config audit |
| BE-S06 | Redis connection over TLS in production | Config audit |
| BE-S07 | All secrets in env vars, not code | grep audit |
| BE-S08 | All secrets validated at startup (fail fast if missing) | Code excerpt |
| BE-S09 | Secret rotation procedure documented | Doc file |
| BE-S10 | No secret logged | grep audit |
| BE-S11 | SQL injection: every query parameterized | grep audit |
| BE-S12 | XSS: all user content escaped on render | React audit (default) |
| BE-S13 | XSS: dangerouslySetInnerHTML reviewed and justified | grep audit |
| BE-S14 | Path traversal: all file paths validated | Code audit |
| BE-S15 | SSRF: all external URLs validated against allowlist | Code audit |
| BE-S16 | Open redirect: all redirect URLs validated | Code audit |
| BE-S17 | CSRF: all mutating endpoints protected (cookie or header) | Config audit |
| BE-S18 | Clickjacking: X-Frame-Options or CSP frame-ancestors set | Header audit |
| BE-S19 | CSP header set with strict policy | Header audit |
| BE-S20 | HSTS header set in production | Header audit |
| BE-S21 | No mixed content (HTTPS pages don't load HTTP resources) | Audit log |
| BE-S22 | NPC consent recorded with timestamp, IP, version | Schema audit |
| BE-S23 | NPC DSR endpoint exists for data access | Code excerpt |
| BE-S24 | NPC DSR endpoint exists for data erasure | Code excerpt |
| BE-S25 | Data retention policy documented | Doc file |
| BE-S26 | PII deletion cascade tested | Test file |
| BE-S27 | Audit log immutable (append-only, hash-chained) | Schema + test |
| BE-S28 | Audit log retention 5 years (BIR/SEC requirement) | Config audit |
| BE-S29 | Backup encryption verified | Procedure doc |
| BE-S30 | Backup restoration tested at least once per release | Procedure doc |

### C6. Reliability and observability (25 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-R01 | Sentry integrated in API, admin, mobile | Config audit |
| BE-R02 | Sentry source maps uploaded for admin | Build script audit |
| BE-R03 | Sentry release tagged on every deploy | Deploy script |
| BE-R04 | Structured logging with correlation IDs | Code excerpt |
| BE-R05 | Every request gets a unique request ID logged | Sample log |
| BE-R06 | Every error has stack trace and request context in log | Sample log |
| BE-R07 | Health check endpoint returns 200 when DB+Redis reachable | Curl trace |
| BE-R08 | Health check endpoint returns 503 when DB unreachable | Curl trace |
| BE-R09 | Liveness probe distinct from readiness probe | Config |
| BE-R10 | Graceful shutdown: SIGTERM finishes in-flight requests | Code excerpt |
| BE-R11 | Database connection pool size documented and tuned | Config audit |
| BE-R12 | Redis connection pool size documented and tuned | Config audit |
| BE-R13 | DB connection retry on transient failure | Code excerpt |
| BE-R14 | DB query timeout set (default 30s) | Config audit |
| BE-R15 | Long-running queries flagged (>5s) | Slow query log |
| BE-R16 | Memory leak detection (heapdump available) | Tooling doc |
| BE-R17 | CPU profiler available (clinic.js or similar) | Tooling doc |
| BE-R18 | Load test passes at 100 concurrent users | Load test report |
| BE-R19 | Load test passes at 10x expected initial load | Load test report |
| BE-R20 | Backup runs daily, encrypted, off-site | Backup log |
| BE-R21 | Restore drill performed at least once per quarter | Drill log |
| BE-R22 | DR runbook documented | Doc file |
| BE-R23 | Incident runbook documented | Doc file |
| BE-R24 | On-call rotation defined (or "Ken is on call" stated) | Doc file |
| BE-R25 | Status page exists for users (or stub for now) | URL |

### C7. Code quality (20 checks)

| ID | Check | Artifact |
|---|---|---|
| BE-Q01 | Zero `any` types | grep audit |
| BE-Q02 | Zero `// @ts-ignore` (or every one in `KNOWN-ISSUES.md`) | grep + doc cross-ref |
| BE-Q03 | Zero `// TODO`, `// FIXME`, `// HACK`, `// PENDING` | grep audit |
| BE-Q04 | Zero `console.log` in production paths | grep audit |
| BE-Q05 | Zero empty `catch` blocks | grep audit |
| BE-Q06 | Zero duplicate code (DRY check via `jscpd` or similar) | jscpd report |
| BE-Q07 | Cyclomatic complexity < 15 per function | eslint-plugin-complexity report |
| BE-Q08 | Function length < 100 lines (with documented exceptions) | Static analysis |
| BE-Q09 | File length < 1000 lines (with documented exceptions) | Static analysis |
| BE-Q10 | Test coverage ≥ 80% on services that handle money | Coverage report |
| BE-Q11 | Test coverage ≥ 60% overall | Coverage report |
| BE-Q12 | Mutation score ≥ 60% on money services | Stryker report |
| BE-Q13 | No deprecated dependencies (`npm audit`) | npm audit log |
| BE-Q14 | No high/critical CVEs (`npm audit --audit-level=high`) | npm audit log |
| BE-Q15 | All dependencies pinned to exact version | package.json audit |
| BE-Q16 | All dependencies declared (no implicit deps) | depcheck output |
| BE-Q17 | No unused dependencies | depcheck output |
| BE-Q18 | API contract change has migration path documented | Doc check |
| BE-Q19 | Breaking changes versioned (v1 / v2) | Code audit |
| BE-Q20 | Comments only where code can't explain itself; no commented-out code | grep audit |

---

## PART D — DATABASE CHECKLIST (50 items)

### D1. Schema integrity (20 checks)

| ID | Check | Artifact |
|---|---|---|
| DB-S01 | Every table has primary key | Schema audit |
| DB-S02 | Every table has `created_at`, `updated_at` columns | Schema audit |
| DB-S03 | Every table has comment explaining purpose | Schema audit |
| DB-S04 | Every column has comment where name is non-obvious | Schema audit |
| DB-S05 | No reserved words used as column names | Schema audit |
| DB-S06 | snake_case for all identifiers | Schema audit |
| DB-S07 | Singular table names (or consistent) | Schema audit |
| DB-S08 | Foreign keys named `_id` suffix | Schema audit |
| DB-S09 | Boolean columns named with `is_`, `has_`, `can_` prefix | Schema audit |
| DB-S10 | Every status enum constraint has explicit allowed values | Schema audit |
| DB-S11 | Every nullable column documented as intentional | Schema audit |
| DB-S12 | No string columns wider than necessary (use VARCHAR(N) appropriately) | Schema audit |
| DB-S13 | Index every foreign key | Schema audit |
| DB-S14 | Index every column used in WHERE / ORDER BY of common queries | Schema audit |
| DB-S15 | No redundant indexes (B is prefix of A) | pg_stat advisor |
| DB-S16 | No unused indexes (after 1 month of production use) | pg_stat_user_indexes |
| DB-S17 | Every UNIQUE constraint documented (purpose) | Schema audit |
| DB-S18 | Every CHECK constraint documented (purpose) | Schema audit |
| DB-S19 | Every TIMESTAMPTZ uses UTC (no naive timestamps) | Schema audit |
| DB-S20 | Every monetary column documented as centavos in column comment | Schema audit |

### D2. Migration safety (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DB-M01 | Every migration has up and down (or documented one-way) | Migration audit |
| DB-M02 | Migration file numbering sequential, no gaps | File listing |
| DB-M03 | Migration file naming matches pattern `NNN_description.sql` | File listing |
| DB-M04 | Migration tested on empty DB | Test log |
| DB-M05 | Migration tested on populated DB | Test log |
| DB-M06 | Migration runs in < 30 seconds (small data) | Migration log |
| DB-M07 | Long migrations broken into reversible steps | Migration audit |
| DB-M08 | `ALTER TABLE ADD COLUMN NOT NULL` has DEFAULT or backfill | Migration audit |
| DB-M09 | `CREATE INDEX` uses CONCURRENTLY in production | Migration audit |
| DB-M10 | Renames done as add-new-column / dual-write / drop-old (zero-downtime) | Migration audit |
| DB-M11 | No migration drops a column that's still referenced in active code | Code grep |
| DB-M12 | No migration committed without `npm run migrate:down --workspace=packages/api && npm run migrate:up --workspace=packages/api` passing | Test log |
| DB-M13 | Seed data scripts separate from migrations | File audit |
| DB-M14 | Seed data idempotent (uses INSERT ... ON CONFLICT) | Code audit |
| DB-M15 | Production migration runbook exists | Doc file |

### D3. Query patterns (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DB-Q01 | All queries parameterized (no string concat) | grep audit |
| DB-Q02 | All queries use `db.query` helper, not raw pool | grep audit |
| DB-Q03 | All multi-step writes use `db.transaction` | Code audit |
| DB-Q04 | All read-modify-write uses FOR UPDATE | Code audit |
| DB-Q05 | All list queries have LIMIT | grep audit |
| DB-Q06 | All list queries with offset have ORDER BY (deterministic) | grep audit |
| DB-Q07 | Cursor-based pagination for large lists (use `created_at, id` cursor) | Code audit |
| DB-Q08 | EXPLAIN ANALYZE for queries on tables > 10K rows shows index use | EXPLAIN logs |
| DB-Q09 | No SELECT * in production code | grep audit |
| DB-Q10 | JOIN order optimized (smallest table first or per planner) | EXPLAIN logs |
| DB-Q11 | No correlated subqueries where JOIN works | Code audit |
| DB-Q12 | No COUNT(*) on huge tables; use approx where acceptable | Code audit |
| DB-Q13 | Soft deletes filter `deleted_at IS NULL` consistently | grep audit |
| DB-Q14 | Tenancy filters applied at every query (defense in depth) | grep audit |
| DB-Q15 | Bulk operations batched (max 1000 per statement) | Code audit |

---

## PART E — INFRASTRUCTURE & DEPLOYMENT CHECKLIST (40 items)

### E1. Configuration (15 checks)

| ID | Check | Artifact |
|---|---|---|
| INF-C01 | `.env.example` lists every required variable | File audit |
| INF-C02 | App fails to start if any required env var missing | Test |
| INF-C03 | Env validation uses Zod (or equivalent) | Code excerpt |
| INF-C04 | Different envs (dev/staging/prod) clearly separated | Doc + config |
| INF-C05 | No production secret in dev / staging | Audit |
| INF-C06 | Database URLs not embedded in code | grep audit |
| INF-C07 | Feature flags configurable per environment | Config audit |
| INF-C08 | Logging level configurable per environment | Config audit |
| INF-C09 | NODE_ENV explicitly set in production | Deploy script |
| INF-C10 | Process manager configured (PM2 or container) | Config |
| INF-C11 | Process restarts on crash | Config |
| INF-C12 | Logs persisted (not lost on restart) | Config |
| INF-C13 | Logs rotated to prevent disk fill | Config |
| INF-C14 | Disk space monitored (alert at 80%) | Monitoring |
| INF-C15 | Memory monitored (alert at 80%) | Monitoring |

### E2. CI/CD (15 checks)

| ID | Check | Artifact |
|---|---|---|
| INF-CI01 | CI runs on every PR | CI config |
| INF-CI02 | CI runs typecheck | CI config |
| INF-CI03 | CI runs lint | CI config |
| INF-CI04 | CI runs full test suite | CI config |
| INF-CI05 | CI runs database migrations | CI config |
| INF-CI06 | CI runs npm audit | CI config |
| INF-CI07 | CI runs verify-no-forbidden | CI config |
| INF-CI08 | CI runs verify-no-emoji | CI config |
| INF-CI09 | CI fails on any check failure | CI config |
| INF-CI10 | CI status required for merge to main | Branch protection |
| INF-CI11 | Deploy gated on CI success | Deploy config |
| INF-CI12 | Deploy supports rollback in < 5 minutes | Runbook |
| INF-CI13 | Deploy logs accessible to Ken | Doc |
| INF-CI14 | Deploy notifications (Slack / email / SMS) | Config |
| INF-CI15 | Production deploy requires confirmation | Deploy script |

### E3. Monitoring & alerts (10 checks)

| ID | Check | Artifact |
|---|---|---|
| INF-M01 | Sentry alert on any unhandled exception in API | Sentry config |
| INF-M02 | Sentry alert on >10 errors/minute | Sentry config |
| INF-M03 | Uptime monitor on health endpoint | Monitor config |
| INF-M04 | Alert on uptime < 99% in 5-minute window | Alert config |
| INF-M05 | Alert on payment webhook failure | Alert config |
| INF-M06 | Alert on disputed booking > 4h unaddressed | Alert config |
| INF-M07 | Alert on guarantee fund balance < 30 days runway | Alert config |
| INF-M08 | Alert on database connection pool saturation | Alert config |
| INF-M09 | Alert on Redis connection failure | Alert config |
| INF-M10 | Alert on cron job failure | Alert config |

---

## PART F — DOMAIN-SPECIFIC CHECKLIST (60 items)

### F1. Provider lifecycle (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DOM-P01 | Provider sign-up captures all required NBI/license fields | Form audit |
| DOM-P02 | Provider documents upload, validate MIME, validate size | Code + test |
| DOM-P03 | Provider tier auto-upgrades when criteria met | Cron + test |
| DOM-P04 | Provider tier downgrades on quality drop | Test |
| DOM-P05 | Provider can decline a booking without penalty (within window) | Code + test |
| DOM-P06 | Provider no-show flagged after 30 minutes (configurable) | Cron + test |
| DOM-P07 | Provider repeated no-show (3 in 30 days) auto-suspends | Cron + test |
| DOM-P08 | Provider can update availability without admin intervention | Code + test |
| DOM-P09 | Provider can mark unavailable date range | Code + test |
| DOM-P10 | Provider sees only their own data | Auth test |
| DOM-P11 | Provider GPS check-in within radius of customer | Code + test |
| DOM-P12 | Provider photo upload required for completion | Code + test |
| DOM-P13 | Provider commission tier visible in provider app | Screen audit |
| DOM-P14 | Provider payout history visible | Screen audit |
| DOM-P15 | Provider can request payout from wallet | Code + test |

### F2. Customer lifecycle (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DOM-C01 | Customer sign-up requires valid +63 phone | Form audit + test |
| DOM-C02 | Customer email verification optional but supported | Code + test |
| DOM-C03 | Customer can save multiple addresses | Code + test |
| DOM-C04 | Customer default address used in new bookings | Code + test |
| DOM-C05 | Customer sees only their own bookings | Auth test |
| DOM-C06 | Customer can cancel within window (full / partial / no refund per FR-102) | Code + test |
| DOM-C07 | Customer cannot cancel after job started without dispute | Code + test |
| DOM-C08 | Customer can rate provider after completion | Code + test |
| DOM-C09 | Customer can re-book same provider (Suki discount applies) | Code + test |
| DOM-C10 | Customer can refer friend; both get credit on first paid booking | Code + test |
| DOM-C11 | Customer wallet balance always non-negative | Constraint + test |
| DOM-C12 | Customer can request data download (NPC DSR) | Code + test |
| DOM-C13 | Customer can request account deletion (NPC DSR) | Code + test |
| DOM-C14 | Customer notification preferences respected | Code + test |
| DOM-C15 | Customer can chat with provider per booking only | Code + test |

### F3. Booking lifecycle (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DOM-B01 | Booking creation validates service exists and is active | Code + test |
| DOM-B02 | Booking creation validates address in active service area | Code + test |
| DOM-B03 | Booking creation validates time slot available | Code + test |
| DOM-B04 | Booking creation applies surge pricing if rule active | Code + test |
| DOM-B05 | Booking creation applies promo code if valid | Code + test |
| DOM-B06 | Booking accept locks the slot for the provider | Code + test |
| DOM-B07 | Booking accept fails if slot already taken | Concurrent test |
| DOM-B08 | Booking GPS check-in records provider arrival | Code + test |
| DOM-B09 | Booking before/after photos required | Code + test |
| DOM-B10 | Booking completion sends confirmation request to customer | Code + test |
| DOM-B11 | Booking auto-confirms after 24 hours without customer action | Cron + test |
| DOM-B12 | Booking dispute window of 48 hours after completion | Code + test |
| DOM-B13 | Booking change order requires customer approval | Code + test |
| DOM-B14 | Booking recurring schedule generates next instance correctly | Cron + test |
| DOM-B15 | Booking history searchable by customer, provider, date | Code + test |

### F4. Compliance (15 checks)

| ID | Check | Artifact |
|---|---|---|
| DOM-CMP01 | NPC consent captured at sign-up with version | Code + test |
| DOM-CMP02 | NPC consent updates create new version, old version preserved | Schema + test |
| DOM-CMP03 | NPC DSR endpoint responds within 15 days (SLA tracker) | Code + test |
| DOM-CMP04 | NPC data export includes all PII | Test |
| DOM-CMP05 | NPC data deletion cascades correctly | Test |
| DOM-CMP06 | BIR sequential OR per booking, no gaps | Cron + test |
| DOM-CMP07 | BIR Form 2307 generated monthly per provider | Cron + sample PDF |
| DOM-CMP08 | BIR VAT calculated correctly | Test |
| DOM-CMP09 | BIR monthly report generated and exportable | Cron + sample report |
| DOM-CMP10 | DTI fair-pricing transparency: surge multiplier visible to customer | Screen audit |
| DOM-CMP11 | Anti-Dummy considerations: foreign-owned percentage tracked (if applicable) | Doc |
| DOM-CMP12 | Audit log retention 5 years | Config |
| DOM-CMP13 | Customer terms version stored with consent | Schema + test |
| DOM-CMP14 | Provider terms version stored with consent | Schema + test |
| DOM-CMP15 | DPO contact information visible in privacy policy | Screen audit |

---

## PART G — THE PHASE EXECUTION PROTOCOL (NEW)

This is what changes for every phase. The AI coder cannot run a phase without producing this:

### G1. Pre-flight checklist (mandatory, every phase)

Before starting work:

```bash
mkdir -p .ai-coder/checkpoints/logs/PHASE-NN/preflight

# 1. Capture baseline state
git rev-parse HEAD > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-commit.txt
git status > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-status.txt
git log -10 --oneline > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-log.txt

# 2. Capture baseline tests
npm run api:test 2>&1 | tee .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-tests.log
grep -E "Tests:.*(passed|failed)" .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-tests.log > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-test-count.txt

# 3. Capture baseline file state for the phase scope
find packages/api/src apps/admin/src apps/mobile/app -type f -name "*.ts" -o -name "*.tsx" | xargs sha256sum > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-files.sha256

# 4. Capture baseline DB schema
psql "$DATABASE_URL" -c "\d+" > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-schema.txt

# 5. Capture baseline DB row counts (for tables this phase will touch)
psql "$DATABASE_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname" > .ai-coder/checkpoints/logs/PHASE-NN/preflight/baseline-rowcounts.txt
```

### G2. During-phase logging (mandatory)

Every meaningful action gets logged:

```bash
# Each command's output goes to a numbered log
npm run X 2>&1 | tee .ai-coder/checkpoints/logs/PHASE-NN/work-$(date +%H%M%S)-X.log

# Each significant decision is recorded
echo "[$(date -u +%H:%M:%S)] DECISION: chose X over Y because Z" >> .ai-coder/checkpoints/logs/PHASE-NN/decisions.log
```

### G3. Post-phase checklist (the gauntlet)

The AI coder must produce evidence for every applicable check ID from this document.

The evidence file structure looks like:

```
.ai-coder/checkpoints/logs/PHASE-NN/
├── preflight/
│   ├── baseline-commit.txt
│   ├── baseline-status.txt
│   ├── baseline-log.txt
│   ├── baseline-tests.log
│   ├── baseline-test-count.txt
│   ├── baseline-files.sha256
│   ├── baseline-schema.txt
│   └── baseline-rowcounts.txt
├── work/
│   ├── work-082341-typecheck.log
│   ├── work-091205-test.log
│   └── ... (one per command run)
├── gates/
│   ├── gate-1-typecheck.log
│   ├── gate-1-lint.log
│   ├── gate-1-forbidden.log
│   ├── gate-1-emoji.log
│   ├── gate-2-paper-trace-feature1.md
│   ├── gate-2-boundaries-feature1.md
│   ├── gate-2-newtests.log
│   ├── gate-2-alltests.log
│   ├── gate-3-mutations-test1.md
│   ├── gate-3-mutations-test2.md
│   ├── gate-3-hostile-endpoint1.log
│   ├── gate-3-hostile-endpoint2.log
│   ├── gate-3-premortem.md
│   ├── gate-3-future-bugs.md
│   ├── gate-4-screen-1/
│   │   ├── audit.md
│   │   ├── screenshot-loading.png
│   │   ├── screenshot-error.png
│   │   ├── screenshot-empty.png
│   │   ├── screenshot-success.png
│   │   ├── screenshot-1920.png
│   │   ├── screenshot-1440.png
│   │   ├── screenshot-1280.png
│   │   ├── screenshot-tablet.png
│   │   ├── screenshot-mobile.png
│   │   └── interaction-trace.md
│   ├── gate-5-migrate.log
│   ├── gate-5-fulltests.log
│   ├── gate-5-money.log
│   ├── gate-5-smoke/
│   │   ├── trace.md
│   │   └── screenshots/...
│   └── gate-6-evidence-audit.log
├── checks/
│   ├── FE-V01-passing.md      (one per check ID applicable to this phase)
│   ├── FE-V02-passing.md
│   ├── BE-A01-passing.md
│   ├── ...
│   └── INDEX.md               (lists every check ID applicable, with PASS/N-A/FAIL)
├── EVIDENCE-MANIFEST.md
└── HONESTY-CHECK.md
```

### G4. The CHECK INDEX file

`checks/INDEX.md` is the most important deliverable. It looks like:

```markdown
# Check Index — Phase NN

This phase touched these areas: [admin dashboard, recharts, KPI cards].
Therefore the following check IDs apply:

## Frontend (applicable to this phase)
- [x] FE-V01 — design tokens — see checks/FE-V01-passing.md
- [x] FE-V02 — spacing — see checks/FE-V02-passing.md
- [x] FE-V07 — loading state — see checks/FE-V07-passing.md
- [x] FE-V08 — error state — see checks/FE-V08-passing.md
- [x] FE-V09 — empty state — see checks/FE-V09-passing.md
- [N/A] FE-V10 — success state — N/A (read-only screen, no submit)
... (continues for every check ID)

## Backend (applicable to this phase)
- [N/A] BE-A01 — Zod schemas — N/A (no new endpoints)
- [x] BE-D13 — no N+1 queries — see checks/BE-D13-passing.md
... (continues)

## Domain (applicable to this phase)
- [x] DOM-B15 — booking history searchable — see checks/DOM-B15-passing.md
... (continues)

## Summary
- Applicable: 47
- Passed: 47
- N/A: 23
- Failed: 0
- Cumulative ratio: 100% of applicable checks passed.
```

### G5. The N/A justification rule

If the AI coder marks a check as N/A, it must:

1. Justify why in writing (one sentence minimum)
2. Cite the specific code path or scope reason
3. The justification is reviewable

Vague N/A like "doesn't apply" is a constitutional violation. Real N/A like "this phase only modifies the dashboard page, which has no form submission, therefore form-validation checks do not apply" is acceptable.

---

## PART H — THE 13 ANTI-LAZINESS GUARDS

For each laziness pattern from Part A, the structural defense:

### Guard 1 — Against The Skim
- Every check produces a file. No file = check did not run.
- The evidence audit script reads file sizes. Empty files fail.
- The log timestamp must be within the current session.

### Guard 2 — Against The Stub
- Mutation testing is mandatory on money services.
- A stub test passes both with and without the bug. Mutation testing catches this.

### Guard 3 — Against The Mock-Self
- `verify-no-phantom-tests.sh` greps for `jest.mock('./serviceName')` in `serviceName.test.ts`.
- Detected automatically.

### Guard 4 — Against The Comment-Out
- `verify-no-phantom-tests.sh` greps for `it.skip`, `xit`, `describe.skip`, `it.only`.
- Detected automatically. Pre-commit hook blocks commits.

### Guard 5 — Against The Suppress
- `verify-no-forbidden.sh` greps for `// @ts-ignore`, `as any`, `@ts-expect-error`.
- Pre-commit hook blocks commits.
- Exceptions documented in `KNOWN-ISSUES.md` and reviewed by Ken.

### Guard 6 — Against The Patch
- Pre-mortem requires the AI coder to identify root causes, not symptoms.
- "What's the most likely bug 2 weeks from now?" forces deeper thinking.

### Guard 7 — Against The Phantom
- Every claim → artifact. Evidence manifest enforces this.
- `verify-evidence-manifest.sh` confirms every referenced artifact exists.

### Guard 8 — Against The Drift
- Every dependency added must appear in the approved list (Constitution Article 7).
- `package.json` diffs are reviewed.
- `verify-deps.sh` flags any new dependency not on the approved list.

### Guard 9 — Against The Optimistic Path
- Boundary matrix mandatory for every function (Gate 2b).
- Hostile input testing mandatory for every endpoint (Gate 3c).
- Pre-mortem identifies plausible failure modes.

### Guard 10 — Against The Local-Only
- Every phase must end with `git clean -fdx && npm install && npm run typecheck && npm run test` from a clean checkout.
- The clean-state log is a required artifact.

### Guard 11 — Against The Forgot-Migration
- Every phase must run `npm run migrate:down --workspace=packages/api && npm run migrate:up --workspace=packages/api && npm run migrate:up --workspace=packages/api && npm run api:test` and produce a log.
- A clean migration trace is a required artifact.

### Guard 12 — Against The Quiet Regression
- Full test suite mandatory on every phase, even if the phase didn't touch the area.
- Test count diff (baseline vs final) is a required artifact.

### Guard 13 — Against Honesty Decay
- The Honesty Check at end of each phase asks 3 explicit questions.
- The questions must be answered in writing. Empty or short answers fail the gate.
- A pattern of phases with weak honesty answers signals a drift Ken should investigate.

---

## PART I — THE PRE-COMMIT HOOK (mandatory installation)

The AI coder must install this as a git pre-commit hook in Phase 00:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit
# Auto-installed by Phase 00.
# Refuses commit if any forbidden pattern present.

set -e

echo "Running pre-commit checks..."

bash .ai-coder/checkpoints/verify-no-forbidden.sh
bash .ai-coder/checkpoints/verify-no-phantom-tests.sh

# Quick typecheck (just the staged files)
npx tsc --noEmit

echo "Pre-commit checks passed."
```

This makes laziness mechanically harder: the AI coder cannot commit broken code without explicitly bypassing the hook (`--no-verify`), which leaves an audit trail.

---

## PART J — KEN'S AUDIT TOOLBOX (what Ken can run himself)

Ken cannot read code. But Ken can run these commands at any point to audit the AI coder:

```bash
# 1. List every phase the AI coder claims is done
ls -la .ai-coder/checkpoints/logs/

# 2. For any specific phase, see the evidence
ls -la .ai-coder/checkpoints/logs/PHASE-NN/
cat .ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md
cat .ai-coder/checkpoints/logs/PHASE-NN/HONESTY-CHECK.md
cat .ai-coder/checkpoints/logs/PHASE-NN/checks/INDEX.md

# 3. Re-run the evidence audit script for any phase
bash .ai-coder/checkpoints/verify-evidence-manifest.sh PHASE-NN

# 4. Check that the AI coder didn't add forbidden patterns
bash .ai-coder/checkpoints/verify-no-forbidden.sh

# 5. Check no emoji as iconography
bash .ai-coder/checkpoints/verify-no-emoji.sh

# 6. Check no phantom tests
bash .ai-coder/checkpoints/verify-no-phantom-tests.sh

# 7. Re-run all tests and confirm count
npm run api:test 2>&1 | grep "Tests:"

# 8. Re-run mutation testing on money services
bash .ai-coder/checkpoints/verify-mutation-coverage.sh

# 9. Check what dependencies were added recently
git log --all --since="1 week ago" -- "**/package.json"

# 10. Run a full clean-state validation
git stash
git clean -fdx
npm install
npm run typecheck
npm run lint
npm run api:test
git stash pop
```

If any of these reveal a problem, Ken can confront the AI coder with the evidence. The AI coder cannot deny it.

---

## PART K — THE COMPLETE CHECK COUNT

| Section | Count |
|---|---|
| Frontend visual fidelity | 15 |
| Frontend interactive correctness | 25 |
| Frontend data correctness | 20 |
| Frontend accessibility | 20 |
| Frontend performance | 15 |
| Frontend state and edge cases | 15 |
| Backend API contract | 30 |
| Backend data integrity | 30 |
| Backend authentication and authorization | 25 |
| Backend money flow integrity | 40 |
| Backend security and privacy | 30 |
| Backend reliability and observability | 25 |
| Backend code quality | 20 |
| Database schema integrity | 20 |
| Database migration safety | 15 |
| Database query patterns | 15 |
| Infrastructure configuration | 15 |
| Infrastructure CI/CD | 15 |
| Infrastructure monitoring & alerts | 10 |
| Domain provider lifecycle | 15 |
| Domain customer lifecycle | 15 |
| Domain booking lifecycle | 15 |
| Domain compliance | 15 |
| Anti-laziness guards | 13 |
| **TOTAL CHECK ITEMS** | **463** |

Each phase will only have a subset of these as "applicable" — typically 50-150 per phase. The CHECK INDEX file documents which apply and confirms each one's evidence.

---

## PART L — THE FINAL SAFEGUARD

Even with all 463 checks, the AI coder might still try to fake. Here is the unfakeable layer:

**Every check artifact is hashed. The hashes are committed. Ken can verify hashes against actual file content at any time.**

```bash
# At end of phase, AI coder runs:
find .ai-coder/checkpoints/logs/PHASE-NN -type f -exec sha256sum {} \; > .ai-coder/checkpoints/logs/PHASE-NN/HASHES.sha256

# Ken can verify at any time:
cd .ai-coder/checkpoints/logs/PHASE-NN
sha256sum -c HASHES.sha256
```

If the AI coder edits an artifact after committing the hash, the verification fails. Ken sees this and knows the AI coder has lied about something.

This is the deepest defense. The cryptographic chain makes after-the-fact alteration mechanically impossible without leaving a trace.

---

**The AI coder reads this file at the start of every phase. The phase's CHECK INDEX is built from this. Ken verifies the index at the end of every phase. The system is closed.**
