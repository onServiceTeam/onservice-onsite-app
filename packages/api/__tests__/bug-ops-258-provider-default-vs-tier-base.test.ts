const dbQueryMock = jest.fn();
const getProviderTierCommissionOverviewMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/services/booking-financial-terms.service', () => ({
  getProviderTierCommissionOverview: (...args: unknown[]) => getProviderTierCommissionOverviewMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTierProgression } from '../src/services/provider.service';

function result(rows: unknown[]): Record<string, unknown> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

it('Bug OPS-258 — provider progression separates a provider-specific default agreement from tier base rates', async () => {
  getProviderTierCommissionOverviewMock.mockResolvedValue({
    currentProviderAgreement: {
      commissionRate: 0.12,
      commissionSource: 'provider_contract',
      commissionRateVersionId: 'provider-contract-v3',
    },
    tierBaseRates: [
      ['founding', 0.10], ['new', 0.15], ['verified', 0.13], ['pro', 0.11], ['elite', 0.09],
    ].map(([tier, commissionRate]) => ({ tier, commissionRate })),
  });
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(b.id) FILTER')) {
      return result([{ tier: 'new', completed_jobs: 1, rating: '5.0' }]);
    }
    return result([{ count: '0' }]);
  });

  const data = await getTierProgression('provider-1');

  expect(data.currentCommission).toBe(12);
  expect(data.currentCommissionSource).toBe('provider_contract');
  expect(data.currentCommissionRateVersionId).toBe('provider-contract-v3');
  expect(data.allTiers.find((tier) => tier.tier === 'new')?.commission).toBe(15);
  expect(data.allTiers.flatMap((tier) => tier.benefits).join(' ')).toContain('base commission rate');
  expect(getProviderTierCommissionOverviewMock).toHaveBeenCalledWith(
    'provider-1',
    ['founding', 'new', 'verified', 'pro', 'elite'],
  );
});
