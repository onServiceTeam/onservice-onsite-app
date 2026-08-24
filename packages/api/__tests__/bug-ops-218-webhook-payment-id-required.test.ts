import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_ops218';
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
jest.mock('../src/services/payment.service', () => ({}));
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

it('Bug OPS-218 — payment.paid without a gateway payment id changes no local money state', async () => {
  const body = {
    data: {
      id: 'event-missing-payment-id',
      attributes: {
        type: 'payment.paid',
        data: {
          attributes: {
            amount: 50000,
            metadata: { booking_id: 'booking-1', intent_kind: 'booking' },
          },
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

  expect(response.status).toBe(400);
  expect(response.body.error.message).toBe('Invalid payment.paid payload');
  expect(dbQueryMock).not.toHaveBeenCalled();
});
