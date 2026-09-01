jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assertBusinessCreditAvailableInTransaction } from '../src/services/business-invoice-control.service';

it('Bug OPS-348 — company booking rechecks contract and member authority inside the locked credit transaction', async () => {
  const query = jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(assertBusinessCreditAvailableInTransaction({ query }, {
    accountId: 'account-348',
    contractId: 'contract-cancelled-before-commit',
    termsVersionId: 'terms-348',
    customerId: 'customer-permission-removed',
    scheduledAt: '2026-09-15T01:00:00.000Z',
    newBookingAmount: 100_000,
  })).rejects.toMatchObject({ statusCode: 409 });

  expect(query).toHaveBeenCalledTimes(1);
  const [sql, values] = query.mock.calls[0]!;
  expect(String(sql)).toContain("bc.status = 'active'");
  expect(String(sql)).toContain('bc.provider_id IS NULL');
  expect(String(sql)).toContain('bm.can_book = TRUE');
  expect(String(sql)).toContain('FOR UPDATE OF ba, bc, bm');
  expect(values).toEqual([
    'account-348', 'contract-cancelled-before-commit', 'customer-permission-removed',
    '2026-09-15T01:00:00.000Z',
  ]);
});
