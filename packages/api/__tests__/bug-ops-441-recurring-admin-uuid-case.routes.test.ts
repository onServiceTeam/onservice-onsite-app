import express from 'express';
import request from 'supertest';

const getAdminRecurringBooking = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/recurring.service', () => ({
  getAdminRecurringBooking: (...args: unknown[]) => getAdminRecurringBooking(...args),
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('Bug OPS-441 - an uppercase Admin recurring route UUID reaches the service in canonical form', async () => {
  const seriesId = '12150000-abcd-4abc-8def-000000001215';
  getAdminRecurringBooking.mockResolvedValue({ id: seriesId, status: 'active' });
  const app = express();
  app.use('/admin', adminRouter);

  const response = await request(app).get(`/admin/recurring/${seriesId.toUpperCase()}`);

  expect(response.status).toBe(200);
  expect(getAdminRecurringBooking).toHaveBeenCalledWith(seriesId);
  expect(response.body.data).toMatchObject({ id: seriesId, status: 'active' });
});
