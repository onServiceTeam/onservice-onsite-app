import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const submitLegacyFinancialReviewMock = jest.fn();
jest.mock('../src/services/legacy-financial-review.service', () => ({
  listLegacyFinancialReviews: jest.fn(),
  getLegacyFinancialReview: jest.fn(),
  submitLegacyFinancialReview: (...args: unknown[]) => submitLegacyFinancialReviewMock(...args),
}));
jest.mock('../src/services/commission-control.service', () => ({}));
jest.mock('../src/services/financial-admin.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';

it('Bug OPS-266 — regular admins can inspect but cannot approve legacy financial terms', async () => {
  const app = express();
  app.use(express.json());
  app.use('/financials', financialAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app)
    .post('/financials/legacy-reviews/00000000-0000-4000-8000-000000000266/complete')
    .send({});

  expect(response.status).toBe(403);
  expect(response.body.error).toMatch(/super admin access required/i);
  expect(submitLegacyFinancialReviewMock).not.toHaveBeenCalled();
});
