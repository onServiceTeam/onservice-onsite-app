const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { formatBookingAdmin, listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-499 — booking operations project linked support-case ownership and open dispute signals without inventing a booking owner', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', customer_id: 'customer-1', provider_id: null, category_id: 'category-1', status: 'paid',
      escrow_status: 'held', total_amount: '125000', city: 'Cebu City', scheduled_at: new Date('2026-08-30T01:00:00.000Z'),
      created_at: new Date('2026-08-29T01:00:00.000Z'), customer_name: 'Ana Reyes', provider_name: null,
      category_name: 'Cleaning', latitude: null, longitude: null, open_support_tickets: '2',
      unassigned_support_tickets: '1', urgent_support_tickets: '1', support_owner_names: 'Jo Santos', open_disputes: '1', past_scheduled: true,
    }], rowCount: 1 });

  const result = await listBookingsAdmin({ page: 1, pageSize: 20 });
  const dataSql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT b.id'))?.[0]);
  const formatted = formatBookingAdmin(result.bookings[0]!);

  expect(dataSql).toContain('st.assigned_agent_id');
  expect(dataSql).toContain('support_owner_names');
  expect(formatted).toMatchObject({ openSupportTickets: 2, unassignedSupportTickets: 1, urgentSupportTickets: 1, supportOwnerNames: 'Jo Santos', openDisputes: 1, pastScheduled: true });
  expect(formatted).not.toHaveProperty('bookingOwner');
});
