import { appendAuthorizationTermsInTransaction } from '../src/services/booking-financial-terms.service';

it('Bug OPS-247 — authorization rejects an out-of-range cancellation percentage before snapshotting it', async () => {
  const settings: Record<string, string> = {
    service_fee_rate: '10',
    service_fee_min: '0',
    service_fee_max: '100000',
    guarantee_fund_rate: '1.5',
    cancel_refund_over_24h: '101',
    cancel_refund_2_to_24h: '95',
    cancel_refund_1_to_2h: '85',
    cancel_refund_30min_to_1h: '75',
    cancel_refund_under_30min: '65',
    cancel_refund_provider_arrived: '40',
    cancel_refund_customer_noshow: '0',
  };
  const client = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM bookings')) {
        return { rows: [{
          id: 'booking-1', provider_id: null, category_id: 'category-1', subcategory_id: null,
          status: 'payment_pending', escrow_status: 'pending', service_price: '100000',
          service_fee: '10000', total_amount: '110000',
        }], rowCount: 1 };
      }
      if (sql.includes('FROM booking_financial_terms')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM platform_settings')) {
        return {
          rows: Object.entries(settings).map(([key, value]) => ({
            key, value, updated_at: new Date('2026-09-01T00:00:00.000Z'),
          })),
          rowCount: Object.keys(settings).length,
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };

  await expect(appendAuthorizationTermsInTransaction(client, {
    bookingId: 'booking-1',
    event: 'wallet_payment_authorized',
    sourceEventId: 'payment-1',
  })).rejects.toMatchObject({
    statusCode: 500,
    message: expect.stringContaining('cancel_refund_over_24h'),
  });
});
