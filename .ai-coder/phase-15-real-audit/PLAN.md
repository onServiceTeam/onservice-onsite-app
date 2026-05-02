# Phase 15+ — Real production-readiness audit

**Date opened:** 2026-05-03
**Reason:** Ken's pushback (entirely correct) that prior sessions
treated "tests pass + typecheck clean" as proof of correctness.
That is not what production-readiness means. This document captures
what was actually verified vs. what was claimed, what's still
unknown, and the phased plan to close the gap.

## What this document is

A self-critical audit of the audit. Every claim made in
`.ai-coder/audit-2026-05-01/AUDIT-CLOSEOUT-FINAL.md` and every "fix
DONE" entry in `.ai-coder/fixes-2026-05-02/PROGRESS.md` will be
re-evaluated against three gates:

1. **Code-level proof** — the change actually exists in the
   committed code at the cited file:line, AND the surrounding
   integration is wired (caller exists, consumer exists).
2. **Compile / typecheck** — backend, mobile, admin all type-check
   with the change applied. (This was done. It only proves nothing
   syntactically refers to a missing identifier.)
3. **Runtime proof** — at minimum, a real HTTP request hits the
   route and the response shape matches what the consumer expects.
   For UI changes: a real render in jsdom or a real browser session
   that confirms the JSX tree the user will see.

Anything that doesn't pass all three gates is not "fixed."

## Self-criticism — what 5g–5r got wrong

### 1. Half-wired features were shipped

**LL#12 admin password rotation** (session 5r) — the backend returns
`mustRotatePassword: true` but until a fix-up commit on 2026-05-03
the admin web app had:
- No code reading that flag.
- No `/change-password` page.
- No route guard that intercepts.

A flagged admin would have logged in normally. **Caught only because
Ken pushed back; would have shipped broken.** The fix-up commit added
ChangePasswordPage + MustRotateGuard + 9 tests. Still has not been
verified at runtime against a real Postgres + a real browser session.

### 2. Migration 116 is unverified

The introspection-based CHECK rewrite uses a regex against
`pg_get_constraintdef()` output. Tested only in the head of the
maintainer; never run against a real Postgres. **Risk: medium.** If
the CHECK definition format isn't exactly `((action_type = ANY
(ARRAY[...])))`, the regex won't match and the migration silently
skips the CHECK rewrite — runtime inserts of the new action types
would then hit a constraint violation.

### 3. Terraform never validated

`infra/terraform/iam-api-service-role.tf` references
`aws_s3_bucket.uploads` and `aws_kms_key.uploads`. The references
match the bucket file. But `terraform validate` was never run.
Operators applying this without a `terraform plan` review could hit
errors. **Risk: low** but not zero.

### 4. New HTTP routes never tested at HTTP level

Three new routes (`my-pending-consents`, `legacy-password-stats`,
`flag-legacy-password-hashes`, `me/change-password`) only have
service-level tests and source-content regex assertions. None have
supertest-level tests proving:
- Auth middleware accepts the request shape.
- Super-admin gating returns 403 for non-super-admin.
- Validation errors return the right 400 shape.
- Response JSON matches what the consumer expects.

### 5. Mobile UI changes never rendered

The LL#5 pending-consent banner in `customer/data-rights.tsx` was
added with no jest test that mounts the screen with a non-empty
`pendingConsentsQuery.data` and asserts the banner JSX. **Risk:
high** — the styles object names match the JSX references, but I've
never seen this UI display.

### 6. Audit findings claimed addressed without verification

PROGRESS.md cumulative claim: "138 of ~169 MED-Ns landed". That's a
count of commits, not a count of verified-fixed bugs. Several
"verified-already-addressed" entries (e.g., B-CRIT-04, B-CRIT-12,
B-CRIT-14) were marked done by reading the code, not by running it.

## Environment status (2026-05-03)

What's actually available on this Windows machine:
- ✓ Node 24.13.0
- ✓ Docker installed (Desktop) — **daemon NOT currently running**
- ✗ psql — **not installed**
- ✗ terraform — **not installed**
- ✗ chromium / google-chrome on PATH — **but Chrome MCP tool
  available in this Claude session**
- ✗ xcrun — Windows machine, no iOS simulator possible
- ✗ adb on PATH — but BlueStacks installed for Android emulation
- ✓ Git, npm, jest, vitest

**Implications for runtime testing:**
- Backend HTTP endpoint testing requires Postgres. Either start
  Docker Desktop + spin up a postgres container, or install psql
  locally. **Operator action needed** OR I can install via choco /
  winget if authorized.
- Browser end-to-end testing: feasible via Chrome MCP, no extra
  install needed.
- Android: feasible via BlueStacks if app is built into APK.
- iOS: not feasible on this machine.

## Phase plan

### Phase 15 — file inventory + reality check (this session, in progress)

**Goal:** Real numbers on what exists, what's been touched, what's
been actually verified.

Deliverables:
- File counts by area + line counts. (TODO)
- Per-area "verified at runtime" / "verified at code level" /
  "unverified" classification. (TODO)
- Updated risk register listing every unverified claim from
  prior sessions. (this PLAN.md is the start)

### Phase 16 — runtime environment bring-up

**Goal:** Get a working local stack so subsequent phases can
exercise real flows.

Steps:
1. User starts Docker Desktop (or authorizes me to start it).
2. Spin up postgres + redis containers via the existing
   `infra/docker/` compose if it exists, or write one.
3. Apply all migrations 001-116 against the dev DB.
4. Seed minimal data (1 admin, 1 customer, 1 provider, 1 booking).
5. Run the API server. Hit /health.
6. Run the admin web app. Hit / in Chrome MCP.
7. Confirm screenshots of login + dashboard.

**Blocker if not done:** every subsequent phase needs this. I will
not pretend to test runtime flows without it.

### Phase 17 — verify the most recent fix wave (5g–5r)

**Goal:** Confirm or refute every "DONE" entry in PROGRESS.md
sessions 5g through 5r against the three gates above.

Sub-phases by area:
- 17a — LL#12 password rotation: actually log in, get flagged, see
  redirect, change password, see flag clear.
- 17b — LL#5 forced re-consent: publish material consent via admin,
  log in as customer, see banner, accept, see banner clear.
- 17c — LL#10 IAM: install terraform, run `terraform validate` and
  `terraform plan` against a stub backend.
- 17d — Audit timeline UNION: hit /admin/audit-log against a DB
  with rows in both tables, confirm UNION works.
- 17e — All other 5g–5r commits: walk each one, write the runtime
  check, run it.

### Phase 18 — customer flow audit (live)

For each customer-facing screen, run through:
- Sign up → OTP → verify
- Browse → search → filter
- Select service → schedule → address → pay (sandbox) → confirm
- View booking history → cancel → reschedule
- Message provider → upload photo → leave review
- Wallet top-up, refund, dispute file
- Edge cases: failed payment, network drop, duplicate submit, etc.

Each step gets:
- Screenshot or browser-MCP page snapshot
- Network tab capture of the requests
- DB state check before + after
- Pass / fail + any bugs filed inline

### Phase 19 — provider flow audit (live)

Same pattern, provider side:
- Sign up → onboarding → KYC docs → service area → tier
- Job acceptance → in-progress → photos → signature → complete
- Earnings → payout request → wallet
- Cancellation, dispute response

### Phase 20 — admin flow audit (live)

Same pattern, admin side:
- Login → 2FA enroll → 2FA verify → password rotation forced flow
- Manage users / providers / customers
- Manage bookings (force-complete, reassign, cancel)
- Disputes (assign / message / resolve / escalate)
- Financials (revenue, payouts, escrow, BIR, VAT)
- Catalog mutations
- Settings (each section)
- Audit log (both UNION sources)
- Compliance (DSR, consent versions, breach log)

### Phase 21 — backend code re-read (whole files, not diffs)

For each file in `packages/api/src/services/` and
`packages/api/src/routes/`:
- Read the entire file end-to-end (not just the function I edited).
- Note any TODO, any error path that throws-and-loses, any
  not-yet-wired code, any dead branch.
- Cross-reference each route to a real client caller.

The Phase B–O audit from 2026-05-01 claims this was done. Spot-check
five files and verify.

### Phase 22 — schema audit

For each migration 001–116:
- Read the SQL.
- Confirm every column referenced in services exists.
- Confirm every CHECK constraint accepts every value services emit.
- Confirm every FK ON DELETE / ON UPDATE matches the service-layer
  expectation.

### Phase 23 — security audit

- Auth flows (each role): can a customer hit an admin route?
- Permission gating on every mutating endpoint.
- Rate-limit coverage on every public endpoint.
- Secret handling — JWT_SECRET, TOTP_ENCRYPTION_KEY, etc.
- SQL injection surface (every db.query with template literals).
- XSS surface in admin web (any dangerouslySetInnerHTML, any
  unsanitized user content).
- File upload validation (mime, size, content sniffing).
- CSRF posture on cookie-auth endpoints.

### Phase 24 — payment / money path audit

- escrow.service.ts: every transition reachable, every transition
  has its money-conservation invariant test.
- wallet.service.ts: same.
- booking pricing: client-supplied value never trusted on the
  server side (already audited in CRIT-N09 / N15 — re-verify by
  searching for `req.body.price` / `req.body.total` anywhere).
- PayMongo webhook: signature verification + idempotency + the
  full path the recurring-auto-charge sandbox handler takes.
- Refund + partial refund + dispute refund all conserve money.

### Phase 25 — performance audit

- N+1 queries (search for `.map(async` + `await db.query`).
- Missing indexes (every WHERE clause filter column should have one
  unless small).
- Slow queries logged in dev mode.
- Mobile bundle size + cold-start time.

### Phase 26 — final regression suite + go/no-go

- Whole test corpus runs green: backend + mobile + admin.
- All migrations apply cleanly to a fresh DB.
- All 5 CI gates green.
- Cutover runbook reviewed and operator action items confirmed.

## How I will work in this audit

The user's standing instruction is "no shortcuts, no partial." The
honest interpretation:
- One phase per session if context demands it. Document on disk
  what was checked + what's left.
- For each finding: file:line citation, repro steps, fix in same
  commit when possible, follow-up in PROGRESS.md when not.
- No claiming a phase is done unless every line of the deliverable
  is in this directory.

When I hit a real blocker (no Docker daemon, no psql, no terraform,
no iOS simulator), I will:
1. State the blocker plainly.
2. Propose either operator action OR my own install (choco / winget)
   with explicit risk assessment.
3. Wait for user direction OR proceed if pre-authorized.

## Immediate next steps (this session, after this PLAN.md lands)

1. Commit the LL#12 fix-up wave (ChangePasswordPage + auth store +
   route guard + 9 tests + this PLAN.md).
2. Inventory: count files + lines per area.
3. Tag this commit `phase-15-opened`.
