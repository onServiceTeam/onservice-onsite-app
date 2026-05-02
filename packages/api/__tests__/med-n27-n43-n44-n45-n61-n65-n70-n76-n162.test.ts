// MED-N27 / N43 / N44 / N45 / N61 / N65 / N70 / N76 / N162 fixes.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification-template.service', () => ({
  getTemplateBySlug: jest.fn(),
  renderTemplate: jest.fn(),
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: {
    suspiciousIpThreshold: 5,
  },
}));

const ESCROW_SVC = readFileSync(
  resolve(__dirname, '../src/services/escrow.service.ts'),
  'utf8',
);
const COMPLIANCE_SVC = readFileSync(
  resolve(__dirname, '../src/services/compliance.service.ts'),
  'utf8',
);
const ADMIN_SVC = readFileSync(
  resolve(__dirname, '../src/services/admin.service.ts'),
  'utf8',
);
const CATALOG_SVC = readFileSync(
  resolve(__dirname, '../src/services/catalog.service.ts'),
  'utf8',
);
const BOOKING_SVC = readFileSync(
  resolve(__dirname, '../src/services/booking.service.ts'),
  'utf8',
);
const WORKERS = readFileSync(
  resolve(__dirname, '../src/jobs/workers.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N27 — handleCancellation wraps trx-aware variant in single transaction', () => {
  it('MED-N27 — legacy handleCancellation now delegates to handleCancellationInTransaction', () => {
    // Source-shape check: the legacy entry is a thin wrapper around
    // db.transaction((client) => handleCancellationInTransaction(...)).
    // Match on the function body shape rather than just any occurrence.
    expect(ESCROW_SVC).toMatch(/export async function handleCancellation\([\s\S]{0,300}\): Promise<commissionService\.CancellationRefund> \{\s*\n\s*return db\.transaction/);
    expect(ESCROW_SVC).toMatch(/return db\.transaction\(\(client\) =>\s*\n\s*handleCancellationInTransaction\(/);
  });

  it('MED-N27 — old multi-trx body removed (no second db.transaction(async (client) => after the wrapper)', () => {
    // Slice the function from `export async function handleCancellation(`
    // to the next `export ` to be sure we're checking inside the function.
    const start = ESCROW_SVC.indexOf('export async function handleCancellation(');
    expect(start).toBeGreaterThan(0);
    const after = ESCROW_SVC.indexOf('export ', start + 10);
    const body = ESCROW_SVC.slice(start, after);
    // Should be small (wrapper) — pre-fix body was 100+ lines.
    expect(body.split('\n').length).toBeLessThan(40);
    // Should NOT contain the removed inner workings.
    expect(body).not.toMatch(/refund\.providerCompensationAmount > 0 && bk\.provider_id/);
    expect(body).not.toMatch(/refundFromEscrow\(bookingId/);
  });
});

describe('MED-N43 — updateDsrStatus only stamps completed_at on FULFILLED transitions', () => {
  it('MED-N43 — FULFILLED_STATUSES set is { completed } only', () => {
    expect(COMPLIANCE_SVC).toMatch(/const FULFILLED_STATUSES: ReadonlySet<DsrStatus> = new Set\(\['completed'\]\)/);
  });
  it('MED-N43 — completed_at branch checks FULFILLED_STATUSES, not TERMINAL_STATUSES', () => {
    const start = COMPLIANCE_SVC.indexOf('export async function updateDsrStatus(');
    expect(start).toBeGreaterThan(0);
    const end = COMPLIANCE_SVC.indexOf('export async function', start + 10);
    const body = COMPLIANCE_SVC.slice(start, end);
    expect(body).toMatch(/FULFILLED_STATUSES\.has\(input\.newStatus\)/);
    // The completed_at SET should be guarded by FULFILLED, not TERMINAL.
    const completedAtIdx = body.indexOf("completed_at = NOW()");
    const before = body.slice(Math.max(0, completedAtIdx - 200), completedAtIdx);
    expect(before).toMatch(/FULFILLED_STATUSES/);
    expect(before).not.toMatch(/TERMINAL_STATUSES\.has\(input\.newStatus\)\)\s*\{\s*\n\s*sets\.push\('completed_at/);
  });
});

describe('MED-N44 — exportAuditLogCsv masks PII for non-elevated viewers', () => {
  it('MED-N44 — maskEmailForRole + maskIpForRole helpers exist', () => {
    expect(COMPLIANCE_SVC).toMatch(/function maskEmailForRole\(/);
    expect(COMPLIANCE_SVC).toMatch(/function maskIpForRole\(/);
  });
  it('MED-N44 — super_admin and dpo see full PII; others get masked', () => {
    expect(COMPLIANCE_SVC).toMatch(/role === 'super_admin' \|\| role === 'dpo'/);
  });
  it('MED-N44 — IPv4 mask drops trailing octet', () => {
    const start = COMPLIANCE_SVC.indexOf('function maskIpForRole(');
    const body = COMPLIANCE_SVC.slice(start, start + 800);
    expect(body).toMatch(/parts\[0\]\}\.\$\{parts\[1\]\}\.\$\{parts\[2\]\}\.x/);
  });
});

describe('MED-N45 — exportAuditLogCsvStream emits async-iterable batches', () => {
  it('MED-N45 — exportAuditLogCsvStream is an async generator', () => {
    expect(COMPLIANCE_SVC).toMatch(/export async function\* exportAuditLogCsvStream\(/);
  });
  it('MED-N45 — paginates via LIMIT + OFFSET', () => {
    expect(COMPLIANCE_SVC).toMatch(/LIMIT \$\{take\} OFFSET \$\{offset\}/);
  });
});

describe('MED-N61 — resolveTemplate distinguishes 404 vs real errors', () => {
  it('MED-N61 — 404/template_not_found is logger.debug', () => {
    const start = readFileSync(
      resolve(__dirname, '../src/services/notification.service.ts'),
      'utf8',
    ).indexOf('async function resolveTemplate(');
    const body = readFileSync(
      resolve(__dirname, '../src/services/notification.service.ts'),
      'utf8',
    ).slice(start, start + 2500);
    expect(body).toMatch(/status === 404 \|\| code === 'template_not_found'/);
    expect(body).toMatch(/logger\.debug\('Notification template not found/);
  });
  it('MED-N61 — non-404 errors are logger.error (no longer silent)', () => {
    const body = readFileSync(
      resolve(__dirname, '../src/services/notification.service.ts'),
      'utf8',
    );
    expect(body).toMatch(/logger\.error\('Notification template lookup failed/);
  });
});

describe('MED-N65 — detectSuspiciousIps batched (4 queries instead of 3N+1)', () => {
  it('MED-N65 — uses ANY($1::inet[]) for the existing-block lookup', async () => {
    const securitySrc = readFileSync(
      resolve(__dirname, '../src/services/security.service.ts'),
      'utf8',
    );
    expect(securitySrc).toMatch(/ip_address = ANY\(\$1::inet\[\]\)/);
    expect(securitySrc).toMatch(/INSERT INTO blocked_ips \(ip_address, reason, blocked_by, expires_at, is_active\)\s+VALUES \$\{valuesSql\.join/);
  });

  it('MED-N65 — bulk insert path executes 2 inserts in single trx (no per-IP roundtrips)', async () => {
    // suspicious returns 3 rows
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { ip_address: '1.2.3.4', fail_count: '6' },
        { ip_address: '5.6.7.8', fail_count: '7' },
        { ip_address: '9.9.9.9', fail_count: '8' },
      ],
      rowCount: 3,
    });
    // none already blocked
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // bulk INSERT into blocked_ips
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    // bulk INSERT into security_events
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const { detectSuspiciousIps } = await import('../src/services/security.service');
    const blocked = await detectSuspiciousIps();
    expect(blocked).toBe(3);
    // Total: 2 SELECTs + 1 trx (which calls 2 INSERTs)
    // = 4 dbQueryMock calls
    expect(dbQueryMock).toHaveBeenCalledTimes(4);
  });

  it('MED-N65 — skips IPs already actively blocked', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { ip_address: '1.2.3.4', fail_count: '6' },
        { ip_address: '5.6.7.8', fail_count: '7' },
      ],
      rowCount: 2,
    });
    // 5.6.7.8 already blocked
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ip_address: '5.6.7.8' }],
      rowCount: 1,
    });
    // bulk INSERT into blocked_ips for 1.2.3.4 only
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // bulk INSERT into security_events
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const { detectSuspiciousIps } = await import('../src/services/security.service');
    const blocked = await detectSuspiciousIps();
    expect(blocked).toBe(1);
  });

  it('MED-N65 — empty suspicious list short-circuits to 0', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { detectSuspiciousIps } = await import('../src/services/security.service');
    const blocked = await detectSuspiciousIps();
    expect(blocked).toBe(0);
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });
});

describe('MED-N70 — change-order auto-expire worker', () => {
  it('MED-N70 — expireApprovedChangeOrders is exported', () => {
    expect(BOOKING_SVC).toMatch(/export async function expireApprovedChangeOrders\(\): Promise<number>/);
  });
  it('MED-N70 — UPDATE atomically flips approved → expired filtering on customer_responded_at', () => {
    expect(BOOKING_SVC).toMatch(/UPDATE change_orders\s+SET status = 'expired'/);
    expect(BOOKING_SVC).toMatch(/customer_responded_at < NOW\(\) - make_interval\(hours => \$1\)/);
  });
  it('MED-N70 — change_order_expired notification type added', () => {
    const NOTIF_SVC = readFileSync(
      resolve(__dirname, '../src/services/notification.service.ts'),
      'utf8',
    );
    expect(NOTIF_SVC).toMatch(/'change_order_expired'/);
  });
  it('MED-N70 — workers.ts wires change-order-expire job + hourly cron', () => {
    expect(WORKERS).toMatch(/case 'change-order-expire'/);
    expect(WORKERS).toMatch(/expireApprovedChangeOrders\(\)/);
    expect(WORKERS).toMatch(/await schedulerQueue\.add\('change-order-expire'/);
    expect(WORKERS).toMatch(/repeat: \{ pattern: '0 \* \* \* \*' \}/);
  });
});

describe('MED-N76 — getRevenueReport uses static-fragment switch (no SQL string interpolation)', () => {
  it('MED-N76 — truncFragmentForPeriod returns one of three static SQL strings', () => {
    expect(ADMIN_SVC).toMatch(/function truncFragmentForPeriod\(period: 'daily' \| 'weekly' \| 'monthly'\): TruncFragment/);
    expect(ADMIN_SVC).toMatch(/return "date_trunc\('day', wt\.created_at\)"/);
    expect(ADMIN_SVC).toMatch(/return "date_trunc\('week', wt\.created_at\)"/);
    expect(ADMIN_SVC).toMatch(/return "date_trunc\('month', wt\.created_at\)"/);
  });
  it('MED-N76 — old `${truncUnit}` interpolation pattern removed', () => {
    // The post-fix code still has the variable name `trunc` but it's a
    // typed function output, not a raw template-literal substitution.
    expect(ADMIN_SVC).not.toMatch(/date_trunc\('\$\{truncUnit\}'/);
  });
});

describe('MED-N162 — catalog deleteSubcategory transactional + audit', () => {
  it('MED-N162 — deleteSubcategory function exists in catalog.service', () => {
    expect(CATALOG_SVC).toMatch(/export async function deleteSubcategory\(\s*\n\s*subcategoryId: string,\s*\n\s*adminUserId: string,/);
  });
  it('MED-N162 — soft-deletes via UPDATE is_active = FALSE inside db.transaction', () => {
    const start = CATALOG_SVC.indexOf('export async function deleteSubcategory(');
    expect(start).toBeGreaterThan(0);
    const body = CATALOG_SVC.slice(start, start + 2500);
    expect(body).toMatch(/db\.transaction\(async \(client\) => \{/);
    expect(body).toMatch(/UPDATE service_subcategories SET is_active = FALSE/);
  });
  it('MED-N162 — writes service_subcategory_deleted admin_actions audit row', () => {
    const start = CATALOG_SVC.indexOf('export async function deleteSubcategory(');
    const body = CATALOG_SVC.slice(start, start + 2500);
    expect(body).toMatch(/INSERT INTO admin_actions \(admin_id, action_type, target_type, target_id, details, reason, full_notes\)/);
    expect(body).toMatch(/'service_subcategory_deleted'/);
  });
  it('MED-N162 — refuses to deactivate already-deactivated subcategory (409)', () => {
    const start = CATALOG_SVC.indexOf('export async function deleteSubcategory(');
    const body = CATALOG_SVC.slice(start, start + 2500);
    expect(body).toMatch(/Subcategory is already deactivated/);
    expect(body).toMatch(/409/);
  });
  it('MED-N162 — route now delegates to catalogService.deleteSubcategory (no inline UPDATE branch)', () => {
    const ROUTES = readFileSync(
      resolve(__dirname, '../src/routes/catalog.routes.ts'),
      'utf8',
    );
    expect(ROUTES).toMatch(/await catalogService\.deleteSubcategory\(id, req\.user!\.userId, reason\)/);
    // Old back-compat fallback should be gone.
    expect(ROUTES).not.toMatch(/typeof svc\.deleteSubcategory === 'function'/);
  });
});
