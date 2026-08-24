import express from 'express';
import request from 'supertest';

const setAutoChargePaymentMethodMock = jest.fn();
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-1', role: 'customer' };
    next();
  },
}));
jest.mock('../src/services/recurring-auto-charge.service', () => ({
  setAutoChargePaymentMethod: (...args: unknown[]) => setAutoChargePaymentMethodMock(...args),
  clearAutoChargePaymentMethod: jest.fn(),
  listAttempts: jest.fn(),
}));
jest.mock('../src/services/recurring.service', () => ({}));

import recurringRouter from '../src/routes/recurring.routes';

it('BUG-UX-189 — recurring auto-charge activation is rejected before any payment token is stored', async () => {
  const app = express();
  app.use(express.json());
  app.use('/recurring', recurringRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  const response = await request(app)
    .put('/recurring/series-1/auto-charge')
    .send({ paymentMethodId: 'pm_unsafe', paymentMethodLabel: 'Visa 4242' });

  expect(response.status).toBe(503);
  expect(response.body.error).toMatch(/must be paid manually/i);
  expect(setAutoChargePaymentMethodMock).not.toHaveBeenCalled();
});
