/**
 * Phase 13 Dispatch E — invoice batch / N+1 elimination regression test.
 *
 * Asserts that `generateMonthlyInvoices()` issues a constant number of
 * `db.query()` calls regardless of the number of accounts or per-account
 * bookings. The previous implementation issued O(accounts x bookings)
 * queries; the rewrite issues at most three:
 *   1. one CTE-aggregated SELECT (eligible accounts + bookings rolled up)
 *   2. one bulk INSERT into business_invoices (UNNEST)
 *   3. one bulk INSERT into business_invoice_items (UNNEST)
 *
 * Hermetic — db.query is a mock that records every call.
 */

const dbQueryMock = jest.fn();
// MED-N117 follow-up: the items INSERT moved inside a db.transaction
// for atomicity. The pre-existing N+1 regression test counts db.query
// calls expecting at-most-3 — passthrough trx so client.query is
// counted alongside the bare db.query calls.
const dbTransactionMock = jest.fn(async (cb: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cb as any)({
    query: (...args: unknown[]) => dbQueryMock(...args),
  });
});

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const createNotificationMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
}));

import * as invoiceService from '../src/services/invoice.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  createNotificationMock.mockReset();
});

function makeAccountFixture(accountIdx: number, bookingsPerAccount: number): {
  id: string;
  company_name: string;
  owner_user_id: string;
  payment_terms: string;
  volume_discount_rate: string;
  items: Array<{
    id: string;
    description: string;
    scheduled_at: Date;
    total_amount: number;
    service_price: number;
    category_name: string;
  }>;
  subtotal: number;
} {
  const items = Array.from({ length: bookingsPerAccount }).map((_, bi) => ({
    id: `00000000-0000-0000-${String(accountIdx).padStart(4, '0')}-${String(bi).padStart(12, '0')}`,
    description: `Booking ${bi}`,
    scheduled_at: new Date(`2026-03-${String((bi % 27) + 1).padStart(2, '0')}T10:00:00Z`),
    total_amount: 500_000,
    service_price: 450_000,
    category_name: 'Cleaning',
  }));
  const subtotal = items.reduce((sum, it) => sum + it.service_price, 0);
  return {
    id: `aaaaaaaa-0000-0000-0000-${String(accountIdx).padStart(12, '0')}`,
    company_name: `Co ${accountIdx}`,
    owner_user_id: `bbbbbbbb-0000-0000-0000-${String(accountIdx).padStart(12, '0')}`,
    payment_terms: 'net_30',
    volume_discount_rate: '5',
    items,
    subtotal,
  };
}

describe('generateMonthlyInvoices — bulk batch (Phase 13 Dispatch E)', () => {
  test('issues at most 3 db.query calls for 10 accounts x 5 bookings', async () => {
    const accountCount = 10;
    const bookingsPerAccount = 5;
    const fixtures = Array.from({ length: accountCount })
      .map((_, i) => makeAccountFixture(i, bookingsPerAccount));

    // Query 1: aggregated SELECT
    dbQueryMock.mockResolvedValueOnce({ rows: fixtures, rowCount: fixtures.length });
    // Query 2: bulk INSERT business_invoices RETURNING (id, business_account_id)
    dbQueryMock.mockResolvedValueOnce({
      rows: fixtures.map((f, i) => ({
        id: `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`,
        business_account_id: f.id,
      })),
      rowCount: fixtures.length,
    });
    // Query 3: bulk INSERT business_invoice_items
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: accountCount * bookingsPerAccount });

    const generated = await invoiceService.generateMonthlyInvoices();

    expect(generated).toBe(accountCount);
    expect(dbQueryMock.mock.calls.length).toBeLessThanOrEqual(3);
    // Notifications dispatched per account but do not consume db.query.
    expect(createNotificationMock).toHaveBeenCalledTimes(accountCount);
  });

  test('issues at most 3 db.query calls for 50 accounts x 20 bookings', async () => {
    const accountCount = 50;
    const bookingsPerAccount = 20;
    const fixtures = Array.from({ length: accountCount })
      .map((_, i) => makeAccountFixture(i, bookingsPerAccount));

    dbQueryMock.mockResolvedValueOnce({ rows: fixtures, rowCount: fixtures.length });
    dbQueryMock.mockResolvedValueOnce({
      rows: fixtures.map((f, i) => ({
        id: `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`,
        business_account_id: f.id,
      })),
      rowCount: fixtures.length,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: accountCount * bookingsPerAccount });

    const generated = await invoiceService.generateMonthlyInvoices();

    expect(generated).toBe(accountCount);
    // Locks in: query count is INDEPENDENT of (accounts, bookings).
    expect(dbQueryMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test('issues exactly 1 db.query when no accounts qualify', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const generated = await invoiceService.generateMonthlyInvoices();

    expect(generated).toBe(0);
    expect(dbQueryMock.mock.calls.length).toBe(1);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  test('per-account totals correctly compute subtotal/discount/tax/total', async () => {
    const fixtures = [makeAccountFixture(0, 4)]; // 4 x 450_000 = 1_800_000 subtotal
    dbQueryMock.mockResolvedValueOnce({ rows: fixtures, rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'cccccccc-0000-0000-0000-000000000000', business_account_id: fixtures[0]!.id }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 4 });

    const generated = await invoiceService.generateMonthlyInvoices();
    expect(generated).toBe(1);

    // Inspect the bulk-invoice INSERT params: $5=subtotals, $6=discounts,
    // $7=taxes, $8=totals (centavos, BIGINT-typed but Number-valued post parser).
    const invoiceInsertCall = dbQueryMock.mock.calls[1]!;
    const params = invoiceInsertCall[1] as unknown[];
    const subtotals = params[4] as number[];
    const discounts = params[5] as number[];
    const taxes = params[6] as number[];
    const totals = params[7] as number[];

    expect(subtotals).toEqual([1_800_000]);
    expect(discounts).toEqual([Math.round(1_800_000 * 0.05)]); // 90_000
    // discount applied -> after = 1_710_000; tax & total are platform-config
    // dependent; just assert internal consistency: total == after + tax.
    const after = subtotals[0]! - discounts[0]!;
    expect(totals[0]).toBe(after + taxes[0]!);
  });
});
