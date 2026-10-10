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

it('Bug SEC-065 - a malformed exact customer admin-action ID is rejected before service access', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const app = express();
  app.use('/admin/customers', customerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/customers/${customerId}/activity?adminActionId=not-a-uuid`);

  expect(response.status).toBe(400);
  expect(response.body.error.message).toContain('adminActionId must be a valid UUID');
  expect(getCustomerActivityMock).not.toHaveBeenCalled();
});
