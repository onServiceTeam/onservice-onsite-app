// BUG-PHASE85-01 — Recurring detail/list endpoints must return the
// enriched fields the customer mobile screens render. Pre-fix the
// queries did `SELECT *` and `formatRecurringBooking` only mapped
// scalar columns. The screens read `categoryName`, `subcategoryName`,
// `providerName`, `nextScheduledDate`, `totalCompleted`, and
// `totalSkipped` — so the title row was empty, the next-date row
// never appeared, the Skip Next button never showed (it gates on
// nextScheduledDate), and counters rendered "undefined".
//
// This test covers two layers:
//  1. The SELECT now JOINs the categories/subcategories/providers/users
//     tables and aggregates recurring_instances counts.
//  2. formatRecurringBooking exposes those fields, plus the
//     `nextScheduledDate` alias and `cancelReason` alias so the
//     mobile screens render the right values without a schema rewrite.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  getCustomerRecurringBookings,
  getRecurringBooking,
  formatRecurringBooking,
} from '../src/services/recurring.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

describe('BUG-PHASE85-01 — recurring queries JOIN names + counts', () => {
  it('BUG-PHASE85-01 — getRecurringBooking SQL joins categories, subcategories, provider, and aggregates instances', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1', provider_id: null, category_id: 'cat1',
        subcategory_id: null, original_booking_id: null,
        frequency: 'weekly', preferred_day: 1, preferred_time: '09:00:00',
        address: 'a', barangay: 'b', city: 'c', province: 'p',
        latitude: null, longitude: null,
        service_price: 50000, service_fee: 5000, total_amount: 55000,
        status: 'active', next_booking_date: '2026-06-01',
        last_booking_date: null, skip_dates: [],
        auto_charge: true, allow_substitute: true, total_instances: 0,
        cancelled_at: null, cancellation_reason: null,
        created_at: new Date(), updated_at: new Date(),
        category_name: 'Cleaning', subcategory_name: null,
        provider_name: null, total_completed: 0, total_skipped: 0,
      }],
      rowCount: 1,
    });

    await getRecurringBooking('rb1', 'c1');
    const sql = dbQueryMock.mock.calls[0]![0] as string;

    expect(sql).toMatch(/LEFT JOIN service_categories sc/);
    expect(sql).toMatch(/LEFT JOIN service_subcategories ssc/);
    expect(sql).toMatch(/LEFT JOIN providers p/);
    expect(sql).toMatch(/LEFT JOIN users u ON u\.id = p\.user_id/);
    expect(sql).toMatch(/sc\.name AS category_name/);
    expect(sql).toMatch(/ssc\.name AS subcategory_name/);
    expect(sql).toMatch(/AS provider_name/);
    expect(sql).toMatch(/recurring_instances ri[\s\S]*?b\.status = 'completed'[\s\S]*?AS total_completed/);
    expect(sql).toMatch(/recurring_instances ri[\s\S]*?ri\.status = 'skipped'[\s\S]*?AS total_skipped/);
  });

  it('BUG-PHASE85-01 — getCustomerRecurringBookings list query also uses the enriched SELECT', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    await getCustomerRecurringBookings('c1', 1, 20);
    const listSql = dbQueryMock.mock.calls[0]![0] as string;
    // Same SELECT preamble as the detail query — drift-detection.
    expect(listSql).toMatch(/sc\.name AS category_name/);
    expect(listSql).toMatch(/AS total_completed/);
    expect(listSql).toMatch(/AS total_skipped/);
    expect(listSql).toMatch(/WHERE rb\.customer_id = \$1/);
    expect(listSql).toMatch(/ORDER BY rb\.status ASC, rb\.next_booking_date ASC/);
  });
});

describe('BUG-PHASE85-01 — formatRecurringBooking exposes the customer-screen fields', () => {
  function row(overrides: Record<string, unknown> = {}): Parameters<typeof formatRecurringBooking>[0] {
    const base = {
      id: 'rb1', customer_id: 'c1', provider_id: null, category_id: 'cat1',
      subcategory_id: null, original_booking_id: null,
      frequency: 'weekly' as const, preferred_day: 1, preferred_time: '09:00:00',
      address: 'a', barangay: 'b', city: 'c', province: 'p',
      latitude: null, longitude: null,
      service_price: 50000, service_fee: 5000, total_amount: 55000,
      status: 'active', next_booking_date: '2026-06-01',
      last_booking_date: null, skip_dates: [] as string[],
      auto_charge: true, allow_substitute: true, total_instances: 0,
      cancelled_at: null, cancellation_reason: null,
      created_at: new Date(), updated_at: new Date(),
    };
    return { ...base, ...overrides } as Parameters<typeof formatRecurringBooking>[0];
  }

  it('BUG-PHASE85-01 — exposes categoryName + subcategoryName + providerName from joins', () => {
    const out = formatRecurringBooking(row({
      category_name: 'Cleaning',
      subcategory_name: 'Deep Clean',
      provider_name: 'Maria Santos',
    }));
    expect(out.categoryName).toBe('Cleaning');
    expect(out.subcategoryName).toBe('Deep Clean');
    expect(out.providerName).toBe('Maria Santos');
  });

  it('BUG-PHASE85-01 — providerName is null when no provider matched (LEFT JOIN miss)', () => {
    // Empty string can come from CONCAT(NULL, ' ', NULL) on some pg
    // configs; the formatter must normalize it to null.
    expect(formatRecurringBooking(row({ provider_name: null })).providerName).toBeNull();
    expect(formatRecurringBooking(row({ provider_name: '' })).providerName).toBeNull();
  });

  it('BUG-PHASE85-01 — exposes totalCompleted + totalSkipped, defaulting to 0 when missing', () => {
    const out = formatRecurringBooking(row({ total_completed: 7, total_skipped: 2 }));
    expect(out.totalCompleted).toBe(7);
    expect(out.totalSkipped).toBe(2);

    // Defensive default for the legacy code path that never set them.
    const fallback = formatRecurringBooking(row());
    expect(fallback.totalCompleted).toBe(0);
    expect(fallback.totalSkipped).toBe(0);
  });

  it('BUG-PHASE85-01 — nextScheduledDate alias mirrors next_booking_date for the mobile screens', () => {
    const out = formatRecurringBooking(row({ next_booking_date: '2026-06-15' }));
    expect(out.nextScheduledDate).toBe('2026-06-15');
    // Canonical name still present for any consumer already on it.
    expect(out.nextBookingDate).toBe('2026-06-15');
  });

  it('BUG-PHASE85-01 — cancelReason alias mirrors cancellation_reason', () => {
    const out = formatRecurringBooking(row({ cancellation_reason: 'Moving away' }));
    expect(out.cancelReason).toBe('Moving away');
    // Canonical name preserved.
    expect(out.cancellationReason).toBe('Moving away');
  });
});
