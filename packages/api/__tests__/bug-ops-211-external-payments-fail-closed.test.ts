import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'customer-1', role: 'customer' };
    next();
  },
}));
jest.mock('../src/middleware/validation.middleware', () => ({
  validationMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const createPaymentIntentMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  createPaymentIntent: (...args: unknown[]) => createPaymentIntentMock(...args),
  formatPaymentIntent: jest.fn(),
}));
const getBookingMock = jest.fn();
jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...args: unknown[]) => getBookingMock(...args),
}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/booking-offer.service', () => ({ dispatchPaidBookingIfNeeded: jest.fn() }));
jest.mock('../src/services/payout.service', () => ({}));

import paymentRouter from '../src/routes/payment.routes';
import walletRouter from '../src/routes/wallet.routes';

function app(): express.Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/v1/payments', paymentRouter);
  instance.use('/api/v1/wallet', walletRouter);
  instance.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return instance;
}

describe('OPS-211 — invalid external payment flow fails closed', () => {
  it('returns 503 for booking payment and wallet top-up before any booking, database, or gateway effect', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldFlag = process.env.EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED;
    process.env.NODE_ENV = 'staging';
    // Even an accidental flag flip must not reactivate the known-invalid E14
    // implementation. Removing the hold requires a reviewed code change.
    process.env.EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED = '1';
    try {
      const bookingPayment = await request(app())
        .post('/api/v1/payments/intent')
        .send({ bookingId: '11111111-1111-4111-8111-111111111111', paymentMethod: 'gcash' });
      const topUp = await request(app())
        .post('/api/v1/wallet/top-up')
        .send({ amount: 10000, paymentMethod: 'gcash' });

      expect(bookingPayment.status).toBe(503);
      expect(topUp.status).toBe(503);
      expect(bookingPayment.body.error).toMatch(/temporarily unavailable/i);
      expect(topUp.body.error).toMatch(/No payment was created/i);
      expect(getBookingMock).not.toHaveBeenCalled();
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
      expect(dbQueryMock).not.toHaveBeenCalled();
      expect(dbTransactionMock).not.toHaveBeenCalled();
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
      if (oldFlag === undefined) delete process.env.EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED;
      else process.env.EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED = oldFlag;
    }
  });
});
