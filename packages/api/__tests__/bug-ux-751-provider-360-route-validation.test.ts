import express from 'express';
import request from 'supertest';

const jobsMock = jest.fn();
const suspendMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

jest.mock('../src/services/provider-admin.service', () => ({
  getProviderJobs: (...args: unknown[]) => jobsMock(...args),
}));

jest.mock('../src/services/admin.service', () => ({
  suspendProvider: (...args: unknown[]) => suspendMock(...args),
}));

import providerAdminRouter from '../src/routes/provider-admin.routes';
import adminRouter from '../src/routes/admin.routes';

it('Bug UX-751 — Provider 360 and provider-status routes reject malformed identifiers and list filters before service work', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/providers-360', providerAdminRouter);
  app.use('/admin', adminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });
  const providerId = '0198f711-c7c8-7a42-8c86-43f49d91f2d0';

  const malformedId = await request(app).get('/admin/providers-360/not-a-uuid/jobs');
  const malformedPage = await request(app).get(`/admin/providers-360/${providerId}/jobs?page=1.5`);
  const unknownStatus = await request(app).get(`/admin/providers-360/${providerId}/jobs?status=made_up`);
  const malformedStatusTarget = await request(app)
    .put('/admin/providers/not-a-uuid/suspend')
    .send({ reason: 'Documented provider suspension reason.' });

  expect([
    malformedId.status,
    malformedPage.status,
    unknownStatus.status,
    malformedStatusTarget.status,
  ]).toEqual([400, 400, 400, 400]);
  expect(malformedStatusTarget.body.error).toMatch(/valid UUID/i);
  expect(jobsMock).not.toHaveBeenCalled();
  expect(suspendMock).not.toHaveBeenCalled();
});
