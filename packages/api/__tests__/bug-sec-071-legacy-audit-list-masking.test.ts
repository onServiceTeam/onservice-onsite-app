import express from 'express';
import request from 'supertest';

const queryMock = jest.fn();
const transactionMock = jest.fn();
let actorRole = 'super_admin';

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: actorRole };
    next();
  },
}));

import adminRouter from '../src/routes/admin.routes';
import { getAdminActions } from '../src/services/admin.service';

it('Bug SEC-071 — the legacy actions URL cannot bypass universal audit masking or return extra historical columns', async () => {
  const original = {
    id: '11111111-1111-4111-8111-111111111111',
    admin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    action_type: 'provider_approved', target_type: 'provider',
    target_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    details: {
      action: 'approved', amount: 12500,
      email: 'maria@example.invalid', phone: '+639171234567',
      evidence: [{ ip_address: '192.0.2.45', user_agent: 'Chrome/123 private-details',
        note: 'Contact maria@example.invalid at +639171234567' }],
    },
    reason: 'Reviewed with maria@example.invalid at +639171234567',
    full_notes: 'Private unprojected full notes',
    future_private_column: 'A future database column must never be returned',
    created_at: new Date('2026-09-05T00:00:00Z'),
  };
  const originalBytes = JSON.stringify(original);
  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT COUNT/.test(sql)) return { rows: [{ count: '1' }] };
    // Deliberately supply additional historical fields even though the new
    // SELECT is explicit, to exercise the service projection independently.
    return { rows: [original] };
  });
  const app = express();
  app.use('/admin', adminRouter);
  app.use((error: { statusCode?: number; message?: string },
    _req: express.Request, res: express.Response, _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message }));

  const response = await request(app).get('/admin/actions');
  expect(response.status).toBe(200);
  expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  expect(response.body.data).toEqual([{
    id: original.id, adminId: original.admin_id, actionType: original.action_type,
    targetType: original.target_type, targetId: original.target_id,
    details: {
      action: 'approved', amount: 12500,
      email: 'm•••@example.invalid', phone: '+63 9XX XXX 4567',
      evidence: [{ ip_address: '192.0.2.***', user_agent: 'Chrome',
        note: 'Contact m•••@example.invalid at +63 9XX XXX 4567' }],
    },
    reason: 'Reviewed with m•••@example.invalid at +63 9XX XXX 4567',
    createdAt: '2026-09-05T00:00:00.000Z',
  }]);
  expect(JSON.stringify(response.body)).not.toContain(original.full_notes);
  expect(JSON.stringify(response.body)).not.toContain(original.future_private_column);

  for (const viewerRole of ['super_admin', 'admin', 'dpo', 'customer', 'unknown', undefined]) {
    const result = await getAdminActions({ page: 1, pageSize: 20 }, viewerRole);
    expect(result.actions[0]?.details).toEqual(response.body.data[0].details);
    expect(result.actions[0]?.reason).toBe(response.body.data[0].reason);
    expect(result.actions[0]).not.toHaveProperty('full_notes');
    expect(result.actions[0]).not.toHaveProperty('future_private_column');
  }
  expect(JSON.stringify(original)).toBe(originalBytes);
  queryMock.mockResolvedValueOnce({ rows: [{ count: '1' }] });
  queryMock.mockResolvedValueOnce({ rows: [{ ...original, reason: null, details: null }] });
  const nullValues = await getAdminActions({ page: 1, pageSize: 20 });
  expect(nullValues.actions[0]?.reason).toBeNull();
  expect(nullValues.actions[0]?.details).toBeNull();
  // The service never mutates or rewrites the retained audit row or logs a
  // fictitious reveal event. The original fixture is never restored by us.
  expect(JSON.stringify(original)).toBe(originalBytes);
  const reads = queryMock.mock.calls.length;
  for (actorRole of ['admin', 'dpo', 'customer', 'provider', 'provider_staff']) {
    expect((await request(app).get('/admin/actions')).status).toBe(403);
  }
  expect(queryMock).toHaveBeenCalledTimes(reads);
  expect(transactionMock).not.toHaveBeenCalled();
  for (const [sql] of queryMock.mock.calls) expect(String(sql).trim()).toMatch(/^SELECT /);
});
