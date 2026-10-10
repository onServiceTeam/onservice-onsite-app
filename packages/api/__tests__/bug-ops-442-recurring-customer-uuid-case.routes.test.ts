import express from 'express';
import request from 'supertest';

const getRecurringBooking = jest.fn();
const formatRecurringBooking = jest.fn((value: unknown) => value);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/recurring.service', () => ({
  getRecurringBooking: (...args: unknown[]) => getRecurringBooking(...args),
  formatRecurringBooking: (...args: unknown[]) => formatRecurringBooking(...args),
}));
jest.mock('../src/services/recurring-auto-charge.service', () => ({}));

import recurringRouter from '../src/routes/recurring.routes';

it('Bug OPS-442 - an uppercase customer recurring route UUID reaches the owned-record lookup in canonical form', async () => {
  const seriesId = '12150000-abcd-4abc-8def-000000001215';
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  getRecurringBooking.mockResolvedValue({ id: seriesId, customerId, status: 'active' });
  const app = express();
  app.use('/recurring', recurringRouter);

  const response = await request(app).get(`/recurring/${seriesId.toUpperCase()}`);

  expect(response.status).toBe(200);
  expect(getRecurringBooking).toHaveBeenCalledWith(seriesId, customerId);
  expect(response.body.data).toMatchObject({ id: seriesId, customerId, status: 'active' });
});
