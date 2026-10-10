const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelOR } from '../src/services/or.service';

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECEIPT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CANCELLATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function receiptRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RECEIPT_ID,
    or_number: 'OR-2026-09-000001',
    booking_id: BOOKING_ID,
    customer_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    provider_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    issued_at: new Date('2026-09-03T08:00:00.000Z'),
    gross_amount: '11200',
    vat_amount: '1200',
    net_amount: '10000',
    commission_amount: '500',
    service_fee_amount: '200',
    provider_received: '9500',
    platform_retained: '700',
    pdf_url: null,
    is_cancellation: false,
    cancels_or_id: null,
    cancelled_at: null,
    cancellation_reason: null,
    ...overrides,
  };
}

it('Bug OPS-412 - receipt cancellation audit payload preserves the owning booking for future evidence handoffs', async () => {
  dbTransactionMock.mockImplementationOnce(async (callback: (
    client: { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> },
  ) => Promise<unknown>) => callback({
    query: async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [receiptRow()] };
      if (sql.includes('UPDATE official_receipts')) {
        return { rows: [receiptRow({ cancelled_at: new Date('2026-09-03T09:00:00.000Z') })] };
      }
      if (sql.includes('INSERT INTO or_sequences')) return { rows: [{ last_sequence: 2 }] };
      if (sql.includes('INSERT INTO official_receipts')) {
        return { rows: [receiptRow({
          id: CANCELLATION_ID,
          or_number: 'OR-2026-09-000002',
          is_cancellation: true,
          cancels_or_id: RECEIPT_ID,
          cancelled_at: new Date('2026-09-03T09:00:00.000Z'),
          cancellation_reason: 'Duplicate receipt',
        })] };
      }
      return { rows: [] };
    },
  }));
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await cancelOR(RECEIPT_ID, 'Duplicate receipt', ADMIN_ID);

  const auditCall = dbQueryMock.mock.calls.find((call) => (
    String(call[0]).includes("'or_cancelled'")
  ));
  expect(auditCall).toBeDefined();
  expect(JSON.parse(String(auditCall?.[1]?.[2]))).toEqual(expect.objectContaining({
    bookingId: BOOKING_ID,
    originalOrNumber: 'OR-2026-09-000001',
    cancellationOrId: CANCELLATION_ID,
  }));
});
