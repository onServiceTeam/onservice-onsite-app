jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assertBusinessCreditAvailableInTransaction } from '../src/services/business-invoice-control.service';

it('Bug OPS-356 — projected business exposure fails closed before centavo addition loses integer precision', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [{
      status: 'active',
      record_version: 2,
      current_terms_id: 'terms-356',
      monthly_credit_limit: Number.MAX_SAFE_INTEGER,
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ exposure: Number.MAX_SAFE_INTEGER - 5 }], rowCount: 1 });

  await expect(assertBusinessCreditAvailableInTransaction(
    { query }, {
      accountId: 'account-356',
      contractId: 'contract-356',
      termsVersionId: 'terms-356',
      customerId: 'customer-356',
      scheduledAt: '2026-09-15T01:00:00.000Z',
      newBookingAmount: 10,
    },
  )).rejects.toMatchObject({
    message: 'Projected business credit exposure exceeds exact centavo arithmetic limits.',
    statusCode: 409,
  });
});
