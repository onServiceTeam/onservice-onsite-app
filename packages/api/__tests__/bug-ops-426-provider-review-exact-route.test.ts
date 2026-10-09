import express from 'express';
import request from 'supertest';

const getProviderReviewsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/provider-admin.service', () => ({
  getProviderReviews: (...args: unknown[]) => getProviderReviewsMock(...args),
}));

import providerAdminRouter from '../src/routes/provider-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-426 - an exact provider review route forces a one-record query with both canonical IDs', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const reviewId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  getProviderReviewsMock.mockResolvedValueOnce({ rows: [], total: 0, page: 1, pageSize: 1 });
  const app = express();
  app.use('/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/providers/${providerId}/reviews?reviewId=${reviewId}`);

  expect(response.status).toBe(200);
  expect(getProviderReviewsMock).toHaveBeenCalledWith(providerId, 1, 1, reviewId);
  expect(response.body.data).toMatchObject({ rows: [], total: 0, page: 1, pageSize: 1 });
});
