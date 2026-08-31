const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: (client: { query: (...args: unknown[]) => unknown }) => unknown) => (
      callback({ query: (...args: unknown[]) => dbQueryMock(...args) })
    ),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/config/platform.config', () => ({ platformConfig: {} }));

import { processRefund } from '../src/services/payment.service';

it('Bug OPS-291 — production gateway refunds without a valid payment ID stay unreconciled', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'intent-291',
      booking_id: 'booking-291',
      paymongo_intent_id: 'pi_live_291',
      paymongo_payment_id: null,
      amount: '25000',
      refunded_amount: 0,
      payment_method: 'card',
      status: 'succeeded',
      client_key: null,
      metadata: {},
    }],
    rowCount: 1,
  });

  try {
    await expect(processRefund('booking-291', 5000, 'Support-approved adjustment')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/manual reconciliation is required/i),
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect(String(dbQueryMock.mock.calls[0]?.[0])).toMatch(/FOR UPDATE/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
