import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('Bug OPS-409 - audit timeline resolves the owning provider for provider child records instead of trusting optional JSON details', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const staffId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockImplementationOnce(async (sql: string) => {
      const resolvesEveryProviderChild = [
        "combined.entity_type = 'provider_application'",
        "combined.entity_type = 'provider_document'",
        "combined.entity_type = 'provider_certification'",
        "combined.entity_type = 'provider_staff'",
        "combined.entity_type = 'provider_note'",
        "combined.entity_type = 'review'",
      ].every((fragment) => sql.includes(fragment));
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          source: 'admin_actions',
          user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          action: 'provider_staff_suspended',
          entity_type: 'provider_staff',
          entity_id: staffId,
          old_values: null,
          new_values: { previousStatus: 'approved', nextStatus: 'suspended' },
          ip_address: null,
          user_agent: null,
          reason: 'Support containment',
          created_at: new Date('2026-09-03T08:00:00.000Z'),
          user_email: 'operator@example.com',
          user_role: 'super_admin',
          target_user_role: null,
          target_provider_id: resolvesEveryProviderChild ? providerId : null,
        }],
        rowCount: 1,
      };
    });

  const app = express();
  app.use('/admin', adminRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app).get('/admin/audit-log');

  expect(response.status).toBe(200);
  expect(response.body.data[0]).toEqual(expect.objectContaining({
    entityType: 'provider_staff',
    entityId: staffId,
    newValues: { previousStatus: 'approved', nextStatus: 'suspended' },
    targetProviderId: providerId,
  }));
});
