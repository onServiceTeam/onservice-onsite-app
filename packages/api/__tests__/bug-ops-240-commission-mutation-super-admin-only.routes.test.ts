import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const scheduleCommissionRateMock = jest.fn();
jest.mock('../src/services/commission-control.service', () => ({
  scheduleCommissionRate: (...args: unknown[]) => scheduleCommissionRateMock(...args),
  listCommissionRates: jest.fn(),
  previewCommissionSchedule: jest.fn(),
  cancelScheduledCommissionRate: jest.fn(),
}));
jest.mock('../src/services/financial-admin.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';

it('Bug OPS-240 — regular admins cannot schedule a commission change', async () => {
  const app = express();
  app.use(express.json());
  app.use('/financials', financialAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app)
    .post('/financials/commission-controls')
    .send({ scopeType: 'tier', tier: 'new', rateBasisPoints: 1400 });

  expect(response.status).toBe(403);
  expect(response.body.error).toMatch(/super admin access required/i);
  expect(scheduleCommissionRateMock).not.toHaveBeenCalled();
});
