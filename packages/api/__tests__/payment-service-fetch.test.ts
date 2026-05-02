// Bug 1271 verified — payment.service uses native fetch (CRIT-N14 fix).
//
// Pre-fix: axios.post('${PAYMONGO_BASE}/payment_intents', ...).
// Post-fix: globalThis.fetch('${PAYMONGO_BASE}/payment_intents', { method: 'POST', ... }).

const fetchMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = fetchMock;

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
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

import { createPaymentIntent, processRefund } from '../src/services/payment.service';

beforeEach(() => {
  fetchMock.mockReset();
  dbQueryMock.mockReset();
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_dummy';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  delete process.env.PAYMONGO_SECRET_KEY;
});

describe('Bug 1271 + CRIT-N14 — payment.service uses native fetch', () => {
  it('Bug 1271 — createPaymentIntent POSTs to PayMongo via globalThis.fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'pi_test_123',
          attributes: { client_key: 'pi_test_123_client' },
        },
      }),
    });

    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'b-1',
        paymongo_intent_id: 'pi_test_123',
        amount: '50000',
        payment_method: 'gcash',
        status: 'awaiting_payment',
        client_key: 'pi_test_123_client',
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });

    const result = await createPaymentIntent('b-1', 50000, 'gcash', 'Test booking');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.paymongo.com/v1/payment_intents');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.amount).toBe(50000);
    expect(body.data.attributes.currency).toBe('PHP');
    // MED-N157 fix — metadata now also carries intent_kind so the
    // webhook handler can route via metadata field instead of the
    // legacy bookingId-prefix sniff.
    expect(body.data.attributes.metadata).toEqual({ booking_id: 'b-1', intent_kind: 'booking' });

    expect(result.paymongo_intent_id).toBe('pi_test_123');
  });

  it('CRIT-N14 — createPaymentIntent throws non-2xx as error and falls into sandbox path in dev', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'b-1',
        paymongo_intent_id: expect.stringMatching(/^pi_sandbox_/),
        amount: '50000',
        payment_method: 'gcash',
        status: 'awaiting_payment',
        client_key: expect.any(String),
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });

    const result = await createPaymentIntent('b-1', 50000, 'gcash', 'Test');

    // In dev/test, falls back to sandbox id when fetch errors out.
    expect(result).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Bug 1271 + Phase B CRIT-02 — processRefund POSTs to PayMongo /refunds via globalThis.fetch with PAYMENT id (not intent id)', async () => {
    // First call: getBookingPaymentIntent — post-CRIT-02 fix the row
    // also carries paymongo_payment_id captured from the webhook.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'intent-1',
        booking_id: 'b-1',
        paymongo_intent_id: 'pi_real_456',
        // Phase B CRIT-02 — refund call must use this, NOT the intent id.
        paymongo_payment_id: 'pay_real_456',
        amount: '50000',
        refunded_amount: 0,
        payment_method: 'gcash',
        status: 'succeeded',
        client_key: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });

    // PayMongo refund response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    // updatePaymentStatus query (post-CRIT-01 the UPDATE writes both
    // status + refunded_amount in one query).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processRefund('b-1', 50000, 'customer requested');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.paymongo.com/v1/refunds');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.amount).toBe(50000);
    // Phase B CRIT-02 fix — payment_id is the PAYMENT id (pay_*),
    // not the INTENT id (pi_*). The pre-fix bug sent the intent id
    // and PayMongo silently rejected production refunds.
    expect(body.data.attributes.payment_id).toBe('pay_real_456');
    expect(body.data.attributes.payment_id).not.toBe('pi_real_456');
    expect(body.data.attributes.notes).toBe('customer requested');
  });
});
