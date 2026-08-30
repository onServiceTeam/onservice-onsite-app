const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

import { getCustomerProfile } from '../src/services/customer-admin.service';

it('Bug UX-450 — Customer 360 counts every open dispute on the customer booking, including provider-filed cases', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'customer-1', first_name: 'Ana', last_name: 'Reyes', phone: '+639171234567',
      email: null, avatar_url: null, is_verified: true, is_active: true,
      is_flagged_fraud: false, last_login_at: null, created_at: new Date('2026-01-01T00:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      lifetime_bookings: '1', lifetime_spent: '0', active_bookings: '1', open_disputes: '1',
      avg_rating: null, total_reviews: '0',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const profile = await getCustomerProfile('customer-1', 'super_admin');

  expect(profile.openDisputes).toBe(1);
  const operationalSummarySql = String(queryMock.mock.calls[1][0]);
  expect(operationalSummarySql).toContain('JOIN bookings dispute_booking');
  expect(operationalSummarySql).toContain('dispute_booking.customer_id = $1');
  expect(operationalSummarySql).not.toContain('d.filed_by = $1');
});
