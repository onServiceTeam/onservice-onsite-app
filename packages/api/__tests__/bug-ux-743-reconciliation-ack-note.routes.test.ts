import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'super_admin' };
    next();
  },
}));

const acknowledgeMock = jest.fn();
jest.mock('../src/services/reconciliation.service', () => ({
  acknowledgeDiscrepancy: (...args: unknown[]) => acknowledgeMock(...args),
}));
jest.mock('../src/services/vat-report.service', () => ({}));
jest.mock('../src/services/bir-2307.service', () => ({}));
jest.mock('../src/services/financial-admin.service', () => ({}));

import birAdminRouter from '../src/routes/bir-admin.routes';

it('Bug UX-743 — reconciliation acknowledgement notes enforce the same minimum at the API boundary as the admin form', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/bir', birAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app)
    .post('/admin/bir/reconciliation/11111111-1111-4111-8111-111111111111/acknowledge')
    .send({ note: 'nope' });

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/5 to 1000 characters/i);
  expect(acknowledgeMock).not.toHaveBeenCalled();
});
