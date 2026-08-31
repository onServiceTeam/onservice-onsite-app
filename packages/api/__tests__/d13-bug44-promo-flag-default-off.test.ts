const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getFeatureFlags } from '../src/services/settings.service';

it('Bug 44 — promo redemption remains off when no active launch flag exists', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  const flags = await getFeatureFlags();

  expect(flags.promoRedemptionEnabled).toBe(false);
});
