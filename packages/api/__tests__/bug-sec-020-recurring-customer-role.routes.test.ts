import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'provider-user-020', role: 'provider' };
    next();
  },
}));

const createRecurringMock = jest.fn();
jest.mock('../src/services/recurring.service', () => ({
  createRecurringBooking: (...args: unknown[]) => createRecurringMock(...args),
  formatRecurringBooking: jest.fn(),
}));
jest.mock('../src/services/recurring-auto-charge.service', () => ({}));

import recurringRouter from '../src/routes/recurring.routes';

it('Bug SEC-020 — a provider cannot create a customer-owned recurring series under the provider user ID', async () => {
  const app = express();
  app.use(express.json());
  app.use('/recurring', recurringRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  const response = await request(app).post('/recurring').send({});

  expect(response.status).toBe(403);
  expect(response.body.message).toBe('Customer access required.');
  expect(createRecurringMock).not.toHaveBeenCalled();
});
