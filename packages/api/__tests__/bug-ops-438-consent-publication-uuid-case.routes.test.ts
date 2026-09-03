import express from 'express';
import request from 'supertest';

const exactPublication = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: { userId: string; role: string } }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

it('Bug OPS-438 - an uppercase consent-publication UUID reaches the service in canonical form', async () => {
  const publicationId = '12090000-abcd-4abc-8def-000000001209';
  exactPublication.mockResolvedValue({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    targetId: publicationId,
    version: '4.0',
  });
  const app = express();
  app.use('/api/v1/admin/compliance', complianceAdminRouter);

  const response = await request(app)
    .get(`/api/v1/admin/compliance/consent-versions/${publicationId.toUpperCase()}`);

  expect(response.status).toBe(200);
  expect(exactPublication).toHaveBeenCalledWith(publicationId);
  expect(response.body.data).toMatchObject({ targetId: publicationId, version: '4.0' });
});
