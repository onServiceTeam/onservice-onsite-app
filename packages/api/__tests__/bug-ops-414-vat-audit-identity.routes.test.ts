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
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin', iat: 0, exp: 0,
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

it('Bug OPS-414 - audit timeline resolves VAT year and month identity from the retained report', async () => {
  const reportId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockImplementationOnce(async (sql: string) => {
      const readsReportIdentity = sql.includes("combined.entity_type = 'vat_report'")
        && sql.includes('FROM vat_monthly_reports report');
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions',
          user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', action: 'vat_report_finalized',
          entity_type: 'vat_report', entity_id: reportId, old_values: null, new_values: {},
          ip_address: null, user_agent: null, reason: 'VAT report finalized',
          created_at: new Date('2026-09-03T09:00:00.000Z'), user_email: 'operator@example.com',
          user_role: 'super_admin', target_user_role: null, target_provider_id: null,
          target_booking_id: null, target_tax_year: readsReportIdentity ? 2026 : null,
          target_tax_quarter: null, target_tax_month: readsReportIdentity ? 8 : null,
        }],
        rowCount: 1,
      };
    });

  const app = express();
  app.use('/admin', adminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request,
    res: express.Response, _next: express.NextFunction) => (
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' })
  ));

  const response = await request(app).get('/admin/audit-log');

  expect(response.status).toBe(200);
  expect(response.body.data[0]).toEqual(expect.objectContaining({
    entityType: 'vat_report', entityId: reportId, targetTaxYear: 2026,
    targetTaxQuarter: null, targetTaxMonth: 8,
  }));
});
