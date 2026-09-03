import express from 'express';
import request from 'supertest';

const getProviderActivityMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/provider-admin.service', () => ({
  getProviderActivity: (...args: unknown[]) => getProviderActivityMock(...args),
}));

import providerAdminRouter from '../src/routes/provider-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-432 - an exact provider activity route carries both canonical IDs into the read service', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const adminActionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  getProviderActivityMock.mockResolvedValueOnce([]);
  const app = express();
  app.use('/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/providers/${providerId}/activity?limit=200&adminActionId=${adminActionId}`);

  expect(response.status).toBe(200);
  expect(getProviderActivityMock).toHaveBeenCalledWith(providerId, 1, 'admin', adminActionId);
});
