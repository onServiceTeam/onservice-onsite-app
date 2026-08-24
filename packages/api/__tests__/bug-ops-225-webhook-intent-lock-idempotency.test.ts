import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_ops225';
process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret;

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const updatePaymentStatusInTransactionMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  getBookingPaymentIntent: jest.fn(),
  getTopupPaymentIntent: jest.fn().mockResolvedValue({
    id: 'intent-topup-1', topup_id: 'topup_customer-1_123', amount: '10000',
    payment_method: 'gcash', status: 'awaiting_payment',
  }),
  updatePaymentStatusInTransaction: (...args: unknown[]) => updatePaymentStatusInTransactionMock(...args),
}));

const creditWalletInTransactionMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWalletInTransaction: jest.fn(),
  creditWalletInTransaction: (...args: unknown[]) => creditWalletInTransactionMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/security.service', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../src/services/booking-offer.service', () => ({ dispatchPaidBookingIfNeeded: jest.fn() }));

import webhookRouter from '../src/routes/webhook.routes';

function signedHeader(body: unknown): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');
  return `t=${timestamp},te=${signature}`;
}

it('Bug OPS-225 — a second event cannot reapply an intent that succeeded while waiting for its row lock', async () => {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [{ status: 'succeeded' }], rowCount: 1 }),
  };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/INSERT INTO webhook_events/.test(sql)) return { rows: [{ event_id: 'event-topup-2' }], rowCount: 1 };
    if (/UPDATE webhook_events/.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const body = {
    data: {
      id: 'event-topup-2',
      attributes: {
        type: 'payment.paid',
        data: {
          id: 'pay_topup_1',
          attributes: { amount: 10000, metadata: { booking_id: 'topup_customer-1_123', intent_kind: 'top_up' } },
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRouter);

  const response = await request(app).post('/api/v1/webhooks/paymongo')
    .set('paymongo-signature', signedHeader(body)).send(body);

  expect(response.status).toBe(200);
  expect(creditWalletInTransactionMock).not.toHaveBeenCalled();
  expect(updatePaymentStatusInTransactionMock).not.toHaveBeenCalled();
});
