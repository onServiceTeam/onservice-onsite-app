const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { listLegacyFinancialReviews } from '../src/services/legacy-financial-review.service';

it('Bug OPS-268 — legacy review queue maps money fields and applies the same search to rows and count', async () => {
  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[]) => {
    const sql = String(sqlValue);
    if (sql.includes('COUNT(*)')) {
      expect(sql).toContain("WHERE ($1 = ''");
      expect(params).toEqual(['Maria']);
      return { rows: [{ count: '1' }], rowCount: 1 };
    }
    expect(sql).toContain('ORDER BY queue.created_at ASC');
    expect(params).toEqual([25, 50, 'Maria']);
    return {
      rows: [{
        booking_id: '00000000-0000-4000-8000-000000000268',
        status: 'paid', escrow_status: 'held', customer_id: 'customer-1',
        customer_name: 'Maria Customer', provider_id: 'provider-1',
        provider_name: 'Provider One', current_provider_tier: 'verified',
        category_name: 'Plumbing', service_name: 'Sink repair',
        service_price: '100000', service_fee: '10000', total_amount: '110000',
        payment_method: 'gcash', payment_intent_id: 'pi-268',
        scheduled_at: new Date('2026-08-02T00:00:00.000Z'),
        created_at: new Date('2026-08-01T00:00:00.000Z'),
        updated_at: new Date('2026-08-01T01:00:00.000Z'),
      }],
      rowCount: 1,
    };
  });

  const result = await listLegacyFinancialReviews(25, 50, '  Maria  ');

  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({
    bookingId: '00000000-0000-4000-8000-000000000268',
    servicePriceCentavos: 100000,
    serviceFeeCentavos: 10000,
    totalAmountCentavos: 110000,
    bookingPaymentIntentId: 'pi-268',
  });
});
