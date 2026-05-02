# Phase H Findings Part 3 — Runtime evidence harness gap

## What exists

The codebase has more runtime infrastructure than I initially thought:

| Layer | Exists | Status | Files |
|---|---|---|---|
| **Docker Compose dev stack** | ✅ | works | `infra/docker/docker-compose.dev.yml` (Postgres 18 + PostGIS + Redis 8 + MinIO + MailHog + Prometheus + Grafana + API container) |
| **Docker Compose root** | ✅ | minimal | `docker-compose.yml` (Postgres + Redis only) |
| **Production Docker** | ✅ | exists | `docker-compose.prod.yml` |
| **API Dockerfile** | ✅ | exists | `packages/api/Dockerfile` |
| **DB seed scripts** | ✅ | minimal | `packages/api/seeds/` (categories, test_users, test_bookings) |
| **Playwright specs (admin)** | ✅ | scaffolded | `apps/admin/tests/visual/*.spec.ts` (29 files, one per admin page) |
| **Playwright config** | partial | needs verify | not yet read in audit |
| **Maestro YAMLs (mobile)** | ✅ | scaffolded | `apps/mobile/.maestro/visual/customer/*.yaml` + `.../provider/*.yaml` (84 files) |
| **Baselines** | ❌ | NOT captured | Per CLAUDE.md F#3 + F#4 pending; per `.ai-coder/handoff/F3-maestro-baseline-capture.md` + `F4-playwright-baseline-capture.md` |

## What's MISSING

The harness gap is not infrastructure — it's the **evidence pipeline + multi-step flow specs**:

### Missing #1 — Multi-step flow specs (only single-page snapshot today)

The 29 admin Playwright specs are **visual-snapshot-only**: each spec captures 4 states (default / loading / empty / error) × 3 widths (1280/1440/1920) of ONE page. None of them drive a flow.

Sample (`analytics.spec.ts`):
```ts
test('default render', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page).toHaveScreenshot(`analytics-default-${width}.png`);
});
```

No test does:
```ts
// Login → navigate → fill form → submit → verify result + DB row + audit log
test('admin can issue ₱500 wallet credit to seeded customer', async ({ page, db }) => {
  await loginAsSuperAdmin(page);
  await page.goto('/customers/seed-customer-1');
  await page.click('text=Payments');
  await page.click('text=Issue Credit');
  await page.fill('input[name=amount]', '500');
  await page.fill('textarea[name=reason]', 'Goodwill credit for delayed booking');
  await page.click('text=Confirm');
  await expect(page.locator('text=New balance: ₱500.00')).toBeVisible();
  
  // DB-state-diff
  const tx = await db.query('SELECT * FROM wallet_transactions WHERE wallet_id = ...');
  expect(tx.rows).toHaveLength(1);
  expect(tx.rows[0].amount).toBe(50000);  // centavos
  
  // Audit-log-diff
  const audit = await db.query("SELECT * FROM admin_actions WHERE action_type='customer_credited' ORDER BY created_at DESC LIMIT 1");
  expect(audit.rows[0].details.amount).toBe(50000);
  expect(audit.rows[0].reason).toBeTruthy();
});
```

This shape doesn't exist anywhere in the test suite.

### Missing #2 — DB-state-diff helper

A test needs to be able to:
- snapshot `wallets`, `wallet_transactions`, `bookings`, `admin_actions`, `audit_log` BEFORE a flow runs
- run the flow (UI clicks, API calls)
- snapshot AFTER
- assert on the diff: "exactly N new rows in admin_actions with action_type='customer_credited' and details.amount=50000"

There's no helper for this. Tests would need to:
1. Get a DB client connected to the dev DB
2. Run SELECT queries
3. Compare row sets
4. Output diffs in a test-readable format

This is ~150 lines of helper code (`packages/test-harness/src/db-diff.ts`) that doesn't exist.

### Missing #3 — Audit-log-diff helper

Specifically for `admin_actions` and `audit_log`, every flow should produce a deterministic set of audit rows. The harness needs:
- "expectAuditRow({ admin_id, action_type, target_type, target_id, reason_contains: 'goodwill' })"
- snapshots audit log before/after flow
- asserts no extra rows created (catches over-logging)
- asserts no missing rows (catches silent failure of audit middleware)

### Missing #4 — Network request inspector + console error checker

Already partially supported by Playwright's `page.on('request', ...)` and `page.on('console', ...)`. But not wired up consistently. Each test should:
- Fail if any console.error fires during the flow (default: fail; opt-out per known harmless message)
- Capture every API call the page made + response status; produce a request-diff per flow
- Detect 4xx/5xx that the UI swallows silently (CRIT-126 family)

### Missing #5 — Evidence bundle output

The harness should write a folder per test run:
```
.test-evidence/
  2026-05-02_14-23-01_admin-issue-wallet-credit/
    01-login-page.png
    02-customer-detail.png
    03-issue-credit-dialog.png
    04-confirmation-toast.png
    network-log.json       (every request + response)
    console-log.json       (every browser console message)
    db-before.json         (relevant table snapshots)
    db-after.json
    db-diff.json           (additions/deletions/modifications)
    audit-diff.json        (admin_actions + audit_log additions)
    test-result.json       (pass/fail + assertion outputs)
```

CI uploads this folder as an artifact. Manual review can re-watch the flow via screenshots. The AI coder uses this to "show proof" per your brief.

### Missing #6 — Per-test seed isolation

A test that mutates the DB needs to start from a known state. The current seed scripts (`packages/api/seeds/*.sql`) are a single global seed. Two parallel tests would step on each other's data.

Options:
- Each test runs in a transaction that rolls back at the end (ideal but breaks tests that need cross-connection visibility, e.g., webhook handlers)
- Each test uses a uniquely-named user/booking/etc. created at test start, deleted at test end
- Each test runs against a fresh DB schema (slow but deterministic)

The current test pattern uses jest.mock + in-memory state, which is why no DB-state checks happen — the DB isn't really involved. The harness must change this for runtime tests.

### Missing #7 — The "AI coder runs the test and shows proof" workflow

Your brief specifically asks: "The AI coder should not just say it ran tests. It needs to show proof."

For each E2E flow, the AI coder runbook should be:

```bash
# 1. Boot the system
docker compose -f infra/docker/docker-compose.dev.yml --env-file infra/docker/.env.docker up -d
./scripts/dev/wait-for-healthy.sh   # waits for postgres/redis/api healthchecks

# 2. Run migrations + seed
cd packages/api && npm run migrate && npm run seed:e2e

# 3. Boot the admin app
cd apps/admin && npm run build && npm run preview &

# 4. Boot a customer mobile preview (Expo web)
cd apps/mobile && npm run web &

# 5. Run the flow
cd apps/admin && pnpm playwright test tests/flows/admin-issue-wallet-credit.spec.ts \
  --evidence-bundle=.test-evidence/admin-issue-wallet-credit-$(date +%s)

# 6. Read the evidence bundle and confirm
ls .test-evidence/admin-issue-wallet-credit-*/
cat .test-evidence/admin-issue-wallet-credit-*/test-result.json
```

The AI coder should produce + report:
- The test exit code
- The screenshot folder path
- The network log path
- The DB diff summary
- A natural-language summary: "Login → customer detail → issue credit → confirmed. New balance: ₱500. Audit row written. PASS."

If a test fails, the runbook produces:
- The screenshot at the moment of failure
- The full network log
- The console error log
- The expected vs actual DB state
- The bug trace (which file:line the error originated from)

### Missing #8 — Mobile equivalent (Maestro on real Android emulator + iOS simulator)

The 84 Maestro YAMLs run flows on real devices/simulators. The "evidence bundle" pattern is the same but requires:
- Android emulator boot script
- iOS simulator boot script (macOS-only)
- Maestro CLI configured to capture screenshots per step
- Same DB-diff + audit-diff harness, talking to the dev API

### Missing #9 — CI integration

The runbook above runs locally. CI integration adds:
- Headless mode for Playwright (already supported)
- GitHub Actions matrix for Chrome/Safari/Firefox + 3 viewports
- Artifact upload of evidence bundles per run
- Test-result reporting that surfaces flaky tests over time

---

## What it would take to close the gap

### Phase I-A scope (the "test infrastructure dispatch")

1. **Test harness package**: new `packages/test-harness/` with:
   - DB-diff helpers
   - Audit-log-diff helpers
   - Evidence bundle writer
   - Per-test seed isolation (transaction-based for read-only flows; reset-per-test for write flows)
   - Mock seed-data factory (create-customer, create-provider, create-booking with realistic defaults)

2. **Replace visual-snapshot Playwright specs with flow specs**:
   - Keep the existing `tests/visual/*.spec.ts` for visual regression (after baselines captured per F#4).
   - Add `tests/flows/*.spec.ts` for multi-step flows. ~30 P0 + P1 flows from H02 matrix.

3. **Replace standalone Maestro YAMLs with structured flow specs**:
   - Keep YAMLs as the inner mechanism.
   - Add a flow-runner that: boots emulator → runs YAML → captures screenshots per step → invokes DB-diff harness → writes evidence bundle.
   - 30 P0 + P1 flows for mobile.

4. **Local + CI runbooks**:
   - `scripts/test/run-e2e-local.sh` — full local stack + flow + evidence bundle.
   - `.github/workflows/e2e.yml` — CI variant with Postgres/Redis services.

5. **Delete the 25 SRC-REGEX test files** (per CRIT-154) — replace with real behavioral tests using the new harness.

6. **Replace the "Gate B reference coverage" CI rule** (per CRIT-156) — with a behavioral-coverage check.

### What's LAUNCH-BLOCKING vs nice-to-have

**Launch-blocking E2E flows** (must run + pass before applying `v1.0.0-launch-ready`):

1. Customer signup → book → pay → service performed → confirm → review (full money path)
2. Customer cancellation per refund tier (CRIT-13/42/75/81 + cancellation policy)
3. Provider job execution end-to-end with real photo upload + signature (CRIT-102/103/104/105)
4. Erasure DSR completes → DB has no PII for the user (CRIT-136 — NPC compliance)
5. Junior admin attempts on every protected mutation → 403 (CRIT-130/131/137/142/144/147 family)
6. Webhook retry (PayMongo fires twice) → only one wallet_transactions row (CRIT-19/20/21 idempotency)

**Nice-to-have** (post-launch v1.1):
- Cohort retention E2E
- Browser-compat matrix
- Stress test 1000 concurrent bookings
- Mobile real-device matrix beyond emulators

### Cost estimate

| Item | Effort | Owner |
|---|---|---|
| `packages/test-harness/` (DB-diff, audit-diff, evidence writer, seed factory) | ~2,000 lines | AI coder |
| 30 P0 + P1 Playwright flow specs | ~50 lines × 30 = 1,500 lines | AI coder |
| 30 mobile Maestro flow specs (extend existing 84 with DB-diff) | ~30 lines × 30 = 900 lines | AI coder |
| Replace 25 SRC-REGEX tests with real behavior tests | ~80 lines × 25 = 2,000 lines | AI coder |
| Pair 114 SHALLOW R7-real with `*.behavior.test.tsx` | ~100 lines × 114 = 11,400 lines | AI coder |
| Delete Gate B CI rule, add behavioral-coverage check | ~200 lines | AI coder |
| F#3 + F#4 baseline-capture sessions (per existing handoff) | manual operator session × 2 | AI coder + Ken |
| **Total new test code** | **~18,000 lines** | |

This is roughly half the current test suite size (36,621 lines) added on top. After the dispatches in Phase I-B run, the test suite is ~55,000 lines, with the bottom-up character changing from "smoke + regex" to "real behavior + runtime evidence."

---

## Summary

The gap between your bar ("screenshots + network + DB state + audit diff per step") and current reality is mostly:
- **No multi-step flow specs** (only single-page visual snapshots)
- **No DB-diff or audit-diff helpers**
- **No evidence bundle writer**
- **No real CI integration of the runtime layer**

Infrastructure that DOES exist (Docker stack + Maestro/Playwright scaffolding + seed scripts) is a strong foundation. The Phase I-A dispatch builds on it; nothing has to be reinvented.

The 25 SRC-REGEX files (CRIT-154) and the 114 SHALLOW R7-real files (CRIT-155) are blocking honest CI coverage. They go in the same Phase I-A dispatch.

Phase I-B then closes the 152 CRITs via 25-30 deployable bundles, each of which adds (a) the production code fix, (b) the unit/behavior tests, (c) the runtime flow spec using the harness, (d) the evidence bundle expectation.

Continuing now into Phase I-A.
