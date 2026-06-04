// Phase B CRIT-01 + CRIT-02 fixes — partial-refund tracking +
// PayMongo refund payment-id correctness.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    // §35b — processRefund now runs inside db.transaction with a
    // SELECT ... FOR UPDATE. Route the trx client through the same mock so
    // the existing call-order assertions (calls[0]=SELECT, calls[1]=UPDATE)
    // still hold.
    transaction: (cb: (client: { query: (...a: unknown[]) => unknown }) => unknown) =>
      cb({ query: (...a: unknown[]) => dbQueryMock(...a) }),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: {},
}));

const fetchMock = jest.fn();
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
});

beforeEach(() => {
  dbQueryMock.mockReset();
  fetchMock.mockReset();
  delete process.env.PAYMONGO_SECRET_KEY;
});

import { processRefund } from '../src/services/payment.service';

describe('Phase B CRIT-01 — partial refund can be called multiple times', () => {
  it('CRIT-01 — first partial refund succeeds (status was succeeded)', async () => {
    // SELECT intent (succeeded, full=10000, refunded=0, paymongo_payment_id=null)
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_sandbox_xyz',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'succeeded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    // UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(processRefund('booking-1', 3000, 'partial 1')).resolves.toBeUndefined();
    // Final UPDATE param 1 = 'partially_refunded', param 2 = 3000.
    const updateCall = dbQueryMock.mock.calls[1]!;
    expect(updateCall[1][0]).toBe('partially_refunded');
    expect(updateCall[1][1]).toBe(3000);
  });

  it('CRIT-01 — second partial refund on partially_refunded status now succeeds', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_sandbox_xyz',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 3000,
        payment_method: 'card',
        status: 'partially_refunded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(processRefund('booking-1', 4000, 'partial 2')).resolves.toBeUndefined();
    const updateCall = dbQueryMock.mock.calls[1]!;
    expect(updateCall[1][0]).toBe('partially_refunded');
    expect(updateCall[1][1]).toBe(7000); // cumulative
  });

  it('CRIT-01 — final partial refund flips status to "refunded"', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_sandbox_xyz',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 7000,
        payment_method: 'card',
        status: 'partially_refunded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(processRefund('booking-1', 3000, 'partial 3 final')).resolves.toBeUndefined();
    const updateCall = dbQueryMock.mock.calls[1]!;
    expect(updateCall[1][0]).toBe('refunded');
    expect(updateCall[1][1]).toBe(10000);
  });

  it('CRIT-01 — refund that would exceed remaining amount throws 400', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_sandbox_xyz',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 8000,
        payment_method: 'card',
        status: 'partially_refunded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });

    await expect(processRefund('booking-1', 5000, 'too much')).rejects.toMatchObject({
      statusCode: 400,
    });
    // Should NOT have made the UPDATE call.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });

  it('CRIT-01 — refund on non-refundable status throws 409', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_xyz',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'awaiting_payment',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    await expect(processRefund('booking-1', 1000, 'no')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('CRIT-01 — invalid refundAmount (negative, zero, non-int) throws 400', async () => {
    await expect(processRefund('booking-1', -100, 'r')).rejects.toMatchObject({ statusCode: 400 });
    await expect(processRefund('booking-1', 0, 'r')).rejects.toMatchObject({ statusCode: 400 });
    await expect(processRefund('booking-1', 1.5, 'r')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('§35b — locks the payment_intent row with SELECT ... FOR UPDATE before refunding', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1', booking_id: 'booking-1', paymongo_intent_id: 'pi_sandbox_xyz',
        paymongo_payment_id: null, amount: '10000', refunded_amount: 0,
        payment_method: 'card', status: 'succeeded', client_key: null, metadata: {},
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    await processRefund('booking-1', 3000, 'lock check');
    const selectSql = dbQueryMock.mock.calls[0]![0] as string;
    expect(selectSql).toMatch(/FROM payment_intents/);
    expect(selectSql).toMatch(/FOR UPDATE/);
  });
});

describe('Phase B CRIT-02 — PayMongo refund call uses payment ID, not intent ID', () => {
  it('CRIT-02 — refund call sends payment_id from paymongo_payment_id column', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_dummy';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_realprod', // intent id — NOT used in refund call
        paymongo_payment_id: 'pay_realprod', // ← this should be used
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'succeeded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    fetchMock.mockResolvedValueOnce({ ok: true });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processRefund('booking-1', 5000, 'partial');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(fetchBody.data.attributes.payment_id).toBe('pay_realprod');
    // Important: NOT the intent id.
    expect(fetchBody.data.attributes.payment_id).not.toBe('pi_realprod');
  });

  it('CRIT-02 — falls back to metadata.reference_id when paymongo_payment_id column is null', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_dummy';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_realprod',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'succeeded',
        client_key: null,
        metadata: { reference_id: 'pay_legacy_xyz' },
      }],
      rowCount: 1,
    });
    fetchMock.mockResolvedValueOnce({ ok: true });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processRefund('booking-1', 5000, 'partial');

    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(fetchBody.data.attributes.payment_id).toBe('pay_legacy_xyz');
  });

  it('CRIT-02 — sandbox/test intents skip the PayMongo call entirely', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_dummy';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_sandbox_123',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'succeeded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processRefund('booking-1', 5000, 'partial');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CRIT-02 — non-prod missing payment id is logged but does NOT throw', async () => {
    delete process.env.NODE_ENV;
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'booking-1',
        paymongo_intent_id: 'pi_realprod',
        paymongo_payment_id: null,
        amount: '10000',
        refunded_amount: 0,
        payment_method: 'card',
        status: 'succeeded',
        client_key: null,
        metadata: {},
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(processRefund('booking-1', 5000, 'no pay id')).resolves.toBeUndefined();
  });
});
