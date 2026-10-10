const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createPricingRuleDraft } from '../src/services/pricing-publication.service';

it('Bug OPS-322 — a scoped pricing rule is created inactive as an audited draft and preserves a zero platform share', async () => {
  const ruleId = '00000000-0000-4000-8000-000000000322';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const categoryId = '00000000-0000-4000-8000-000000000002';
  const areaId = '00000000-0000-4000-8000-000000000003';
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sqlValue: unknown, paramsValue?: unknown[]) => {
    const sql = String(sqlValue);
    const params = paramsValue ?? [];
    calls.push({ sql, params });
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('INSERT INTO pricing_rules')) {
      return {
        rows: [{
          id: ruleId,
          name: 'Scoped rush',
          type: 'rush',
          multiplier: '1.50',
          rush_hours_threshold: 3,
          category_id: categoryId,
          service_area_id: areaId,
          is_active: false,
          publication_status: 'draft',
          platform_surge_share: '0.00',
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const rule = await createPricingRuleDraft({
    name: 'Scoped rush',
    type: 'rush',
    multiplier: 1.5,
    rushHoursThreshold: 3,
    categoryScope: { mode: 'category', categoryId },
    serviceAreaScope: { mode: 'service_area', serviceAreaId: areaId },
    platformSurgeShare: 0,
    reason: 'Preparing a scoped Cebu rush-price review.',
  }, actorId);

  expect(rule).toMatchObject({ is_active: false, publication_status: 'draft' });
  const insert = calls.find((call) => call.sql.includes('INSERT INTO pricing_rules'));
  expect(insert?.sql).toContain("FALSE, 'draft'");
  expect(insert?.params).toEqual(expect.arrayContaining([categoryId, areaId, 0, actorId]));
  const audit = calls.find((call) => call.sql.includes('INSERT INTO admin_actions'));
  expect(audit?.params).toEqual(expect.arrayContaining([
    actorId,
    ruleId,
    'Preparing a scoped Cebu rush-price review.',
  ]));
  expect(transactionMock).toHaveBeenCalledTimes(1);
});
