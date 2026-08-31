const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug UX-719 — financial breakdowns report recognized ledger revenue instead of customer GMV', async () => {
  queryMock.mockImplementation(async (sql: string) => {
    expect(sql).toContain('FROM wallet_transactions wt');
    expect(sql).toContain("wt.type IN ('commission', 'service_fee')");
    expect(sql).not.toContain('SUM(b.total_amount)');
    return {
      rows: [{ category_id: 'category-1', category_name: 'Cleaning', revenue: '27500', bookings: '3' }],
      rowCount: 1,
    };
  });

  const rows = await financialAdminService.getRevenueByCategory('2026-08-01', '2026-08-31');

  expect(rows).toEqual([{ dimension: 'category-1', label: 'Cleaning', revenueCentavos: 27_500, bookings: 3 }]);
});
