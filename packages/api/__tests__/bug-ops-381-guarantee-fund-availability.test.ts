const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getGuaranteeFundSummary } from '../src/services/financial-admin.service';

it('Bug OPS-381 — a missing guarantee-fund wallet is unavailable rather than a real zero balance', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(getGuaranteeFundSummary()).resolves.toEqual({
    available: false,
    message: 'Guarantee-fund accounting is unavailable because the platform wallet is missing.',
    currentBalanceCentavos: 0,
    inflow30dCentavos: 0,
    outflow30dCentavos: 0,
    net30dCentavos: 0,
    averageMonthlyOutflowCentavos: 0,
    runwayMonths: null,
    needsReplenishment: null,
  });
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
