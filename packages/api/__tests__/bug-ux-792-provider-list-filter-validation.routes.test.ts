import express from 'express';
import request from 'supertest';

const listProvidersMock = jest.fn();
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));
jest.mock('../src/services/admin.service', () => ({
  listProviders: (...args: unknown[]) => listProvidersMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-792 — malformed provider-list pagination, enums, and market IDs fail before service work', async () => {
  const app = express();
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const responses = await Promise.all([
    request(app).get('/admin/providers?page=1.5'),
    request(app).get('/admin/providers?status=made_up'),
    request(app).get('/admin/providers?online=yes'),
    request(app).get('/admin/providers?serviceAreaId=not-a-uuid'),
  ]);

  expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
  expect(listProvidersMock).not.toHaveBeenCalled();
});
