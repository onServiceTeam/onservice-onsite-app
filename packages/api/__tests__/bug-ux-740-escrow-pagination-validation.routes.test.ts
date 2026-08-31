import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const getEscrowSummaryMock = jest.fn();
jest.mock('../src/services/financial-admin.service', () => ({
  getEscrowSummary: (...args: unknown[]) => getEscrowSummaryMock(...args),
}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';

it('Bug UX-740 — escrow pages reject oversized limits before service or database work', async () => {
  const app = express();
  app.use('/financials', financialAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app).get('/financials/escrow?limit=500&offset=0');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/integer between 1 and 100/i);
  expect(getEscrowSummaryMock).not.toHaveBeenCalled();
});
