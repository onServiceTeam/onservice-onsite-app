import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-023', role: 'customer' };
    next();
  },
}));

const mockRecurringCalls = {
  getCustomerRecurringBookings: jest.fn(),
  getRecurringBooking: jest.fn(),
  skipNextInstance: jest.fn(),
  cancelRecurringBooking: jest.fn(),
};
jest.mock('../src/services/recurring.service', () => ({
  ...mockRecurringCalls,
  formatRecurringBooking: jest.fn(),
  formatRecurringInstance: jest.fn(),
}));

const mockClearAutoCharge = jest.fn();
jest.mock('../src/services/recurring-auto-charge.service', () => ({
  clearAutoChargePaymentMethod: (...args: unknown[]) => mockClearAutoCharge(...args),
  listAttempts: jest.fn(),
}));

import recurringRouter from '../src/routes/recurring.routes';

it('Bug SEC-023 — malformed customer recurring controls are rejected before service or payment-method access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/recurring', recurringRouter);
  const seriesId = '02302302-3023-4023-8023-023023023023';

  const invalidPage = await request(app).get('/recurring').query({ page: 'zero' });
  const invalidId = await request(app).get('/recurring/not-a-uuid');
  const invalidSkip = await request(app)
    .post(`/recurring/${seriesId}/skip`)
    .send({ skipDate: '2026-02-30' });
  const invalidCancel = await request(app)
    .post(`/recurring/${seriesId}/cancel`)
    .send({ reason: 'Changed plans', hiddenOverride: true });
  const invalidClear = await request(app).delete('/recurring/not-a-uuid/auto-charge');

  expect([invalidPage.status, invalidId.status, invalidSkip.status, invalidCancel.status, invalidClear.status])
    .toEqual([400, 400, 400, 400, 400]);
  expect(Object.values(mockRecurringCalls).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(mockClearAutoCharge).not.toHaveBeenCalled();
});
