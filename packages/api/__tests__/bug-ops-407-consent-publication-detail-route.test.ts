import express from 'express';
import request from 'supertest';

const exactPublication = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: { userId: string; role: string } }).user = {
      userId: '22222222-2222-2222-2222-222222222222',
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
  getPublishedConsentVersion: (...args: unknown[]) => exactPublication(...args),
}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug OPS-407 — the DPO detail route resolves one consent publication by its audit target UUID', async () => {
  const targetId = '11111111-1111-1111-1111-111111111111';
  exactPublication.mockResolvedValue({
    id: '22222222-2222-2222-2222-222222222222',
    targetId,
    consentType: 'privacy_policy',
    version: '3.0',
    effectiveAt: '2026-09-10T00:00:00.000Z',
    changeSummary: 'Approved material changes to account-data processing purposes.',
    material: true,
    publishedBy: '33333333-3333-3333-3333-333333333333',
    publishedAt: '2026-09-03T00:00:00.000Z',
  });
  const app = express();
  app.use('/api/v1/admin/compliance', complianceAdminRouter);

  const response = await request(app)
    .get(`/api/v1/admin/compliance/consent-versions/${targetId}`);

  expect(response.status).toBe(200);
  expect(exactPublication).toHaveBeenCalledWith(targetId);
  expect(response.body.data).toMatchObject({ targetId, version: '3.0' });
});
