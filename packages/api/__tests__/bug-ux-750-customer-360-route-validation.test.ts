import express from 'express';
import request from 'supertest';

const bookingsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

jest.mock('../src/services/customer-admin.service', () => ({
  getCustomerBookings: (...args: unknown[]) => bookingsMock(...args),
}));

import customerAdminRouter from '../src/routes/customer-admin.routes';

it('Bug UX-750 — Customer 360 rejects malformed account, pagination, and booking-status inputs before database services run', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/customers', customerAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });
  const customerId = '0198f711-c7c8-7a42-8c86-43f49d91f2d0';

  const malformedId = await request(app).get('/admin/customers/not-a-uuid/bookings');
  const malformedPage = await request(app).get(`/admin/customers/${customerId}/bookings?page=NaN`);
  const unknownStatus = await request(app).get(`/admin/customers/${customerId}/bookings?status=made_up`);

  expect([malformedId.status, malformedPage.status, unknownStatus.status]).toEqual([400, 400, 400]);
  expect(malformedId.body.error).toMatch(/valid UUID/i);
  expect(malformedPage.body.error).toMatch(/positive integer/i);
  expect(unknownStatus.body.error).toMatch(/known booking status/i);
  expect(bookingsMock).not.toHaveBeenCalled();
});
