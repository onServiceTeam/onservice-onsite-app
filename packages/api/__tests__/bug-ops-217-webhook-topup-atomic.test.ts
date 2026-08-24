import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_ops217';
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

const updatePaymentStatusMock = jest.fn();
const updatePaymentStatusInTransactionMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  getBookingPaymentIntent: jest.fn(),
  getTopupPaymentIntent: jest.fn().mockResolvedValue({
    id: 'intent-topup-1', topup_id: 'topup_customer-1_123', amount: '10000',
    payment_method: 'gcash', status: 'awaiting_payment',
  }),
  updatePaymentStatus: (...args: unknown[]) => updatePaymentStatusMock(...args),
  updatePaymentStatusInTransaction: (...args: unknown[]) => updatePaymentStatusInTransactionMock(...args),
}));
const creditWalletInTransactionMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWalletInTransaction: jest.fn().mockResolvedValue({ id: 'wallet-1', type: 'customer' }),
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

describe('OPS-217 — wallet top-up webhook is atomic', () => {
  it('rolls back the intent update and releases the event claim when wallet credit fails', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (/SELECT status FROM payment_intents/.test(sql)) return { rows: [{ status: 'awaiting_payment' }], rowCount: 1 };
        if (/SELECT 1 FROM wallet_transactions/.test(sql)) return { rows: [], rowCount: 0 };
        throw new Error(`Unexpected transaction query: ${sql}`);
      }),
    };
    transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
    creditWalletInTransactionMock.mockRejectedValue(new Error('wallet ledger unavailable'));
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (/INSERT INTO webhook_events/.test(sql)) return { rows: [{ event_id: 'event-topup-1' }], rowCount: 1 };
      if (/DELETE FROM webhook_events/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected outer query: ${sql}`);
    });

    const body = {
      data: {
        id: 'event-topup-1',
        attributes: {
          type: 'payment.paid',
          data: { id: 'pay_topup_1', attributes: { amount: 10000, metadata: { booking_id: 'topup_customer-1_123', intent_kind: 'top_up' } } },
        },
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/v1/webhooks', webhookRouter);
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));

    const response = await request(app).post('/api/v1/webhooks/paymongo')
      .set('paymongo-signature', signedHeader(body)).send(body);

    expect(response.status).toBe(500);
    expect(creditWalletInTransactionMock).toHaveBeenCalledWith(
      client, 'wallet-1', 10000, 'payment', 'Wallet top-up via gcash', undefined, 'pay_topup_1',
    );
    expect(updatePaymentStatusMock).not.toHaveBeenCalled();
    expect(updatePaymentStatusInTransactionMock).not.toHaveBeenCalled();
    expect(dbQueryMock.mock.calls.some(([sql]) => /DELETE FROM webhook_events/.test(String(sql)))).toBe(true);
  });
});
