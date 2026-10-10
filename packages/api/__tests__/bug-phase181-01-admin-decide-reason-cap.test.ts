import express from 'express';
import request from 'supertest';

const providerDecisionMock = jest.fn().mockResolvedValue({ status: 'approved' });
const areaDecisionMock = jest.fn().mockResolvedValue({ status: 'approved' });
jest.mock('../src/services/provider-application-review.service', () => ({
  decideApplication: (...args: unknown[]) => providerDecisionMock(...args),
}));
jest.mock('../src/services/service-area-change.service', () => ({
  decide: (...args: unknown[]) => areaDecisionMock(...args),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'operator', role: 'super_admin' };
    next();
  },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';

it('Bug PHASE181-01 — admin decision routes reject oversized reasons before invoking either decision service', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use((error: { statusCode?: number; message?: string },
    _req: express.Request, res: express.Response, _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message }));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  for (const endpoint of [
    `/admin/provider-applications/${id}/decide`,
    `/admin/service-area-changes/${id}/decide`,
  ]) {
    const rejected = await request(app).post(endpoint)
      .send({ decision: 'approved', reason: 'x'.repeat(5001) });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('reason cannot exceed 5000 characters.');
  }
  expect(providerDecisionMock).not.toHaveBeenCalled();
  expect(areaDecisionMock).not.toHaveBeenCalled();

  // Exercise the inclusive cap on the route whose canonical reason contract
  // is 5000 characters. Provider approval applies a stricter downstream cap.
  const accepted = await request(app).post(`/admin/service-area-changes/${id}/decide`)
    .send({ decision: 'approved', reason: 'x'.repeat(5000) });
  expect(accepted.status).toBe(200);
  expect(areaDecisionMock).toHaveBeenCalledWith({
    changeId: id, adminUserId: 'operator', decision: 'approved', reason: 'x'.repeat(5000),
  });
});
