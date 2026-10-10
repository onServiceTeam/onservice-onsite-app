import express from 'express';
import request from 'supertest';

const getCustomerActivityMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/customer-admin.service', () => ({
  getCustomerActivity: (...args: unknown[]) => getCustomerActivityMock(...args),
}));

import customerAdminRouter from '../src/routes/customer-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-430 - an exact customer activity route carries both canonical IDs into the read service', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const adminActionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  getCustomerActivityMock.mockResolvedValueOnce([]);
  const app = express();
  app.use('/admin/customers', customerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/customers/${customerId}/activity?limit=200&adminActionId=${adminActionId}`);

  expect(response.status).toBe(200);
  expect(getCustomerActivityMock).toHaveBeenCalledWith(customerId, 1, 'admin', adminActionId);
});
