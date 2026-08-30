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
    // listBookingsAdmin runs filtered count, whole-queue summary, then data.
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

  it('selects booking latitude/longitude for the dispatch map', async () => {
    await adminService.listBookingsAdmin({ status: 'active', page: 1, pageSize: 20 });
    const dataSql = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT b.id'))?.[0] as string;
    expect(dataSql).toContain('b.latitude');
    expect(dataSql).toContain('b.longitude');
  });
});

describe('Phase 200 — listProviders online filter', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });
  });

  it('online=true restricts to approved + available providers', async () => {
    await adminService.listProviders({ online: true, page: 1, pageSize: 100 });
    const countSql = dbQueryMock.mock.calls[0]![0] as string;
    expect(countSql).toContain("p.status = 'approved'");
    expect(countSql).toContain('p.is_available = TRUE');
  });

  it('omits the online predicates when online is not set', async () => {
    await adminService.listProviders({ page: 1, pageSize: 100 });
    const countSql = dbQueryMock.mock.calls[0]![0] as string;
    expect(countSql).not.toContain('p.is_available = TRUE');
  });
});

describe('Phase 200 — dispatch map coordinates in formatters', () => {
  it('formatBookingAdmin coerces lat/lng strings to numbers', () => {
    const out = adminService.formatBookingAdmin({
      id: 'b1', customer_id: 'c1', provider_id: null, category_id: 'cat1',
      status: 'paid', escrow_status: 'held', total_amount: '10000',
      city: 'Boracay', scheduled_at: new Date(), created_at: new Date(),
      customer_name: 'A B', provider_name: null, category_name: 'Cleaning',
      latitude: '11.96900000', longitude: '121.92700000',
    } as never);
    expect(out.latitude).toBe(11.969);
    expect(out.longitude).toBe(121.927);
  });

  it('formatProvider leaves null coordinates as null', () => {
    const out = adminService.formatProvider({
      id: 'p1', user_id: 'u1', business_name: 'X', description: '', tier: 'new',
      status: 'approved', rating: '5', total_reviews: 0, total_jobs: 0,
      service_radius_km: 10, is_available: true, city: 'Boracay', province: 'Aklan',
      latitude: null, longitude: null, created_at: new Date(), updated_at: new Date(),
      phone: '0900', email: null, full_name: 'X Y',
    } as never);
    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
  });
});
