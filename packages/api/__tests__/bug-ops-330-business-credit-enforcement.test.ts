jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assertBusinessCreditAvailableInTransaction } from '../src/services/business-invoice-control.service';

it('Bug OPS-330 — a company booking cannot exceed approved exposure across unbilled work and unpaid statements', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [{
      status: 'active', record_version: 2, current_terms_id: 'terms-1', monthly_credit_limit: 100_000,
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ exposure: 80_000 }], rowCount: 1 });

  await expect(assertBusinessCreditAvailableInTransaction(
    { query }, {
      accountId: 'account-1', contractId: 'contract-1', termsVersionId: 'terms-1',
      customerId: 'customer-1', scheduledAt: '2026-09-15T01:00:00.000Z', newBookingAmount: 30_000,
    },
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(query).toHaveBeenCalledTimes(2);
});
