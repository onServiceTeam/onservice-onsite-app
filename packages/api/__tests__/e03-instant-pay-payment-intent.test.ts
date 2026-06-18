// E03 — fixed-price INSTANT-PAY. A real UX tester (2026-06-16) hit "tapping Pay
// says it's on request status": the booking was created as 'requested' and the
// payment-intent route 409'd because the state machine forbade
// requested → payment_pending. Behavioral test via supertest: a payment intent
// for a 'requested' booking now succeeds (201) and advances the booking to
// payment_pending; a non-payable status still 409s.

import express from 'express';
import request from 'supertest';

const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...a: unknown[]) => queryMock(...a), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Auth: inject a fixed customer so the route's ownership check passes.
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { userId: 'cust1', role: 'customer' };
    next();
  },
}));
// Validation: passthrough (the body we send is already well-formed).
jest.mock('../src/middleware/validation.middleware', () => ({
  validationMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const getBookingByIdAdminMock = jest.fn();
jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...a: unknown[]) => getBookingByIdAdminMock(...a),
}));
const createPaymentIntentMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  createPaymentIntent: (...a: unknown[]) => createPaymentIntentMock(...a),
  formatPaymentIntent: (x: { id: string; status: string }) => ({ id: x.id, status: x.status }),
}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
const dispatchPaidMock = jest.fn();
jest.mock('../src/services/booking-offer.service', () => ({
  dispatchPaidBookingIfNeeded: (...a: unknown[]) => dispatchPaidMock(...a),
}));

import paymentRouter from '../src/routes/payment.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/payments', paymentRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
  getBookingByIdAdminMock.mockReset();
  createPaymentIntentMock.mockReset();
  dispatchPaidMock.mockReset();
});

describe('E03 — payment intent for a fixed-price requested booking (instant-pay)', () => {
  it('Bug 2026-06-16 — creating a payment intent for a "requested" booking succeeds (was HTTP 409)', async () => {
    getBookingByIdAdminMock.mockResolvedValue({ id: 'bk1', customer_id: 'cust1', status: 'requested', total_amount: 50000 });
    createPaymentIntentMock.mockResolvedValue({ id: 'pi1', paymongo_intent_id: 'pm1', status: 'awaiting_payment_method' });
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 }); // UPDATE booking -> payment_pending

    const res = await request(buildApp())
      .post('/api/v1/payments/intent')
      .send({ bookingId: 'bk1', paymentMethod: 'gcash' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // The booking was advanced to payment_pending.
    const advanced = queryMock.mock.calls.some((c) => String(c[0]).includes("status = 'payment_pending'"));
    expect(advanced).toBe(true);
  });

  it('still rejects paying for a booking in a non-payable status (e.g. completed_by_provider)', async () => {
    getBookingByIdAdminMock.mockResolvedValue({ id: 'bk2', customer_id: 'cust1', status: 'completed_by_provider', total_amount: 50000 });

    const res = await request(buildApp())
      .post('/api/v1/payments/intent')
      .send({ bookingId: 'bk2', paymentMethod: 'gcash' });

    expect(res.status).toBe(409);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });
});
