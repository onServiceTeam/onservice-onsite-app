// D27 Phase 3 — createChangeOrder with itemized parts/materials.
//
// When line items are present the server computes the canonical additional
// amount as the sum of the line totals and IGNORES the client-sent
// additionalAmount (server-canonical, same rule as quotes). The summed total
// is still bounded by the minimum, the ₱10k hard cap, and the 50%-of-service
// relative cap.

const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const transactionMock = jest.fn(
  async (cb: (c: { query: typeof clientQueryMock }) => unknown) => cb({ query: clientQueryMock }),
);

jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: (c: { query: typeof clientQueryMock }) => unknown) => transactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createChangeOrder } from '../src/services/booking.service';

const BOOKING_ID = 'booking-1';
const PROVIDER_USER = 'user-prov';
const PROVIDER_ID = 'prov-1';

// service_price ₱1000 (100000 centavos) → 50% cap = 50000.
function primeProviderAndBooking(): void {
  dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }] }); // provider lookup
  dbQueryMock.mockResolvedValueOnce({
    rows: [{ id: BOOKING_ID, provider_id: PROVIDER_ID, status: 'in_progress', service_price: 100000 }],
  }); // getBookingByIdAdmin
}

beforeEach(() => {
  dbQueryMock.mockReset();
  clientQueryMock.mockReset();
  transactionMock.mockClear();
});

describe('createChangeOrder — itemized line items', () => {
  it('computes additional_amount from line items and ignores the client amount', async () => {
    primeProviderAndBooking();
    // INSERT change_orders RETURNING * → echo what the service should have stored.
    clientQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'co-1', booking_id: BOOKING_ID, provider_id: PROVIDER_ID,
        description: 'Replace faucet + labor', additional_amount: 45000,
        photos: [], status: 'pending', customer_responded_at: null,
        created_at: new Date('2026-06-29'), updated_at: new Date('2026-06-29'),
      }],
    });
    clientQueryMock.mockResolvedValueOnce({ rows: [] }); // INSERT line items

    const result = await createChangeOrder(BOOKING_ID, PROVIDER_USER, {
      description: 'Replace faucet + labor',
      additionalAmount: 999999, // must be ignored in favour of the line-item sum
      lineItems: [
        { description: 'Faucet', quantity: 1, unit: 'unit', unitPrice: 30000, itemType: 'materials' },
        { description: 'Labor', quantity: 1, unit: 'hour', unitPrice: 15000, itemType: 'labor' },
      ],
    });

    // The change_orders INSERT got the SUMMED total (45000), not 999999.
    const coInsert = clientQueryMock.mock.calls[0]!;
    expect(coInsert[0]).toMatch(/INSERT INTO change_orders/);
    expect(coInsert[1]![3]).toBe(45000);

    // The line-items INSERT ran with both rows and computed line totals.
    const liInsert = clientQueryMock.mock.calls[1]!;
    expect(liInsert[0]).toMatch(/INSERT INTO change_order_line_items/);
    expect(liInsert[1]).toContain(30000); // faucet line_total
    expect(liInsert[1]).toContain(15000); // labor line_total

    expect(result.additionalAmount).toBe(45000);
    expect((result.lineItems as unknown[]).length).toBe(2);
  });

  it('rejects when the summed total exceeds 50% of the service price', async () => {
    primeProviderAndBooking();
    await expect(
      createChangeOrder(BOOKING_ID, PROVIDER_USER, {
        description: 'Too expensive change',
        lineItems: [{ description: 'Pricey part', quantity: 1, unit: 'unit', unitPrice: 60000, itemType: 'materials' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects when the summed total is below the minimum', async () => {
    primeProviderAndBooking();
    await expect(
      createChangeOrder(BOOKING_ID, PROVIDER_USER, {
        description: 'Trivial change',
        lineItems: [{ description: 'Tiny', quantity: 1, unit: 'unit', unitPrice: 50, itemType: 'materials' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('still supports a lump-sum change order with no line items', async () => {
    primeProviderAndBooking();
    clientQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'co-2', booking_id: BOOKING_ID, provider_id: PROVIDER_ID,
        description: 'Lump sum', additional_amount: 20000, photos: [],
        status: 'pending', customer_responded_at: null,
        created_at: new Date('2026-06-29'), updated_at: new Date('2026-06-29'),
      }],
    });

    const result = await createChangeOrder(BOOKING_ID, PROVIDER_USER, {
      description: 'Lump sum',
      additionalAmount: 20000,
    });

    const coInsert = clientQueryMock.mock.calls[0]!;
    expect(coInsert[1]![3]).toBe(20000);
    // Only the change_orders INSERT ran — no line-items INSERT.
    expect(clientQueryMock).toHaveBeenCalledTimes(1);
    expect(result.lineItems).toEqual([]);
  });
});
