const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getBirReportsOverview } from '../src/services/financial-admin.service';

afterEach(() => {
  jest.useRealTimers();
  dbQueryMock.mockReset();
});

it('Bug PHASE130-02 — financial overview defaults to the current Manila year at the UTC year boundary', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-12-31T19:30:00Z'));
  dbQueryMock.mockResolvedValue({ rows: [{ exists: null }], rowCount: 1 });

  const overview = await getBirReportsOverview();

  expect(overview.annualSummary.year).toBe(2027);
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
});
