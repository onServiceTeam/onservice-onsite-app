const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getFeatureFlags } from '../src/services/settings.service';

it('Bug 45 — A/B testing remains off when no active launch flag exists', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  const flags = await getFeatureFlags();

  expect(flags.abTestingEnabled).toBe(false);
});
