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

const mockRecurringService = {
  createRecurringBooking: jest.fn(),
  getCustomerRecurringBookings: jest.fn(),
  getRecurringPricePreview: jest.fn(),
  getRecurringBooking: jest.fn(),
  getRecurringInstances: jest.fn(),
  pauseRecurringBooking: jest.fn(),
  resumeRecurringBooking: jest.fn(),
  cancelRecurringBooking: jest.fn(),
  skipNextInstance: jest.fn(),
};
jest.mock('../src/services/recurring.service', () => ({
  ...mockRecurringService,
  formatRecurringBooking: jest.fn(),
  formatRecurringInstance: jest.fn(),
}));
const mockAutoChargeService = {
  clearAutoChargePaymentMethod: jest.fn(),
  listAttempts: jest.fn(),
};
jest.mock('../src/services/recurring-auto-charge.service', () => mockAutoChargeService);

import recurringRouter from '../src/routes/recurring.routes';

it('Bug SEC-020 — a provider cannot access any customer-owned recurring endpoint', async () => {
  const app = express();
  app.use(express.json());
  app.use('/recurring', recurringRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  const seriesId = '02002002-0020-4020-8020-020020020020';
  const subcategoryId = '02002002-0020-4020-8020-020020020021';
  const responses = await Promise.all([
    request(app).post('/recurring').send({}),
    request(app).get('/recurring'),
    request(app).get(`/recurring/preview/${subcategoryId}`),
    request(app).get(`/recurring/${seriesId}`),
    request(app).get(`/recurring/${seriesId}/instances`),
    request(app).post(`/recurring/${seriesId}/pause`),
    request(app).post(`/recurring/${seriesId}/resume`),
    request(app).post(`/recurring/${seriesId}/cancel`).send({}),
    request(app).post(`/recurring/${seriesId}/skip`).send({}),
    request(app).put(`/recurring/${seriesId}/auto-charge`).send({}),
    request(app).delete(`/recurring/${seriesId}/auto-charge`),
    request(app).get(`/recurring/${seriesId}/auto-charge/attempts`),
  ]);

  expect(responses).toHaveLength(12);
  expect(responses.every((response) => response.status === 403)).toBe(true);
  expect(responses.every((response) => response.body.message === 'Customer access required.')).toBe(true);
  expect(Object.values(mockRecurringService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(Object.values(mockAutoChargeService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
});
