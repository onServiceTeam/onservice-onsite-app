import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

const webhookSecret = 'whsec_med_n155';
const previousWebhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret;

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const getBookingPaymentIntentMock = jest.fn();
const updatePaymentStatusMock = jest.fn();
const captureMessageMock = jest.fn();
const logSecurityEventMock = jest.fn();
const loggerErrorMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: jest.fn(() => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next()),
}));
jest.mock('@sentry/node', () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/services/payment.service', () => ({
  getBookingPaymentIntent: (...args: unknown[]) => getBookingPaymentIntentMock(...args),
  getTopupPaymentIntent: jest.fn(),
  updatePaymentStatus: (...args: unknown[]) => updatePaymentStatusMock(...args),
  updatePaymentStatusInTransaction: jest.fn(),
}));
jest.mock('../src/services/escrow.service', () => ({ holdInEscrowInTransaction: jest.fn() }));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({ notifyBookingStatusChange: jest.fn() }));
jest.mock('../src/services/security.service', () => ({
  logSecurityEvent: (...args: unknown[]) => logSecurityEventMock(...args),
}));
jest.mock('../src/services/booking-offer.service', () => ({
  dispatchPaidBookingIfNeeded: jest.fn(),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendAuthorizationTermsInTransaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
    debug: jest.fn(),
  },
}));

import webhookRouter from '../src/routes/webhook.routes';

function signedHeader(body: unknown): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');
  return `t=${timestamp},te=${signature}`;
}

it('MED-N155 - a paid webhook amount mismatch alerts operations without moving money or losing the event', async () => {
  const mismatchInfo = {
    bookingId: 'booking-med-n155',
    intentId: 'intent-med-n155',
    webhookAmount: 60000,
    intentAmount: 50000,
    deltaCentavos: 10000,
    paymongoPaymentId: 'pay_med_n155',
  };
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO webhook_events')) {
      return { rows: [{ event_id: 'event-med-n155' }], rowCount: 1 };
    }
    if (sql.includes("UPDATE webhook_events SET status = 'done'")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected webhook query: ${sql}`);
  });
  getBookingPaymentIntentMock.mockResolvedValue({
    id: 'intent-med-n155',
    booking_id: 'booking-med-n155',
    amount: '50000',
    payment_method: 'gcash',
    status: 'awaiting_payment',
  });
  captureMessageMock.mockImplementation(() => {
    throw new Error('simulated Sentry outage');
  });
  logSecurityEventMock.mockRejectedValue(new Error('simulated security audit outage'));

  const body = {
    data: {
      id: 'event-med-n155',
      attributes: {
        type: 'payment.paid',
        data: {
          id: 'pay_med_n155',
          attributes: {
            amount: 60000,
            metadata: { booking_id: 'booking-med-n155', intent_kind: 'booking' },
          },
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRouter);

  try {
    const response = await request(app)
      .post('/api/v1/webhooks/paymongo')
      .set('paymongo-signature', signedHeader(body))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { received: true } });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Webhook amount mismatch — POSSIBLE TAMPERING',
      mismatchInfo,
    );
    expect(captureMessageMock).toHaveBeenCalledWith('Webhook payment.amount mismatch', {
      level: 'error',
      extra: mismatchInfo,
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith({
      eventType: 'payment_amount_mismatch',
      metadata: mismatchInfo,
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Sentry capture failed for amount mismatch',
      { error: 'simulated Sentry outage' },
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'security_events insert failed for amount mismatch',
      { error: 'simulated security audit outage' },
    );
    expect(dbQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE webhook_events SET status = 'done'"),
      ['event-med-n155'],
    );
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(updatePaymentStatusMock).not.toHaveBeenCalled();
  } finally {
    if (previousWebhookSecret === undefined) delete process.env.PAYMONGO_WEBHOOK_SECRET;
    else process.env.PAYMONGO_WEBHOOK_SECRET = previousWebhookSecret;
  }
});
