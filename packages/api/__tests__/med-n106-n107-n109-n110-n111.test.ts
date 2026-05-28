// MED-N106 / MED-N107 / MED-N109 / MED-N110 / MED-N111 fixes verified.

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

import {
  createPricingRule,
  updatePricingRule,
  togglePricingRule,
  deletePricingRule,
} from '../src/services/pricing.service';

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

describe('MED-N110 — createPricingRule writes admin_actions audit row inside trx', () => {
  it('MED-N110 — INSERT pricing_rule + INSERT admin_actions in single trx', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', name: 'rush', type: 'rush', multiplier: 1.5, is_active: true }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const rule = await createPricingRule({
      name: 'rush', type: 'rush', multiplier: 1.5, rushHoursThreshold: 5,
    }, 'super-1');

    expect(rule.id).toBe('pr-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(2);

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'config_changed'/);
    expect(auditCall![0]).toMatch(/'pricing_rule'/);
    const params = auditCall![1] as unknown[];
    expect(params[0]).toBe('super-1');
    expect(params[1]).toBe('pr-1');
    const details = JSON.parse(params[2] as string);
    expect(details.op).toBe('create');
    expect(details.after).toBeDefined();
  });

  it('MED-N110 — back-compat: works without admin id (audit row skipped)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', name: 'rush', type: 'rush', multiplier: 1.5, is_active: true }],
      rowCount: 1,
    });
    const rule = await createPricingRule({
      name: 'rush', type: 'rush', multiplier: 1.5, rushHoursThreshold: 5,
    });
    expect(rule.id).toBe('pr-1');
    // Only INSERT pricing_rule, no audit.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });
});

describe('MED-N111 — updatePricingRule writes audit row inside trx', () => {
  it('MED-N111 — SELECT FOR UPDATE + UPDATE + INSERT audit', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', multiplier: 1.5, name: 'old' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', multiplier: 2.0, name: 'old' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await updatePricingRule('pr-1', { multiplier: 2.0 }, 'super-1');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const selectCall = dbQueryMock.mock.calls[0]!;
    expect(selectCall[0]).toMatch(/SELECT \* FROM pricing_rules WHERE id = \$1 FOR UPDATE/);
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.op).toBe('update');
    expect(details.before).toBeDefined();
    expect(details.after).toBeDefined();
    expect(details.changes).toEqual({ multiplier: 2.0 });
  });
});

describe('MED-N111 — togglePricingRule writes audit row inside trx', () => {
  it('MED-N111 — UPDATE + INSERT audit with op=toggle', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ is_active: true }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', is_active: false }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await togglePricingRule('pr-1', false, 'super-1');

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.op).toBe('toggle');
    expect(details.before).toEqual({ is_active: true });
    expect(details.after).toEqual({ is_active: false });
  });
});

describe('MED-N111 — deletePricingRule writes audit row inside trx', () => {
  it('MED-N111 — SELECT FOR UPDATE snapshot + DELETE + INSERT audit', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', name: 'rush', multiplier: 1.5 }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit

    await deletePricingRule('pr-1', 'super-1');

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.op).toBe('delete');
    expect(details.before).toEqual({ id: 'pr-1', name: 'rush', multiplier: 1.5 });
  });
});

describe('MED-N109 — appVersion read from package.json (not hardcoded)', () => {
  it('MED-N109 — settings.service has getAppVersion helper that reads package.json', () => {
    const SETTINGS_SVC = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/services/settings.service.ts'),
      'utf8',
    );
    expect(SETTINGS_SVC).toMatch(/function getAppVersion\(\)/);
    expect(SETTINGS_SVC).toMatch(/process\.env\.APP_VERSION/);
    expect(SETTINGS_SVC).toMatch(/import apiPackageJson from '\.\.\/\.\.\/package\.json'/);
  });

  it('MED-N109 — getClientConfig calls getAppVersion(), not the hardcoded literal', () => {
    const SETTINGS_SVC = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/services/settings.service.ts'),
      'utf8',
    );
    expect(SETTINGS_SVC).toMatch(/appVersion: getAppVersion\(\)/);
    expect(SETTINGS_SVC).not.toMatch(/appVersion: '0\.1\.0'/);
  });
});
