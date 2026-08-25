const dbQueryMock = jest.fn();
const getCommissionRateMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../../src/services/settings.service', () => ({
  getCommissionRate: (...args: unknown[]) => getCommissionRateMock(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTierProgression } from '../../src/services/provider.service';

function result(rows: unknown[]): Record<string, unknown> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

it('Bug UX-324 — provider tier metadata uses live Admin rates and implemented facts', async () => {
  const liveRates: Record<string, number> = {
    founding: 0.1025,
    new: 0.1625,
    verified: 0.1275,
    pro: 0.1075,
    elite: 0.0875,
  };
  getCommissionRateMock.mockImplementation(async (tier: string) => liveRates[tier]);
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/SELECT p\.tier, p\.rating[\s\S]*FROM providers p/.test(sql)) {
      return result([{ tier: 'new', completed_jobs: 4, rating: '4.20' }]);
    }
    return result([{ count: '0' }]);
  });

  const data = await getTierProgression('provider-1');

  expect(data.currentCommission).toBe(16.25);
  expect(data.allTiers.map((tier) => tier.commission)).toEqual([10.25, 16.25, 12.75, 10.75, 8.75]);
  expect(data.promotionMode).toBe('admin_review');
  expect(data.progressionTiers.map((tier) => tier.tier)).toEqual(['new', 'verified', 'pro', 'elite']);
  expect(data.allTiers.flatMap((tier) => tier.benefits).join(' ')).not.toMatch(
    /premium customers|surge pricing|priority customer support|exclusive high-value jobs|featured placement/i,
  );
});
