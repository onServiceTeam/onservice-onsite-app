const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getEscrowSummary } from '../src/services/financial-admin.service';

it('Bug OPS-384 — a missing escrow wallet is unavailable rather than a real zero balance', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(getEscrowSummary()).resolves.toEqual({
    available: false,
    message: 'Escrow accounting is unavailable because the platform wallet is missing.',
    totalInEscrowCentavos: 0,
    pendingReleaseCount: 0,
    agingBuckets: [],
    pendingReleaseList: [],
  });
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
