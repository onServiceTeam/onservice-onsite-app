import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const getPaymentOperationsSummaryMock = jest.fn();
jest.mock('../src/services/financial-admin.service', () => ({
  getPaymentOperationsSummary: (...args: unknown[]) => getPaymentOperationsSummaryMock(...args),
}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';

it('Bug UX-742 — gateway retry pages reject negative offsets before service or database work', async () => {
  const app = express();
  app.use('/financials', financialAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app).get('/financials/payments?retryLimit=25&retryOffset=-1');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/non-negative integer/i);
  expect(getPaymentOperationsSummaryMock).not.toHaveBeenCalled();
});
