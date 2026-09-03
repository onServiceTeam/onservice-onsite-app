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

it('Bug OPS-428 - an exact customer wallet route carries both canonical IDs into the read service', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const transactionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  getCustomerPaymentsMock.mockResolvedValueOnce({
    walletAvailable: 0, walletPending: 0, recentTransactions: [],
    recentPaymentIntents: [], paymentMethodCounts: {},
  });
  const app = express();
  app.use('/admin/customers', customerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/customers/${customerId}/payments?transactionId=${transactionId}`);

  expect(response.status).toBe(200);
  expect(getCustomerPaymentsMock).toHaveBeenCalledWith(customerId, transactionId);
});
