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

it('Bug SEC-063 - a malformed exact provider review ID is rejected before service access', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const app = express();
  app.use('/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/admin/providers/${providerId}/reviews?reviewId=not-a-uuid`);

  expect(response.status).toBe(400);
  expect(response.body.error.message).toContain('reviewId must be a valid UUID');
  expect(getProviderReviewsMock).not.toHaveBeenCalled();
});
