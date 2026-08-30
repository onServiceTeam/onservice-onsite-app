const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-496 — booking queue summary counts canonical active, unassigned, support, dispute, and past-scheduled records across the whole queue', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '4' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ total_bookings: '40', active_bookings: '12', unassigned_active: '3', open_support_bookings: '5', disputed_bookings: '2', past_scheduled_bookings: '4' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const result = await listBookingsAdmin({ page: 1, pageSize: 20 });
  const summarySql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('total_bookings'))?.[0]);

  expect(summarySql).toContain("b.provider_id IS NULL AND b.status = 'paid'");
  expect(summarySql).toContain('support_tickets st');
  expect(summarySql).toContain("d.status IN ('open', 'under_review', 'escalated')");
  expect(summarySql).toContain('b.scheduled_at < NOW() AND b.status IN');
  expect(result.summary).toEqual({ totalBookings: 40, activeBookings: 12, unassignedActive: 3, openSupportBookings: 5, disputedBookings: 2, pastScheduledBookings: 4 });
});
