import express from 'express';
import request from 'supertest';

const mockProviderReviewList = jest.fn().mockResolvedValue([]);
const mockAreaChangeList = jest.fn().mockResolvedValue([]);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'super_admin' };
    next();
  },
}));

jest.mock('../src/services/provider-onboarding.service', () => ({
  listPendingReview: (limit: number) => mockProviderReviewList(limit),
}));
jest.mock('../src/services/service-area-change.service', () => ({
  listPending: (limit: number) => mockAreaChangeList(limit),
}));
jest.mock('../src/services/admin-2fa.service', () => ({}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-271 — latent Admin review queues clamp hostile limits instead of turning a negative LIMIT into an unbounded read', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);

  expect((await request(app).get('/admin/provider-applications?limit=-5')).status).toBe(200);
  expect((await request(app).get('/admin/service-area-changes?limit=-5')).status).toBe(200);
  expect(mockProviderReviewList).toHaveBeenCalledWith(1);
  expect(mockAreaChangeList).toHaveBeenCalledWith(1);
});
