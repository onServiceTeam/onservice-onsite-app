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

it('Bug OPS-402 — audit timeline returns canonical target identities separately from the acting operator', async () => {
  const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const providerUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const providerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          source: 'admin_actions',
          user_id: actorId,
          action: 'user_force_logout',
          entity_type: 'user',
          entity_id: customerId,
          old_values: null,
          new_values: { accountType: 'customer' },
          ip_address: null,
          user_agent: null,
          reason: 'Support containment',
          created_at: new Date('2026-09-03T08:00:00.000Z'),
          user_email: 'operator@example.com',
          user_role: 'super_admin',
          target_user_role: 'customer',
          target_provider_id: null,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          source: 'admin_actions',
          user_id: actorId,
          action: 'user_force_logout',
          entity_type: 'user',
          entity_id: providerUserId,
          old_values: null,
          new_values: { accountType: 'provider', providerId },
          ip_address: null,
          user_agent: null,
          reason: 'Provider account containment',
          created_at: new Date('2026-09-03T07:00:00.000Z'),
          user_email: 'operator@example.com',
          user_role: 'super_admin',
          target_user_role: 'provider',
          target_provider_id: providerId,
        },
      ],
      rowCount: 2,
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
  expect(response.body.data).toEqual([
    expect.objectContaining({
      userId: actorId,
      userRole: 'super_admin',
      entityId: customerId,
      targetUserRole: 'customer',
      targetProviderId: null,
    }),
    expect.objectContaining({
      userId: actorId,
      userRole: 'super_admin',
      entityId: providerUserId,
      targetUserRole: 'provider',
      targetProviderId: providerId,
    }),
  ]);
  const dataSql = dbQueryMock.mock.calls[1]?.[0] as string;
  expect(dataSql).toContain('LEFT JOIN users target_user');
  expect(dataSql).toContain('target_user.id = combined.entity_id');
  expect(dataSql).toContain('LEFT JOIN providers target_provider');
});
