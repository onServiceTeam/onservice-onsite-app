// §33 fix — the PayMongo webhook is idempotent at the event level. The first
// delivery of an event id is claimed + processed; a duplicate is skipped without
// reprocessing. Behavioral test: real handler via supertest, signed like PayMongo.

import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';

const SECRET = 'whsec_test';
process.env.PAYMONGO_WEBHOOK_SECRET = SECRET;

const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => queryMock(...a), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const getBookingPaymentIntentMock = jest.fn().mockResolvedValue(null);
jest.mock('../src/services/payment.service', () => ({
  getBookingPaymentIntent: (...a: unknown[]) => getBookingPaymentIntentMock(...a),
  getTopupPaymentIntent: jest.fn().mockResolvedValue(null),
  updatePaymentStatus: jest.fn(),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/security.service', () => ({ logSecurityEvent: jest.fn() }));

import webhookRouter from '../src/routes/webhook.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

function sign(body: unknown): { raw: string; header: string } {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
  return { raw, header: `t=${ts},te=${sig}` };
}

function eventBody(eventId: string): unknown {
  return { data: { id: eventId, attributes: { type: 'payment.paid', data: { id: 'pay_1', attributes: { metadata: { booking_id: 'bk1' } } } } } };
}

beforeEach(() => {
  queryMock.mockReset();
  getBookingPaymentIntentMock.mockClear();
});

describe('PayMongo webhook — event-level idempotency (§33)', () => {
  it('processes a first-seen event (claim succeeds) and marks it done', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt_1' }], rowCount: 1 }) // claim INSERT (claimed)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                     // mark done UPDATE
    const body = eventBody('evt_1');
    const { header } = sign(body);
    const res = await request(buildApp()).post('/api/v1/webhooks/paymongo').set('paymongo-signature', header).send(body as object);
    expect(res.status).toBe(200);
    expect(res.body.data.idempotent).toBeUndefined();
    // Processing actually ran (payment intent lookup happened).
    expect(getBookingPaymentIntentMock).toHaveBeenCalled();
  });

  it('skips a duplicate event (claim conflicts) without reprocessing', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                       // claim INSERT -> conflict
      .mockResolvedValueOnce({ rows: [{ status: 'done' }], rowCount: 1 });    // existing-status lookup
    const body = eventBody('evt_1');
    const { header } = sign(body);
    const res = await request(buildApp()).post('/api/v1/webhooks/paymongo').set('paymongo-signature', header).send(body as object);
    expect(res.status).toBe(200);
    expect(res.body.data.idempotent).toBe(true);
    // No payment processing on a duplicate.
    expect(getBookingPaymentIntentMock).not.toHaveBeenCalled();
  });
});
