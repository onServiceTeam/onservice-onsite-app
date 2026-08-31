import express from 'express';
import request from 'supertest';

let currentRole: 'admin' | 'super_admin' = 'admin';
const clearAmlReviewMock = jest.fn();
const payoutId = '11111111-1111-4111-8111-111111111111';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'admin-user-1',
      role: currentRole,
      iat: 0,
      exp: 0,
    };
    next();
  },
}));

jest.mock('../src/services/payout.service', () => ({
  clearAmlReview: (...args: unknown[]) => clearAmlReviewMock(...args),
  formatPayout: (payout: unknown) => payout,
}));

jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import payoutRouter from '../src/routes/payout.routes';

it('Bug FIN-006 — AML review route blocks junior admins and passes a reasoned super-admin decision', async () => {
  const app = express();
  app.use(express.json());
  app.use('/payouts', payoutRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  currentRole = 'admin';
  const denied = await request(app)
    .put(`/payouts/${payoutId}/clear-aml-review`)
    .send({ reason: 'Junior admin attempted clearance.' });
  expect(denied.status).toBe(403);
  expect(clearAmlReviewMock).not.toHaveBeenCalled();

  currentRole = 'super_admin';
  clearAmlReviewMock.mockResolvedValueOnce({ id: payoutId, status: 'pending' });
  const allowed = await request(app)
    .put(`/payouts/${payoutId}/clear-aml-review`)
    .send({ reason: 'Identity and transaction context were reviewed.' });
  expect(allowed.status).toBe(200);
  expect(clearAmlReviewMock).toHaveBeenCalledWith(
    payoutId,
    'admin-user-1',
    'Identity and transaction context were reviewed.',
  );
});
