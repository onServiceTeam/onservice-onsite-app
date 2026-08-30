const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { getProviderJobs } from '../src/services/provider-admin.service';

it('Bug UX-453 — provider job rows return the canonical latest dispute identifier', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', customer_id: 'customer-1', customer_name: 'Ana Reyes',
      category_name: 'Cleaning', status: 'disputed', total_amount: 100000,
      service_fee: 10000, scheduled_at: new Date('2026-08-30T00:00:00.000Z'),
      completed_at: null, rating: null, has_dispute: true, dispute_id: 'dispute-latest',
    }], rowCount: 1 });

  const result = await getProviderJobs('provider-1', 1, 20);

  expect(result.rows[0]).toMatchObject({
    id: 'booking-1', customerId: 'customer-1', hasDispute: true, disputeId: 'dispute-latest',
  });
  expect(queryMock.mock.calls[1][0]).toContain('ORDER BY created_at DESC');
});
