const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { getProviderDisputes } from '../src/services/provider-admin.service';

it('Bug UX-458 — provider disputes return the canonical customer identifier behind the booking', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'dispute-1', booking_id: 'booking-1', customer_id: 'customer-1',
      customer_name: 'Ana Reyes', status: 'open', resolution_type: null,
      created_at: new Date('2026-08-30T00:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getProviderDisputes('provider-1', 1, 20);

  expect(result.rows[0]).toMatchObject({
    id: 'dispute-1', bookingId: 'booking-1', customerId: 'customer-1', customerName: 'Ana Reyes',
  });
});
