import express from 'express';
import request from 'supertest';

const getCustomerPaymentsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/customer-admin.service', () => ({
  getCustomerPayments: (...args: unknown[]) => getCustomerPaymentsMock(...args),
}));

import customerAdminRouter from '../src/routes/customer-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-064 - a malformed exact customer wallet transaction ID is rejected before service access', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const app = express();
  app.use('/admin/customers', customerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/customers/${customerId}/payments?transactionId=not-a-uuid`);

  expect(response.status).toBe(400);
  expect(response.body.error.message).toContain('transactionId must be a valid UUID');
  expect(getCustomerPaymentsMock).not.toHaveBeenCalled();
});
