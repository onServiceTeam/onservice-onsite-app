import express from 'express';
import request from 'supertest';

const searchConsent = jest.fn();
const dbQuery = jest.fn();

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
jest.mock('../src/services/compliance.service', () => ({
  searchConsent: (...args: unknown[]) => searchConsent(...args),
}));
jest.mock('../src/services/compliance-admin.service', () => ({}));
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQuery(...args) } }));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug OPS-410 - an uppercase consent-search UUID is canonical in lookup and retained audit evidence', async () => {
  const userId = '12110000-abcd-4abc-8def-000000001211';
  searchConsent.mockResolvedValue({ rows: [], total: 0 });
  dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  const app = express();
  app.use('/api/v1/admin/compliance', complianceAdminRouter);

  const response = await request(app)
    .get('/api/v1/admin/compliance/consent')
    .query({
      userId: userId.toUpperCase(),
      consentType: 'privacy_policy',
      version: '4.0',
      limit: '100',
      offset: '0',
    });

  expect(response.status).toBe(200);
  expect(searchConsent).toHaveBeenCalledWith({
    userId,
    consentType: 'privacy_policy',
    version: '4.0',
    limit: 100,
    offset: 0,
  });

  const auditParameters = dbQuery.mock.calls[0]?.[1] as unknown[];
  expect(auditParameters[1]).toBe(userId);
  expect(JSON.parse(String(auditParameters[2]))).toMatchObject({
    filters: { userId, consentType: 'privacy_policy', version: '4.0' },
    resultCount: 0,
  });
  expect(auditParameters[3]).toBe(`DPO consent search: userId=${userId}`);
  expect(auditParameters[4]).toContain(`"userId":"${userId}"`);
  expect(auditParameters[4]).not.toContain(userId.toUpperCase());
});
