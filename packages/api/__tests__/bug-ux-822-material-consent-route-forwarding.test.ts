import express from 'express';
import request from 'supertest';

const publishMock = jest.fn().mockResolvedValue({
  id: 'publish-1',
  consentType: 'privacy_policy',
  version: 'v3',
  material: true,
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: { userId: string; role: string } }).user = {
      userId: '22222222-2222-4222-8222-222222222222',
      role: 'dpo',
    };
    next();
  },
}));
jest.mock('../src/middleware/require-dpo.middleware', () => ({
  requireDpoRole: (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/compliance.service', () => ({}));
jest.mock('../src/services/compliance-admin.service', () => ({
  publishConsentVersion: (...args: unknown[]) => publishMock(...args),
}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug UX-822 — the consent-version route forwards an explicit material decision to publication', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/compliance', complianceAdminRouter);

  const response = await request(app)
    .post('/api/v1/admin/compliance/consent-versions')
    .send({
      consentType: 'privacy_policy',
      version: 'v3',
      effectiveAt: '2026-09-01T00:00:00.000+08:00',
      changeSummary: 'Adds a newly approved processing purpose for customer records.',
      material: true,
    });

  expect(response.status).toBe(201);
  expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
    adminUserId: '22222222-2222-4222-8222-222222222222',
    consentType: 'privacy_policy',
    version: 'v3',
    material: true,
  }));
});
