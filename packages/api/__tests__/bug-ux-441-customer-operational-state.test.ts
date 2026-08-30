const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

import { getCustomerProfile } from '../src/services/customer-admin.service';

it('Bug UX-441 — Customer 360 returns fraud-review, active-booking, and open-dispute state needed before support actions', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'customer-1', first_name: 'Ana', last_name: 'Reyes', phone: '+639171234567',
        email: 'ana@example.com', avatar_url: null, is_verified: true, is_active: true,
        is_flagged_fraud: true, last_login_at: null, created_at: new Date('2026-01-01T00:00:00.000Z'),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        lifetime_bookings: '12', lifetime_spent: '450000', active_bookings: '3',
        open_disputes: '2', avg_rating: '4.5', total_reviews: '8',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const profile = await getCustomerProfile('customer-1', 'super_admin');

  expect(profile).toMatchObject({
    isFlaggedFraud: true,
    activeBookings: 3,
    openDisputes: 2,
  });
  expect(queryMock.mock.calls[1][1][0]).toBe('customer-1');
  expect(queryMock.mock.calls[1][1][1]).toEqual(expect.arrayContaining(['requested', 'in_progress']));
});
