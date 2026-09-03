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

it('Bug OPS-424 - an exact audit entry filter resolves one canonical source row', async () => {
  const entryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: entryId,
      source: 'audit_log',
      user_id: null,
      action: 'booking.status_changed',
      entity_type: 'booking',
      entity_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      old_values: { status: 'accepted' },
      new_values: { status: 'in_progress' },
      ip_address: '203.0.113.8',
      user_agent: 'Test Agent',
      reason: null,
      created_at: new Date('2026-09-03T08:00:00.000Z'),
      user_email: null,
      user_role: null,
      target_user_role: null,
      target_provider_id: null,
    }], rowCount: 1 });

  const app = express();
  app.use('/admin', adminRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app)
    .get(`/admin/audit-log?entryId=${entryId}&source=audit_log`);

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual([
    expect.objectContaining({ id: entryId, source: 'audit_log' }),
  ]);
  for (const call of dbQueryMock.mock.calls) {
    expect(String(call[0])).toContain('combined.id = $1');
    expect(String(call[0])).toContain('combined.source = $2');
    expect(call[1]).toEqual(expect.arrayContaining([entryId, 'audit_log']));
  }
});
