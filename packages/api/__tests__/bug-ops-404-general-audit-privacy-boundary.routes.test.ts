import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const mockAuthState = { role: 'admin' };

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: mockAuthState.role,
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

function auditRow(id: string, action: string, entityType: string) {
  return {
    id,
    source: action.includes('.') ? 'audit_log' : 'admin_actions',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    action,
    entity_type: entityType,
    entity_id: id,
    old_values: null,
    new_values: { reference: id },
    ip_address: null,
    user_agent: null,
    reason: null,
    created_at: new Date('2026-09-03T08:00:00.000Z'),
    user_email: 'operator@example.com',
    user_role: mockAuthState.role,
    target_user_role: null,
    target_provider_id: null,
  };
}

it('Bug OPS-404 — ordinary admins cannot recover DPO-owned records through the general audit timeline', async () => {
  const operational = auditRow('booking-visible', 'booking_reassigned', 'booking');
  const privacyRows = [
    auditRow('privacy-dsr-event', 'dsr.created', 'data_subject_request'),
    auditRow('privacy-dsr-action', 'dsr_marked_complete', 'dsr_request'),
    auditRow('privacy-consent-version', 'consent_version_published', 'consent_version'),
    auditRow('privacy-breach', 'breach_status_changed', 'breach'),
    auditRow('privacy-consent-search', 'consent_search', 'user'),
  ];
  const allRows = [operational, ...privacyRows];

  dbQueryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    const hasPrivacyBoundary = sql.includes("combined.entity_type IN ('dsr_request', 'data_subject_request'");
    const visibleRows = hasPrivacyBoundary ? [operational] : allRows;
    if (sql.includes('COUNT(*)::text AS count')) {
      return { rows: [{ count: String(visibleRows.length) }], rowCount: 1 };
    }
    return { rows: visibleRows, rowCount: visibleRows.length };
  });

  const app = express();
  app.use('/admin', adminRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  mockAuthState.role = 'admin';
  const adminResponse = await request(app).get('/admin/audit-log');
  expect(adminResponse.status).toBe(200);
  expect(adminResponse.body.pagination.total).toBe(1);
  expect(adminResponse.body.data.map((entry: { id: string }) => entry.id)).toEqual(['booking-visible']);

  mockAuthState.role = 'super_admin';
  const superAdminResponse = await request(app).get('/admin/audit-log');
  expect(superAdminResponse.status).toBe(200);
  expect(superAdminResponse.body.pagination.total).toBe(6);
  expect(superAdminResponse.body.data.map((entry: { id: string }) => entry.id)).toEqual(
    allRows.map((entry) => entry.id),
  );
});
