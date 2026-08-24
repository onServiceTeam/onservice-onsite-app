import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const getProviderNoShowMinutesMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'provider-user-1', role: 'provider', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/booking.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/settings.service', () => ({
  getProviderNoShowMinutes: (...args: unknown[]) => getProviderNoShowMinutesMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('Bug UX-257 — provider no-show reporting enforces the live admin wait', async () => {
  getProviderNoShowMinutesMock.mockResolvedValueOnce(45);
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
      status: 'provider_arrived', escrow_status: 'held',
      scheduled_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    }] });

  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  const response = await request(app).post('/bookings/booking-1/report-no-show');

  expect(response.status).toBe(409);
  expect(response.body.error).toMatch(/25 more minutes/);
  expect(response.body.error).toMatch(/at least 45 minutes/);
  expect(getProviderNoShowMinutesMock).toHaveBeenCalledTimes(1);
});
