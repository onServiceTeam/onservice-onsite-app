import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_ops222';
process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret;

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const getBookingPaymentIntentMock = jest.fn().mockResolvedValue(null);
jest.mock('../src/services/payment.service', () => ({
  getBookingPaymentIntent: (...args: unknown[]) => getBookingPaymentIntentMock(...args),
  getTopupPaymentIntent: jest.fn(),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/security.service', () => ({}));
jest.mock('../src/services/booking-offer.service', () => ({}));

import webhookRouter from '../src/routes/webhook.routes';

function signedHeader(body: unknown): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');
  return `t=${timestamp},te=${signature}`;
}

it('Bug OPS-222 — an abandoned webhook processing claim can be atomically reclaimed', async () => {
  dbQueryMock.mockImplementationOnce(async (sql: string) => {
    expect(sql).toMatch(/ON CONFLICT \(event_id\) DO UPDATE/);
    expect(sql).toMatch(/received_at < NOW\(\) - INTERVAL '15 minutes'/);
    return { rows: [{ event_id: 'event-stale-1' }], rowCount: 1 };
  });
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const body = {
    data: {
      id: 'event-stale-1',
      attributes: {
        type: 'payment.paid',
        data: {
          id: 'pay_stale_1',
          attributes: { amount: 50000, metadata: { booking_id: 'booking-1' } },
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRouter);

  const response = await request(app)
    .post('/api/v1/webhooks/paymongo')
    .set('paymongo-signature', signedHeader(body))
    .send(body);

  expect(response.status).toBe(200);
  expect(getBookingPaymentIntentMock).toHaveBeenCalledWith('booking-1');
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
});
