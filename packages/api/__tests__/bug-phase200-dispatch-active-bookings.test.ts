// Phase 200 — dispatch console active-bookings query fix.
//
// The dispatch console fetches /api/v1/admin/bookings?status=active expecting
// every live booking. Pre-fix listBookingsAdmin ran a literal
// `b.status = 'active'`, but no booking is ever stored with the status
// 'active' (it is a logical bucket = ACTIVE_BOOKING_STATUSES), so the
// dispatch table, counters, and map were always empty. The fix expands
// status='active' into `b.status IN (...the active set...)` while keeping
// every other status value an exact match.

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as adminService from '../src/services/admin.service';
import { ACTIVE_BOOKING_STATUSES } from '../src/types/booking.types';

describe('Phase 200 — listBookingsAdmin status=active expansion', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    // listBookingsAdmin runs count first, then the data query.
    dbQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });
  });

  it('expands status=active into b.status IN (...) over the full active set', async () => {
    await adminService.listBookingsAdmin({ status: 'active', page: 1, pageSize: 20 });

    const countSql = dbQueryMock.mock.calls[0]![0] as string;
    const countParams = dbQueryMock.mock.calls[0]![1] as unknown[];

    expect(countSql).toContain('b.status IN (');
    expect(countSql).not.toContain('b.status = $1');
    // One placeholder per active status, all values passed through.
    for (const status of ACTIVE_BOOKING_STATUSES) {
      expect(countParams).toContain(status);
    }
    expect(countParams).toHaveLength(ACTIVE_BOOKING_STATUSES.length);
  });

  it('keeps a concrete status as an exact equality match', async () => {
    await adminService.listBookingsAdmin({ status: 'completed_by_provider', page: 1, pageSize: 20 });

    const countSql = dbQueryMock.mock.calls[0]![0] as string;
    const countParams = dbQueryMock.mock.calls[0]![1] as unknown[];

    expect(countSql).toContain('b.status = $1');
    expect(countSql).not.toContain('b.status IN (');
    expect(countParams).toEqual(['completed_by_provider']);
  });
});
