const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/bir-compliance-hold.service', () => ({
  assertBirDocumentWritesEnabled: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { generateQuarterly2307Batches } from '../src/services/bir-2307.service';

it('MED-N21 — one provider batch failure is reported while the next provider still processes', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [
      { provider_id: 'provider-1', quarterly_income: '60000000' },
      { provider_id: 'provider-2', quarterly_income: '60000000' },
    ] })
    .mockResolvedValueOnce({ rows: [
      { provider_id: 'provider-1', ytd_income: '60000000' },
      { provider_id: 'provider-2', ytd_income: '60000000' },
    ] })
    .mockResolvedValueOnce({ rows: [
      { id: 'provider-1', business_name: 'One', tin: '123' },
      { id: 'provider-2', business_name: 'Two', tin: '456' },
    ] })
    .mockRejectedValueOnce(new Error('provider one database failure'))
    .mockResolvedValueOnce({ rows: [{ id: 'existing-batch' }] });

  const result = await generateQuarterly2307Batches(2026, 3);

  expect(result).toMatchObject({
    batchesAttempted: 2,
    batchesFailed: 1,
    batchesSkipped: 1,
    failures: [{ providerId: 'provider-1', error: 'provider one database failure' }],
  });
  expect(dbQueryMock).toHaveBeenCalledTimes(5);
});
