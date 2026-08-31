import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'super_admin' };
    next();
  },
}));

const runMock = jest.fn();
jest.mock('../src/services/reconciliation.service', () => ({
  runDailyReconciliation: (...args: unknown[]) => runMock(...args),
}));
jest.mock('../src/services/vat-report.service', () => ({}));
jest.mock('../src/services/bir-2307.service', () => ({}));
jest.mock('../src/services/financial-admin.service', () => ({}));

import birAdminRouter from '../src/routes/bir-admin.routes';

it('Bug UX-726 — a manual reconciliation cannot record an expected-only snapshot as a successful comparison', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/bir', birAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const missing = await request(app).post('/admin/bir/reconciliation/run').send({ notes: 'month end' });

  expect(missing.status).toBe(400);
  expect(missing.body.error).toMatch(/paymongoBalance is required/i);
  expect(runMock).not.toHaveBeenCalled();
});
