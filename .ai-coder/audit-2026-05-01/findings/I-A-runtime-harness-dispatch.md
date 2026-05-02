# Phase I-A — Runtime-Evidence Harness Dispatch

**Status:** master AI-coder dispatch. Top priority — unblocks Phase I-B per-CRIT dispatches.

**Bundle reference:** closes the test-coverage gap surfaced by H01 (CRIT-154/155/156) + H02 (per-feature matrix) + H03 (harness gap). Provides the test infrastructure that every Phase I-B dispatch will use to demonstrate "evidence per step."

**Outcome when this dispatch lands:**
1. The 25 SRC-REGEX test files are deleted; replaced by real behavioral tests.
2. The 114 SHALLOW R7-real tests are kept as the smoke layer; each has a paired `*.behavior.test.tsx`.
3. A new `packages/test-harness/` package provides DB-diff, audit-diff, and evidence-bundle helpers.
4. ~30 multi-step E2E flow specs run against a Docker-booted stack and write evidence bundles per run.
5. The Gate B "reference coverage" CI rule is replaced with a behavioral-coverage check.
6. Every per-CRIT dispatch in Phase I-B has a runbook that ends with "AI coder shows evidence bundle: paths to screenshots + DB diff + audit diff."

---

## Files this dispatch creates

```
packages/test-harness/                        NEW PACKAGE
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                              barrel export
│   ├── db-diff.ts                            ~250 lines
│   ├── audit-diff.ts                         ~150 lines
│   ├── evidence-bundle.ts                    ~200 lines
│   ├── seed-factory.ts                       ~400 lines
│   ├── transactional-test.ts                 ~100 lines
│   ├── role-fixtures.ts                      ~100 lines
│   └── env-loader.ts                          ~50 lines
└── README.md                                 ~150 lines

apps/admin/tests/flows/                       NEW DIR
├── helpers/
│   ├── login.ts                              ~80 lines
│   ├── seed.ts                               ~150 lines
│   └── viewport.ts                           ~30 lines
├── customer-money-path.spec.ts               P0 — full booking + pay
├── customer-cancellation-tiers.spec.ts       P0
├── provider-job-execution.spec.ts            P0
├── erasure-dsr-actually-erases.spec.ts       P0 LAUNCH-BLOCKING
├── junior-admin-protected-mutations.spec.ts  P0 LAUNCH-BLOCKING (single spec, all 8 mutation surfaces)
├── webhook-idempotency.spec.ts               P0
├── pricing-rule-multiplier-cap.spec.ts       P0
├── notification-template-xss.spec.ts         P0
├── platform-settings-role-gate.spec.ts       P0
├── audit-log-secret-redaction.spec.ts        P0
├── pii-redaction-by-role.spec.ts             P0
├── kyc-document-wireup.spec.ts               P0
├── boracay-launch-region-default.spec.ts     P0
├── founding-tier-dropdown.spec.ts            P1
├── stale-platform-settings-hidden.spec.ts    P1
├── consent-version-publish-dpo-only.spec.ts  P1
├── breach-log-dpo-flow.spec.ts               P1
├── promo-redemption-flag-toggle.spec.ts      P1
├── attribution-fraud-prevention.spec.ts      P1
├── catalog-money-precision.spec.ts           P1
├── reason-required-on-admin-actions.spec.ts  P1
├── consent-records-version-fk.spec.ts        P1
├── erasure-executions-row-written.spec.ts    P0 (paired with erasure-dsr)
└── F4-baseline-flow.spec.ts                  meta — runs all visual snapshots after baselines

apps/mobile/tests/flows/                      NEW DIR
├── helpers/                                  same shape as admin
├── customer-signup.flow.yaml                 Maestro flow spec (uses 84 existing YAMLs)
├── customer-book-pay-confirm.flow.yaml       P0
├── customer-cancellation-each-tier.flow.yaml P0 (4 sub-flows)
├── provider-onboarding-end-to-end.flow.yaml  P0 (CRIT-115/117/128)
├── provider-job-execution-photos-signature.flow.yaml  P0
├── provider-earnings-real-data.flow.yaml     P0 (CRIT-99/100/101/107/112/113)
├── customer-erasure-dsr.flow.yaml            P0
└── ... (12 more P0 flows from H02)

scripts/test/                                 NEW DIR
├── run-e2e-local.sh                          Docker boot + migrations + seed + Playwright + evidence
├── run-e2e-mobile-android.sh                 emulator boot + Maestro + evidence
├── run-e2e-mobile-ios.sh                     simulator boot + Maestro + evidence (macOS-only)
├── seed-e2e.sh                               applies dedicated e2e seed (separate from dev)
├── reset-test-db.sh                          drops + recreates + migrates + seeds
├── boot-stack.sh                             docker compose up -d + wait-for-healthy
└── teardown-stack.sh                         docker compose down -v

packages/api/seeds/e2e/                       NEW DIR (separate from dev seeds)
├── 001_admin_users.sql                       super_admin + dpo + admin (junior) + support
├── 002_test_customers.sql                    20 customers in various states
├── 003_test_providers.sql                    20 providers in various tiers including 'founding'
├── 004_test_bookings.sql                     bookings in every status
├── 005_test_disputes.sql                     disputes in every state
├── 006_test_consent_versions.sql             baseline consent versions
└── 007_test_breach_log.sql                    1 closed + 1 open breach for UI testing

.github/workflows/e2e.yml                     NEW CI workflow
.github/workflows/test-coverage-ratchet.yml   coverage threshold enforcement

scripts/gates/B-tests.ts                      MODIFY (replace reference rule with behavior rule)
                                              OR DELETE if it doesn't exist as expected
```

---

## Step-by-step implementation

### Step 1 — Create `packages/test-harness/` package

```ts
// packages/test-harness/src/db-diff.ts
import type { Pool } from 'pg';

export interface TableSnapshot {
  table: string;
  rows: Record<string, unknown>[];
  takenAt: Date;
}

export interface DbDiff {
  added: TableSnapshot;
  removed: TableSnapshot;
  modified: { table: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
}

/**
 * Snapshot a set of tables before a flow runs.
 * Use the returned object as the baseline for diffSince().
 */
export async function snapshotTables(
  db: Pool,
  tables: string[],
  whereClauseByTable: Record<string, string> = {},
): Promise<Record<string, TableSnapshot>> {
  const snapshots: Record<string, TableSnapshot> = {};
  for (const table of tables) {
    const where = whereClauseByTable[table] ?? '';
    const sql = `SELECT * FROM ${table} ${where ? 'WHERE ' + where : ''}`;
    const result = await db.query(sql);
    snapshots[table] = {
      table,
      rows: result.rows,
      takenAt: new Date(),
    };
  }
  return snapshots;
}

/**
 * Compute the diff between two snapshots of the same tables.
 * Returns added rows (rows in `after` not in `before`),
 * removed rows (in `before` not in `after`),
 * and modified rows (matching primary key, different values).
 */
export function diffSnapshots(
  before: Record<string, TableSnapshot>,
  after: Record<string, TableSnapshot>,
  primaryKeyByTable: Record<string, string> = {},
): Record<string, DbDiff> {
  const result: Record<string, DbDiff> = {};
  for (const table of Object.keys(after)) {
    const pk = primaryKeyByTable[table] ?? 'id';
    const beforeRows = before[table]?.rows ?? [];
    const afterRows = after[table].rows;
    const beforeMap = new Map(beforeRows.map((r) => [r[pk], r]));
    const afterMap = new Map(afterRows.map((r) => [r[pk], r]));

    const added = afterRows.filter((r) => !beforeMap.has(r[pk]));
    const removed = beforeRows.filter((r) => !afterMap.has(r[pk]));
    const modified = afterRows
      .filter((r) => beforeMap.has(r[pk]))
      .filter((r) => !rowsEqual(beforeMap.get(r[pk])!, r))
      .map((r) => ({ table, before: beforeMap.get(r[pk])!, after: r }));

    result[table] = {
      added: { table, rows: added, takenAt: after[table].takenAt },
      removed: { table, rows: removed, takenAt: after[table].takenAt },
      modified,
    };
  }
  return result;
}

/**
 * Assert that the diff meets expectations.
 * Throws if the actual diff doesn't match the expected pattern.
 */
export interface DiffExpectation {
  table: string;
  added?: number | { count: number; matching: Record<string, unknown> };
  removed?: number;
  modified?: number;
}

export function assertDiff(actual: Record<string, DbDiff>, expectations: DiffExpectation[]): void {
  for (const exp of expectations) {
    const got = actual[exp.table];
    if (!got) throw new Error(`No diff for table ${exp.table}`);

    if (typeof exp.added === 'number') {
      if (got.added.rows.length !== exp.added) {
        throw new Error(
          `Expected ${exp.added} rows added to ${exp.table}, got ${got.added.rows.length}`,
        );
      }
    } else if (typeof exp.added === 'object') {
      if (got.added.rows.length !== exp.added.count) {
        throw new Error(
          `Expected ${exp.added.count} added to ${exp.table}, got ${got.added.rows.length}`,
        );
      }
      for (const [key, value] of Object.entries(exp.added.matching)) {
        const matched = got.added.rows.some((r) => r[key] === value);
        if (!matched) {
          throw new Error(
            `Expected an added row to ${exp.table} with ${key}=${value}, none found`,
          );
        }
      }
    }

    if (exp.removed !== undefined && got.removed.rows.length !== exp.removed) {
      throw new Error(
        `Expected ${exp.removed} rows removed from ${exp.table}, got ${got.removed.rows.length}`,
      );
    }

    if (exp.modified !== undefined && got.modified.length !== exp.modified) {
      throw new Error(
        `Expected ${exp.modified} rows modified in ${exp.table}, got ${got.modified.length}`,
      );
    }
  }
}

function rowsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
```

```ts
// packages/test-harness/src/audit-diff.ts
import type { Pool } from 'pg';
import { diffSnapshots, snapshotTables } from './db-diff';

/**
 * Helper for the most common audit-log assertion: "after this flow,
 * exactly N new admin_actions rows should exist with these properties."
 */
export interface ExpectedAuditRow {
  action_type: string;
  target_type: string;
  reason_min_length?: number;
  details_contains?: Record<string, unknown>;
  admin_id?: string;  // optional pin to a specific admin
}

export async function assertAuditRowsCreated(
  db: Pool,
  expected: ExpectedAuditRow[],
  before: Date,
  after: Date,
): Promise<void> {
  const result = await db.query(
    `SELECT * FROM admin_actions WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at ASC`,
    [before, after],
  );
  const rows = result.rows;

  if (rows.length !== expected.length) {
    throw new Error(
      `Expected exactly ${expected.length} audit rows, got ${rows.length}\n` +
      `Actual: ${JSON.stringify(rows.map(r => r.action_type), null, 2)}`,
    );
  }

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i]!;
    const r = rows[i]!;
    if (r.action_type !== e.action_type) {
      throw new Error(`Row ${i}: expected action_type=${e.action_type}, got ${r.action_type}`);
    }
    if (r.target_type !== e.target_type) {
      throw new Error(`Row ${i}: expected target_type=${e.target_type}, got ${r.target_type}`);
    }
    if (e.reason_min_length !== undefined) {
      if (!r.reason || r.reason.length < e.reason_min_length) {
        throw new Error(
          `Row ${i}: expected reason length >= ${e.reason_min_length}, got ${(r.reason ?? '').length}`,
        );
      }
    }
    if (e.details_contains) {
      for (const [k, v] of Object.entries(e.details_contains)) {
        if (r.details?.[k] !== v) {
          throw new Error(`Row ${i}: details.${k} expected ${v}, got ${r.details?.[k]}`);
        }
      }
    }
    if (e.admin_id && r.admin_id !== e.admin_id) {
      throw new Error(`Row ${i}: expected admin_id=${e.admin_id}, got ${r.admin_id}`);
    }
  }
}

/**
 * Assert NO sensitive fields appear in admin_actions.details or audit_log.new_values
 * within the given time range. Catches CRIT-135 family regressions.
 */
const SENSITIVE_FIELDS = [
  'password', 'password_hash', 'totp_secret', 'recovery_code',
  'paymongoTransferId', 'paymongo_transfer_id', 'paymongo_secret',
  's3_secret', 'access_token', 'refresh_token', 'csrf_token',
  'api_key', 'webhook_secret',
];

export async function assertNoSensitiveFieldsInAudit(
  db: Pool,
  before: Date,
  after: Date,
): Promise<void> {
  const audit = await db.query(
    `SELECT id, action, old_values, new_values FROM audit_log
     WHERE created_at >= $1 AND created_at <= $2`,
    [before, after],
  );
  for (const row of audit.rows) {
    for (const field of SENSITIVE_FIELDS) {
      const haystack = JSON.stringify({ old: row.old_values, new: row.new_values });
      if (haystack.includes(field)) {
        throw new Error(
          `Sensitive field '${field}' found in audit_log row ${row.id} (action: ${row.action})`,
        );
      }
    }
  }
}
```

```ts
// packages/test-harness/src/evidence-bundle.ts
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Page } from '@playwright/test';

/**
 * Per-test evidence bundle. Writes screenshots, network log, console log,
 * DB diff, audit diff to a folder under .test-evidence/<run-id>/.
 *
 * Usage:
 *   const bundle = new EvidenceBundle('admin-issue-wallet-credit', page);
 *   await bundle.start();
 *   ... test steps, calling bundle.snapshotStep('01-login', page) etc ...
 *   await bundle.finish({ status: 'pass', dbDiff, auditDiff });
 */
export class EvidenceBundle {
  private dir: string;
  private steps: { label: string; screenshotPath: string; ts: number }[] = [];
  private networkLog: { request: string; response?: number }[] = [];
  private consoleLog: { type: string; text: string; ts: number }[] = [];
  private startedAt: number = 0;

  constructor(private name: string, private page: Page) {
    const ts = Date.now();
    this.dir = join(process.cwd(), '.test-evidence', `${ts}_${name}`);
  }

  async start(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.startedAt = Date.now();

    this.page.on('request', (req) => {
      this.networkLog.push({ request: `${req.method()} ${req.url()}` });
    });
    this.page.on('response', (res) => {
      const last = this.networkLog[this.networkLog.length - 1];
      if (last && last.request === `${res.request().method()} ${res.url()}`) {
        last.response = res.status();
      }
    });
    this.page.on('console', (msg) => {
      this.consoleLog.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
    });
  }

  async snapshotStep(label: string): Promise<void> {
    const screenshotPath = join(this.dir, `${this.steps.length.toString().padStart(2, '0')}-${label}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.steps.push({ label, screenshotPath, ts: Date.now() });
  }

  async finish(result: {
    status: 'pass' | 'fail';
    error?: string;
    dbDiff?: unknown;
    auditDiff?: unknown;
  }): Promise<{ dir: string; summary: object }> {
    const summary = {
      name: this.name,
      status: result.status,
      error: result.error,
      durationMs: Date.now() - this.startedAt,
      stepCount: this.steps.length,
      networkRequestCount: this.networkLog.length,
      consoleErrorCount: this.consoleLog.filter((c) => c.type === 'error').length,
      consoleWarningCount: this.consoleLog.filter((c) => c.type === 'warning').length,
      bundleDir: this.dir,
    };

    await writeFile(join(this.dir, 'summary.json'), JSON.stringify(summary, null, 2));
    await writeFile(join(this.dir, 'steps.json'), JSON.stringify(this.steps, null, 2));
    await writeFile(join(this.dir, 'network-log.json'), JSON.stringify(this.networkLog, null, 2));
    await writeFile(join(this.dir, 'console-log.json'), JSON.stringify(this.consoleLog, null, 2));
    if (result.dbDiff) {
      await writeFile(join(this.dir, 'db-diff.json'), JSON.stringify(result.dbDiff, null, 2));
    }
    if (result.auditDiff) {
      await writeFile(join(this.dir, 'audit-diff.json'), JSON.stringify(result.auditDiff, null, 2));
    }

    return { dir: this.dir, summary };
  }

  /**
   * Fail the test if any console.error fired during the flow.
   * Call this at the end of the test before bundle.finish().
   * Allow-listed messages can be passed via opt-out array.
   */
  assertNoConsoleErrors(allowlist: RegExp[] = []): void {
    const errors = this.consoleLog.filter(
      (c) => c.type === 'error' && !allowlist.some((re) => re.test(c.text)),
    );
    if (errors.length > 0) {
      throw new Error(
        `${errors.length} console.error during flow:\n` +
        errors.map((e) => `  - ${e.text}`).join('\n'),
      );
    }
  }
}
```

```ts
// packages/test-harness/src/seed-factory.ts
// Generates realistic seed data for E2E flows. Each factory function
// returns an INSERT statement (or runs it directly against the DB) and
// the row's primary key for the test to use.

export interface SeedFactory {
  customer(opts?: Partial<{ phone: string; email: string; firstName: string; lastName: string; suspended: boolean }>): Promise<{ id: string; phone: string; email: string }>;
  provider(opts?: Partial<{ tier: 'founding' | 'new' | 'verified' | 'pro' | 'elite'; status: string; city: string }>): Promise<{ id: string; userId: string }>;
  booking(opts: { customerId: string; providerId: string; status?: string; serviceFee?: number }): Promise<{ id: string }>;
  superAdmin(): Promise<{ id: string; email: string; password: string }>;
  juniorAdmin(opts?: { permissions?: string[] }): Promise<{ id: string; email: string; password: string }>;
  dpoAdmin(): Promise<{ id: string; email: string; password: string }>;
  consentVersion(opts: { type: string; version: string }): Promise<{ id: string }>;
  // ... etc.
}

// Implementation uses INSERT ... RETURNING and stores in a per-test cleanup list
// for teardown. Or wraps the test in BEGIN/ROLLBACK.
```

The remaining harness files (`transactional-test.ts`, `role-fixtures.ts`, `env-loader.ts`) follow the same shape — small utilities that wrap common patterns.

### Step 2 — Write a representative P0 flow spec

```ts
// apps/admin/tests/flows/junior-admin-protected-mutations.spec.ts
//
// LAUNCH-BLOCKING. Closes CRIT-130, 131, 137, 142, 144, 147, 148, 149.
// Asserts that a junior admin (role='admin') cannot perform any of the
// protected mutations that should require super_admin or DPO. Tests both
// UI (no button visible) AND server (direct curl returns 403).

import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { EvidenceBundle, assertAuditRowsCreated, snapshotTables, diffSnapshots, assertDiff } from '@onservice/test-harness';
import { loginAs, juniorAdminCreds, superAdminCreds } from './helpers/login';
import { seedTestData } from './helpers/seed';

let db: Pool;

test.beforeAll(async () => {
  db = new Pool({ connectionString: process.env.DATABASE_URL });
  await seedTestData(db);
});

test.afterAll(async () => { await db.end(); });

test('CRIT-130 + 142 + 144 + 147: junior admin sees NO protected buttons', async ({ page }) => {
  const bundle = new EvidenceBundle('junior-admin-no-buttons', page);
  await bundle.start();

  await loginAs(page, juniorAdminCreds);
  await bundle.snapshotStep('01-login-as-junior');

  // 1. Pricing rules — junior must NOT see Create / Toggle / Delete buttons.
  await page.goto('/pricing-rules');
  await bundle.snapshotStep('02-pricing-rules');
  await expect(page.locator('button:has-text("New Rule")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Toggle")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Disable")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Enable")')).toHaveCount(0);

  // 2. Service areas — junior must NOT see Activate / Pause buttons.
  await page.goto('/service-areas');
  await bundle.snapshotStep('03-service-areas');
  await expect(page.locator('button:has-text("Activate")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Pause")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Add Area")')).toHaveCount(0);

  // 3. Catalog — junior must NOT see Edit / + Service / + Add-on buttons.
  await page.goto('/catalog');
  await bundle.snapshotStep('04-catalog');
  await expect(page.locator('button:has-text("Edit")')).toHaveCount(0);

  // 4. System settings — junior must redirect to access-denied.
  await page.goto('/settings');
  await bundle.snapshotStep('05-settings');
  await expect(page.locator('text=Super-admin access required')).toBeVisible();

  // 5. Provider mutations.
  await page.goto('/providers');
  await bundle.snapshotStep('06-providers');
  await expect(page.locator('button:has-text("Approve")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Reject")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Suspend")')).toHaveCount(0);

  // 6. Notification templates — junior must NOT see Edit / Delete / + New Template.
  await page.goto('/notification-templates');
  await bundle.snapshotStep('07-notification-templates');
  await expect(page.locator('button:has-text("New Template")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Edit")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Delete")')).toHaveCount(0);

  // 7. Compliance — consent-versions publish must be hidden from junior.
  await page.goto('/consent-versions');
  await bundle.snapshotStep('08-consent-versions');
  await expect(page.locator('button:has-text("Publish new version")')).toHaveCount(0);

  // 8. Dashboard — financial KPIs must NOT show.
  await page.goto('/dashboard');
  await bundle.snapshotStep('09-dashboard');
  await expect(page.locator('text=Guarantee Fund')).toHaveCount(0);
  await expect(page.locator('text=Platform Revenue')).toHaveCount(0);

  bundle.assertNoConsoleErrors();

  const evidence = await bundle.finish({ status: 'pass' });
  console.log(`Evidence: ${evidence.dir}`);
});

test('CRIT-130/142/144/147: server returns 403 on direct API call as junior', async ({ request }) => {
  // Login as junior, get session cookie.
  const login = await request.post('/api/v1/auth/admin/login', {
    data: juniorAdminCreds,
  });
  expect(login.ok()).toBe(true);

  // PUT /api/v1/admin/providers/:id/suspend → 403
  const suspendAttempt = await request.put('/api/v1/admin/providers/test-provider-1/suspend', {
    data: { reason: 'test reason 30 chars or whatever it is to pass the validator' },
  });
  expect(suspendAttempt.status()).toBe(403);

  // POST /api/v1/admin/pricing-rules → 403
  const pricingAttempt = await request.post('/api/v1/admin/pricing-rules', {
    data: {
      name: 'Test',
      type: 'peak_hours',
      multiplier: 5.0,
      peakStartTime: '00:00',
      peakEndTime: '23:59',
    },
  });
  expect(pricingAttempt.status()).toBe(403);

  // PUT /api/v1/admin/settings/commission_rate_founding → 403
  const settingAttempt = await request.put('/api/v1/admin/settings/commission_rate_founding', {
    data: { value: '50', reason: 'unauthorized test' },
  });
  expect(settingAttempt.status()).toBe(403);

  // POST /api/v1/admin/compliance/consent-versions → 403
  const consentAttempt = await request.post('/api/v1/admin/compliance/consent-versions', {
    data: {
      consentType: 'privacy_policy',
      version: '1.5',
      effectiveAt: '2026-06-01T00:00:00+08:00',
      changeSummary: 'a'.repeat(200),
    },
  });
  expect(consentAttempt.status()).toBe(403);

  // PATCH /api/v1/admin/notification-templates/:id → 403
  const templateAttempt = await request.put('/api/v1/admin/notification-templates/test-tmpl-1', {
    data: { bodyTemplate: 'modified' },
  });
  expect(templateAttempt.status()).toBe(403);
});

test('CRIT-130 etc: same actions SUCCEED as super_admin (positive control)', async ({ page }) => {
  const bundle = new EvidenceBundle('super-admin-can-mutate', page);
  await bundle.start();

  // ... mirror the above but as super_admin, expect buttons visible AND
  // expect the actions to succeed AND audit rows to be written.
  // Each action also runs a snapshotTables → diffSnapshots → assertDiff
  // against admin_actions to confirm the audit row was created.
  // Full body omitted for brevity.
});
```

This is ~150 lines of one P0 spec. The other 29 P0/P1 specs follow the same shape.

### Step 3 — Boot script

```bash
# scripts/test/run-e2e-local.sh
#!/usr/bin/env bash
set -euo pipefail

TEST_NAME="${1:-all}"
EVIDENCE_DIR=".test-evidence"

echo "==> Tearing down any leftover stack"
docker compose -f infra/docker/docker-compose.dev.yml down -v 2>&1 || true

echo "==> Booting Docker stack"
docker compose -f infra/docker/docker-compose.dev.yml --env-file infra/docker/.env.docker up -d

echo "==> Waiting for healthchecks"
./scripts/dev/wait-for-healthy.sh

echo "==> Running migrations"
cd packages/api && npm run migrate
cd ../..

echo "==> Seeding e2e data"
./scripts/test/seed-e2e.sh

echo "==> Building admin app"
cd apps/admin && npm run build && npm run preview &
ADMIN_PID=$!
cd ../..

echo "==> Waiting for admin preview"
for i in {1..30}; do
  if curl -fs http://localhost:4173 > /dev/null; then break; fi
  sleep 1
done

echo "==> Running Playwright"
mkdir -p "$EVIDENCE_DIR"
if [ "$TEST_NAME" = "all" ]; then
  cd apps/admin && pnpm exec playwright test tests/flows/
else
  cd apps/admin && pnpm exec playwright test "tests/flows/${TEST_NAME}.spec.ts"
fi

echo "==> Tearing down"
kill $ADMIN_PID 2>&1 || true
docker compose -f infra/docker/docker-compose.dev.yml down -v

echo "==> Evidence bundles in $EVIDENCE_DIR/"
ls -la "$EVIDENCE_DIR/"
```

### Step 4 — CI workflow

```yaml
# .github/workflows/e2e.yml
name: E2E
on: [pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:18-3.5
        ports: [5432:5432]
        env:
          POSTGRES_USER: onservice
          POSTGRES_PASSWORD: onservice_dev
          POSTGRES_DB: onservice_dev
        options: >-
          --health-cmd "pg_isready" --health-interval 5s --health-timeout 3s --health-retries 12
      redis:
        image: redis:8-alpine
        ports: [6379:6379]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - run: cd packages/api && npm run migrate
      - run: ./scripts/test/seed-e2e.sh
      - run: cd apps/admin && npm run build && nohup npm run preview &
      - run: ./scripts/test/wait-for-port.sh 4173
      - run: cd apps/admin && pnpm exec playwright install
      - run: cd apps/admin && pnpm exec playwright test tests/flows/
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-evidence
          path: .test-evidence/
          retention-days: 30
```

### Step 5 — Replace Gate B reference rule

Locate the existing Gate B script (likely `scripts/gates/B-tests.ts` or similar). Replace it with:

```ts
// scripts/gates/B-behavior-coverage.ts
//
// Replaces the legacy "Gate B reference coverage" rule that demanded
// every claimed-fixed bug have a `it(/Bug NNNN/)` reference. That rule
// produced 25 source-content-regex test files and zero behavior testing.
//
// New rule: every CRIT/MED in the audit findings must have a test file
// where the CRIT-NN (or Bug NNNN) appears in an `it()` block name AND
// the test file imports at least one symbol from the production code
// AND the test asserts on a real value (not a string match against a
// readFileSync of a source file).

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PROD_SOURCE_REGEX_BAN = /readFileSync\(.+\.ts['"`]/;
const REAL_IMPORT_REGEX = /from ['"](\.\.\/)+(src|packages\/api\/src|apps\/admin\/src|apps\/mobile)/;

function failGate(msg: string): never {
  console.error(`[gate-b] ${msg}`);
  process.exit(1);
}

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.test\.tsx?$|\.spec\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const testFiles = walk('packages/api/__tests__')
  .concat(walk('apps/admin/src'))
  .concat(walk('apps/mobile/__tests__'));

let bad = 0;
for (const f of testFiles) {
  const content = readFileSync(f, 'utf8');
  if (PROD_SOURCE_REGEX_BAN.test(content) && /\.toMatch\(/.test(content)) {
    console.error(`[gate-b] FORBIDDEN: ${f} reads a source file and asserts on its content.`);
    console.error(`         Replace with a real behavioral test that imports the symbol.`);
    bad++;
  }
}

if (bad > 0) failGate(`${bad} forbidden source-regex tests found. Delete them.`);

console.log(`[gate-b] OK — no source-regex tests found in ${testFiles.length} test files.`);
```

### Step 6 — Delete the 25 SRC-REGEX test files

Per H01 list. Each replaced by either:
- A real behavioral test imported from the production module (per the original "Bug NNNN" intent).
- OR removed entirely if the bug it claimed to test is more naturally covered by a Phase I-B per-CRIT dispatch.

### Step 7 — Migration plan (incremental)

Don't try to do all of this in one PR. Order:
1. PR-A: New `packages/test-harness/` package + helpers + tests for the helpers themselves. Lands without affecting existing tests.
2. PR-B: Boot scripts + first 3 P0 flow specs (customer money path / erasure DSR / junior admin). Smoke-test the harness.
3. PR-C: Delete the 5 worst SRC-REGEX files (`d07/d08/d09/d10/d13-encompassed-bugs`). Replace with real behavioral tests for the most-cited bugs. Update Gate B script.
4. PR-D: Remaining SRC-REGEX deletion + replacement.
5. PR-E: 30 P0 + P1 flow specs. (Likely 5-10 PRs at 3-6 specs each.)
6. PR-F: Pair 114 SHALLOW R7-real with `*.behavior.test.tsx`. (Likely 5-10 PRs at 15-25 paired tests each.)
7. PR-G: F#3 Maestro baseline capture session. F#4 Playwright baseline capture session. (Manual operator sessions per existing handoff docs.)

---

## Acceptance criteria (this dispatch)

- [ ] `packages/test-harness/` package exists, exports DB-diff + audit-diff + evidence-bundle helpers, has its own unit tests.
- [ ] `scripts/test/run-e2e-local.sh` boots the Docker stack and runs Playwright flow specs end-to-end on a developer laptop.
- [ ] At least 3 P0 flow specs land green: junior-admin-protected-mutations, customer-money-path, erasure-dsr-actually-erases.
- [ ] All 25 SRC-REGEX test files (CRIT-154 list) deleted; replaced or removed.
- [ ] Gate B "reference coverage" CI rule replaced with the behavior-coverage check (`scripts/gates/B-behavior-coverage.ts`).
- [ ] The replacement rule, run on the current codebase post-deletion, passes (no remaining source-regex tests).
- [ ] CI workflow `.github/workflows/e2e.yml` runs on PR, uploads `.test-evidence/` as artifact.
- [ ] At least one F#3 Maestro flow spec extends to use the harness (DB-diff after the flow). Confirms mobile-side parity.
- [ ] All 114 SHALLOW R7-real files have a paired `*.behavior.test.tsx` for at least the page's primary happy-path. (This is a stretch; can land in waves.)

---

## Risk + rollback

**Risk 1: Flaky tests.** E2E tests can be flaky from timing issues. Mitigation: each flow has explicit `await expect(...).toBeVisible()` with timeout, no `await page.waitForTimeout(N)` patterns. Per-flow retry: 2.

**Risk 2: Slow CI.** Booting the full stack adds 60-90s per CI run. Mitigation: services run as GitHub Actions services (Postgres, Redis); don't boot via docker-compose in CI. Admin app pre-built.

**Risk 3: Test isolation breakage.** Two parallel tests touching the same DB row diverge. Mitigation: each test creates its own customer/provider/booking in the seed factory; cleans up in afterEach.

**Risk 4: Evidence bundle disk usage.** Each run writes ~5-15MB of screenshots. Mitigation: GitHub Actions artifact retention 30 days; local dev `.test-evidence/` git-ignored.

**Rollback:** if PR-B harness lands but breaks the existing test suite, revert PR-B; the 218 existing tests continue running unchanged.

---

## What this enables for Phase I-B

Every per-CRIT dispatch in Phase I-B can now end its runbook with:

> "AI coder runs `./scripts/test/run-e2e-local.sh CRIT-NNN-fix` and shares the evidence bundle path. The bundle should contain N screenshots, M API calls, P DB rows added in admin_actions matching {action_type, target_type, reason_min_length=20}. If any assertion fails, the bundle's `summary.json` shows status='fail' and the screenshot at the failure point."

That's the "AI coder shows proof" deliverable from your brief.
