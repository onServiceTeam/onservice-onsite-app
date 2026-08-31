import express from 'express';
import request from 'supertest';

const mockState = { currentRole: 'admin' };
const mockListDsrs = jest.fn().mockResolvedValue({ rows: [], total: 0 });
const mockMarkDsrComplete = jest.fn().mockResolvedValue({ id: 'dsr-1', status: 'completed' });
const mockListConsentVersions = jest.fn().mockResolvedValue([]);
const mockListPublishedConsentVersions = jest.fn().mockResolvedValue([]);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: `${mockState.currentRole}-1`, role: mockState.currentRole };
    next();
  },
}));
jest.mock('../src/services/compliance.service', () => ({
  listDsrs: (...args: unknown[]) => mockListDsrs(...args),
}));
jest.mock('../src/services/compliance-admin.service', () => ({
  markDsrComplete: (...args: unknown[]) => mockMarkDsrComplete(...args),
  listConsentVersions: (...args: unknown[]) => mockListConsentVersions(...args),
  listPublishedConsentVersions: (...args: unknown[]) => mockListPublishedConsentVersions(...args),
}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/compliance', complianceAdminRouter);
  app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  return app;
}

it('Bug UX-560 — DSR and consent-version APIs admit DPO/super-admin and reject operations admin', async () => {
  const app = buildApp();
  const dsrId = '11111111-1111-4111-8111-111111111111';
  mockState.currentRole = 'admin';
  expect((await request(app).get('/api/v1/admin/compliance/dsr')).status).toBe(403);
  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${dsrId}/complete`).send({})).status).toBe(403);
  expect((await request(app).get('/api/v1/admin/compliance/consent-versions')).status).toBe(403);

  mockState.currentRole = 'dpo';
  expect((await request(app).get('/api/v1/admin/compliance/dsr')).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${dsrId}/complete`).send({})).status).toBe(200);
  expect((await request(app).get('/api/v1/admin/compliance/consent-versions')).status).toBe(200);

  mockState.currentRole = 'super_admin';
  expect((await request(app).get('/api/v1/admin/compliance/dsr')).status).toBe(200);
  expect(mockListDsrs).toHaveBeenCalledTimes(2);
  expect(mockMarkDsrComplete).toHaveBeenCalledTimes(1);
});
