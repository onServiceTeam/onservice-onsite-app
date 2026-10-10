// Phase B CRIT-15 fix verified — change order finalization requires
// verified payment proof.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const getLatestFinalTermsMock = jest.fn().mockResolvedValue({
  serviceFeeRateBasisPoints: 1000,
  serviceFeeMinCentavos: 2500,
  serviceFeeMaxCentavos: 50000,
});
const calculateServiceFeeMock = jest.fn((servicePriceCentavos: number) =>
  Math.round(servicePriceCentavos * 0.1));
const appendAmendedTermsMock = jest.fn().mockResolvedValue({ id: 'terms-v2' });
const holdInEscrowMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: jest.fn(),
  ADMIN_EVENTS: {},
}));
jest.mock('../src/services/notification.service', () => ({
  createNotification: jest.fn(),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0.1),
  getSettingNumber: jest.fn().mockImplementation((key: string) => {
    if (key === 'service_fee_min') return Promise.resolve(2500);
    if (key === 'service_fee_max') return Promise.resolve(50000);
    return Promise.resolve(0);
  }),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  getLatestFinalTermsInTransaction: (...args: unknown[]) => getLatestFinalTermsMock(...args),
  calculateServiceFeeFromTerms: (...args: unknown[]) => calculateServiceFeeMock(...args),
  appendAmendedTermsInTransaction: (...args: unknown[]) => appendAmendedTermsMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({
  holdInEscrowInTransaction: (...args: unknown[]) => holdInEscrowMock(...args),
}));

import { finalizeChangeOrderPayment } from '../src/services/booking.service';

const CO_ID = 'co-1';
const BOOKING_ID = 'booking-1';
const CUSTOMER_ID = 'customer-1';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  getLatestFinalTermsMock.mockClear();
  calculateServiceFeeMock.mockClear();
  appendAmendedTermsMock.mockClear();
  holdInEscrowMock.mockClear();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('Phase B CRIT-15 — finalizeChangeOrderPayment requires payment proof', () => {
  it('CRIT-15 — rejects when paymentProof argument is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, undefined as any))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('CRIT-15 — rejects when paymentProof.kind is invalid', async () => {
    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind: 'something_else' as any,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('CRIT-15 — paymongo path rejects when intentId is missing', async () => {
    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, {
        kind: 'paymongo',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        intentId: undefined as any,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('CRIT-15 — paymongo path rejects when intent status is not succeeded', async () => {
    // SELECT change order
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    // SELECT booking
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'in_progress' }],
      rowCount: 1,
    });
    // SELECT payment_intent — status: 'failed'
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', booking_id: BOOKING_ID, amount: '5500', status: 'failed', metadata: null }],
      rowCount: 1,
    });

    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, {
        kind: 'paymongo',
        intentId: 'pi-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('CRIT-15 — paymongo path rejects when intent does NOT match booking or change_order', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'in_progress' }],
      rowCount: 1,
    });
    // Intent for a DIFFERENT booking
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', booking_id: 'someone-elses-booking', amount: '5500', status: 'succeeded', metadata: null }],
      rowCount: 1,
    });

    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, {
        kind: 'paymongo',
        intentId: 'pi-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('CRIT-15 — paymongo path rejects when intent amount mismatch', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'in_progress' }],
      rowCount: 1,
    });
    // expected additionalTotal = ((50000+5000) → newPrice 55000, newFee=5500, newTotal=60500) - 55000 = 5500
    // intent says it charged 1000 — mismatch
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', booking_id: BOOKING_ID, amount: '1000', status: 'succeeded', metadata: null }],
      rowCount: 1,
    });

    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, {
        kind: 'paymongo',
        intentId: 'pi-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('CRIT-15 — wallet path rejects when balance insufficient', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'in_progress' }],
      rowCount: 1,
    });
    // Wallet has only 100 centavos (need 5500)
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'w1', available_balance: '100' }],
      rowCount: 1,
    });

    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, { kind: 'wallet' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('CRIT-15 — booking in non-finalizable status rejects (CRIT-17 family)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'cancelled_by_customer' }],
      rowCount: 1,
    });

    await expect(
      finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, { kind: 'wallet' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('CRIT-15 — wallet path happy: debit wallet + UPDATE bookings + UPDATE change_orders inside one trx', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: CO_ID, booking_id: BOOKING_ID, status: 'approved', additional_amount: 5000, customer_responded_at: new Date(), provider_id: 'p1', description: '', photos: [], created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 50000, service_fee: 5000, total_amount: 55000, status: 'in_progress' }],
      rowCount: 1,
    });
    // Wallet balance sufficient
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'w1', available_balance: '100000' }],
      rowCount: 1,
    });
    // wallet UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // wallet_transactions INSERT
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // change_orders UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // bookings UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await finalizeChangeOrderPayment(CO_ID, CUSTOMER_ID, { kind: 'wallet' });
    expect(result.bookingId).toBe(BOOKING_ID);
    expect(result.additionalTotal).toBe(5500);
    expect(result.newServicePrice).toBe(55000);
    // All movement ran inside the single trx callback.
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(appendAmendedTermsMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        event: 'change_order_authorized',
        sourceEventId: CO_ID,
      }),
    );
    expect(holdInEscrowMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      BOOKING_ID,
      5500,
    );
  });
});
