const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../src/services/admin-analytics.service';

it('MED-N07 — commission evidence includes the founding provider tier', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  const evidence = await getCommissionEvidence();

  expect(evidence.map((row) => row.tier)).toContain('founding');
  expect(dbQueryMock.mock.calls[0]?.[1]?.[0]).toContain('founding');
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
