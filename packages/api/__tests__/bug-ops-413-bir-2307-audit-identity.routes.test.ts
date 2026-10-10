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

it('Bug OPS-413 - audit timeline resolves 2307 provider and period identity from the retained batch', async () => {
  const batchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const providerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockImplementationOnce(async (sql: string) => {
      const readsBatchIdentity = sql.includes("combined.entity_type = 'bir_2307_batch'")
        && sql.includes('FROM bir_2307_batches batch');
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions',
          user_id: null, action: 'bir_2307_batch_generated', entity_type: 'bir_2307_batch',
          entity_id: batchId, old_values: null, new_values: {}, ip_address: null,
          user_agent: null, reason: 'quarterly generation',
          created_at: new Date('2026-09-03T09:00:00.000Z'), user_email: null,
          user_role: null, target_user_role: null, target_booking_id: null,
          target_provider_id: readsBatchIdentity ? providerId : null,
          target_tax_year: readsBatchIdentity ? 2026 : null,
          target_tax_quarter: readsBatchIdentity ? 3 : null,
          target_tax_month: null,
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
    entityType: 'bir_2307_batch', entityId: batchId, targetProviderId: providerId,
    targetTaxYear: 2026, targetTaxQuarter: 3, targetTaxMonth: null,
  }));
});
