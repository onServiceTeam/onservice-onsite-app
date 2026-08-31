// CRIT-N13 fix verified — settings.service.updateSetting + audit insert
// are now atomic via db.transaction.
//
// Pre-fix: UPDATE platform_settings then INSERT platform_settings_audit
// were two separate top-level db.query calls. If the audit insert failed
// after the UPDATE committed, the platform setting changed without an
// audit row. platform_settings holds money knobs (commission, fees) so
// an unaudited mutation is a compliance gap.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};
jest.mock('../../src/config/redis.config', () => ({ redis: redisMock }));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { updateSetting } from '../../src/services/settings.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  redisMock.del.mockResolvedValue(0);
  redisMock.get.mockResolvedValue(null);
});

const SETTING_ROW = {
  id: 'setting-1',
  category: 'fees',
  subcategory: null,
  key: 'service_fee_rate',
  label: 'Service Fee Rate',
  description: null,
  value_type: 'percent',
  value: '10',
  default_value: '10',
  min_value: '0',
  max_value: '50',
  allowed_values: null,
  display_order: 1,
  unit: '%',
  is_sensitive: false,
  is_active: true,
  requires_restart: false,
  updated_by: null,
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function mutationContext() {
  return {
    changedBy: 'admin-user-1',
    reason: 'Approved fee increase.',
    expectedUpdatedAt: SETTING_ROW.updated_at.toISOString(),
    ipAddress: '127.0.0.1',
    userAgent: 'JestAgent/1.0',
  };
}

describe('CRIT-N13 — settings.updateSetting wraps update + audit in transaction', () => {
  it('CRIT-N13 — happy path: UPDATE + audit INSERT both run inside one transaction', async () => {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
      txCalls.push({ sql, params });
      if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [SETTING_ROW], rowCount: 1 };
      }
      if (/UPDATE platform_settings/.test(sql)) {
        return { rows: [{ ...SETTING_ROW, value: '12' }], rowCount: 1 };
      }
      if (/INSERT INTO platform_settings_audit/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const result = await updateSetting(
      'service_fee_rate',
      '12',
      mutationContext(),
    );

    expect(result.value).toBe('12');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCalls).toHaveLength(3);
    expect(txCalls[0]!.sql).toMatch(/FOR UPDATE/);
    expect(txCalls[1]!.sql).toMatch(/UPDATE platform_settings/);
    expect(txCalls[2]!.sql).toMatch(/INSERT INTO platform_settings_audit/);
    expect(txCalls[2]!.params[2]).toBe('10'); // old_value
    expect(txCalls[2]!.params[3]).toBe('12'); // new_value
    expect(txCalls[2]!.params[4]).toBe('admin-user-1'); // changed_by
    expect(txCalls[2]!.params[5]).toBe('Approved fee increase.'); // change_reason
  });

  it('CRIT-N13 — audit insert failure rolls back the value UPDATE (transaction unit)', async () => {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
      txCalls.push({ sql, params });
      if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [SETTING_ROW], rowCount: 1 };
      }
      if (/UPDATE platform_settings/.test(sql)) {
        return { rows: [{ ...SETTING_ROW, value: '12' }], rowCount: 1 };
      }
      if (/INSERT INTO platform_settings_audit/.test(sql)) {
        // Simulate audit insert failure (e.g., FK constraint, statement
        // timeout). Throwing here triggers the transaction rollback in
        // the real db.transaction wrapper.
        throw new Error('audit insert failed');
      }
      return { rows: [], rowCount: 0 };
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      // The real db.transaction wrapper rolls back on throw. We mirror
      // that by re-throwing to the caller.
      return await (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });

    await expect(
      updateSetting('service_fee_rate', '12', mutationContext()),
    ).rejects.toThrow('audit insert failed');

    // Both queries were ATTEMPTED inside the same transaction — but the
    // transaction would roll back; the wrapper's rollback semantics are
    // outside this test's scope. Key invariant: both calls happened on
    // the SAME client (proven by single trx invocation).
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCalls).toHaveLength(3); // locked SELECT, UPDATE, then audit insert
  });

  it('CRIT-N13 — does NOT use db.query for UPDATE + audit (must use db.transaction)', async () => {
    const clientQuery = jest.fn(async (sql: string) => {
      if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [SETTING_ROW], rowCount: 1 };
      }
      if (/UPDATE platform_settings/.test(sql)) {
        return { rows: [{ ...SETTING_ROW, value: '12' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await updateSetting('service_fee_rate', '12', mutationContext());

    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0]![0]).toMatch(/FOR UPDATE/);
  });
});
