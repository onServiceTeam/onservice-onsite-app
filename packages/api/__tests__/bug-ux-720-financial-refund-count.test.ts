const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug UX-720 — financial overview counts each customer refund once from its escrow debit', async () => {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM bookings')) {
      return { rows: [{ gmv: '100000', bookings_completed: '1' }], rowCount: 1 };
    }
    expect(sql).toContain("type = 'refund' AND amount < 0");
    expect(sql).not.toContain("type = 'refund' THEN ABS(amount)");
    return { rows: [{ revenue: '15000', refunds: '2500' }], rowCount: 1 };
  });

  const result = await financialAdminService.getFinancialOverview('2026-08-01', '2026-08-31');

  expect(result.refundsCentavos).toBe(2_500);
  expect(result.netRevenueCentavos).toBe(12_500);
});
