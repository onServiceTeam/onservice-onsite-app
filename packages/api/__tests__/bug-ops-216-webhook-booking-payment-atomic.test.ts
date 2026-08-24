import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_ops216';
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
  getBookingPaymentIntent: jest.fn().mockResolvedValue({
    id: 'intent-1', booking_id: 'booking-1', amount: '50000',
    payment_method: 'gcash', status: 'awaiting_payment',
  }),
  getTopupPaymentIntent: jest.fn(),
  updatePaymentStatus: (...args: unknown[]) => updatePaymentStatusMock(...args),
  updatePaymentStatusInTransaction: (...args: unknown[]) => updatePaymentStatusInTransactionMock(...args),
}));
const holdInEscrowMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  holdInEscrowInTransaction: (...args: unknown[]) => holdInEscrowMock(...args),
}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({ notifyBookingStatusChange: jest.fn() }));
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

describe('OPS-216 — booking payment webhook is atomic', () => {
  it('releases the event claim and leaves the intent retryable when escrow fails', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (/SELECT status FROM payment_intents/.test(sql)) return { rows: [{ status: 'awaiting_payment' }], rowCount: 1 };
        if (/UPDATE bookings/.test(sql)) return { rows: [{ id: 'booking-1' }], rowCount: 1 };
        if (/SELECT id, customer_id/.test(sql)) {
          return { rows: [{ id: 'booking-1', customer_id: 'customer-1', provider_id: null, status: 'paid', total_amount: '50000' }], rowCount: 1 };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }),
    };
    transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
    holdInEscrowMock.mockRejectedValue(new Error('escrow unavailable'));
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (/INSERT INTO webhook_events/.test(sql)) return { rows: [{ event_id: 'event-1' }], rowCount: 1 };
      if (/DELETE FROM webhook_events/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected outer query: ${sql}`);
    });

    const body = {
      data: {
        id: 'event-1',
        attributes: {
          type: 'payment.paid',
          data: { id: 'pay_1', attributes: { amount: 50000, metadata: { booking_id: 'booking-1', intent_kind: 'booking' } } },
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
    expect(holdInEscrowMock).toHaveBeenCalledWith(client, 'booking-1', 50000);
    expect(updatePaymentStatusMock).not.toHaveBeenCalled();
    expect(updatePaymentStatusInTransactionMock).not.toHaveBeenCalled();
    expect(dbQueryMock.mock.calls.some(([sql]) => /DELETE FROM webhook_events/.test(String(sql)))).toBe(true);
  });
});
