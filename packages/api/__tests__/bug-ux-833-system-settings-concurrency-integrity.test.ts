const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));

const redisDelMock = jest.fn().mockResolvedValue(1);
jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: (...args: unknown[]) => redisDelMock(...args),
    keys: jest.fn(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateSetting, type SettingRow } from '../src/services/settings.service';

it('Bug UX-833 — concurrent setting edits preserve one truthful audit transition and reject the stale overwrite', async () => {
  let persisted: SettingRow = {
    id: 'setting-1',
    category: 'fees',
    subcategory: null,
    key: 'service_fee_rate',
    label: 'Service fee rate',
    description: null,
    value_type: 'percent',
    value: '10',
    default_value: '0',
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
  const auditTransitions: unknown[][] = [];
  const transactionSql: string[] = [];
  let transactionTail: Promise<unknown> = Promise.resolve();

  const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
    transactionSql.push(sql);
    if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
      return { rows: [{ ...persisted }], rowCount: 1 };
    }
    if (/UPDATE platform_settings/.test(sql)) {
      persisted = {
        ...persisted,
        value: String(params[0]),
        updated_by: String(params[1]),
        updated_at: new Date(persisted.updated_at.getTime() + 1),
      };
      return { rows: [{ ...persisted }], rowCount: 1 };
    }
    if (/INSERT INTO platform_settings_audit/.test(sql)) {
      auditTransitions.push(params);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  dbTransactionMock.mockImplementation((callback: unknown) => {
    const run = transactionTail.then(() => (
      callback as (client: { query: typeof clientQuery }) => Promise<unknown>
    )({ query: clientQuery }));
    transactionTail = run.catch(() => undefined);
    return run;
  });

  const expectedUpdatedAt = persisted.updated_at.toISOString();
  const first = updateSetting('service_fee_rate', '11', {
    changedBy: 'admin-a',
    reason: 'Approved first concurrent adjustment.',
    expectedUpdatedAt,
  });
  const second = updateSetting('service_fee_rate', '13', {
    changedBy: 'admin-b',
    reason: 'Approved second concurrent adjustment.',
    expectedUpdatedAt,
  });

  const outcomes = await Promise.allSettled([first, second]);

  expect(outcomes[0]).toMatchObject({ status: 'fulfilled' });
  expect(outcomes[1]).toMatchObject({
    status: 'rejected',
    reason: expect.objectContaining({ statusCode: 409 }),
  });
  expect(persisted.value).toBe('11');
  expect(auditTransitions).toHaveLength(1);
  expect(auditTransitions[0]![2]).toBe('10');
  expect(auditTransitions[0]![3]).toBe('11');
  expect(auditTransitions[0]![4]).toBe('admin-a');
  expect(transactionSql.filter((sql) => /FOR UPDATE/.test(sql))).toHaveLength(2);
  expect(dbQueryMock).not.toHaveBeenCalled();
});
