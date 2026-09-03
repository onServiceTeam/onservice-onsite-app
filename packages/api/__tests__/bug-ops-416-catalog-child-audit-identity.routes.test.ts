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

it('Bug OPS-416 - audit timeline resolves category and service ownership for retained catalog child records', async () => {
  const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const subcategoryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const addonId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
    .mockImplementationOnce(async (sql: string) => {
      const readsCatalogOwnership = sql.includes("combined.entity_type = 'service_category'")
        && sql.includes("combined.entity_type = 'service_subcategory'")
        && sql.includes("combined.entity_type = 'service_addon'")
        && sql.includes('FROM service_addons addon')
        && sql.includes('JOIN service_subcategories subcategory');
      const common = {
        source: 'admin_actions', user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        old_values: null, new_values: {}, ip_address: null, user_agent: null,
        created_at: new Date('2026-09-03T10:00:00.000Z'), user_email: 'operator@example.com',
        user_role: 'super_admin', target_user_role: null, target_provider_id: null,
        target_booking_id: null, target_tax_year: null, target_tax_quarter: null,
        target_tax_month: null,
      };
      return {
        rows: [
          {
            ...common, id: '11111111-1111-4111-8111-111111111111',
            action: 'service_subcategory_updated', entity_type: 'service_subcategory',
            entity_id: subcategoryId, reason: 'scope changed',
            target_category_id: readsCatalogOwnership ? categoryId : null,
            target_subcategory_id: readsCatalogOwnership ? subcategoryId : null,
          },
          {
            ...common, id: '22222222-2222-4222-8222-222222222222',
            action: 'service_addon_deleted', entity_type: 'service_addon',
            entity_id: addonId, reason: 'retired option',
            target_category_id: readsCatalogOwnership ? categoryId : null,
            target_subcategory_id: readsCatalogOwnership ? subcategoryId : null,
          },
        ],
        rowCount: 2,
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
  expect(response.body.data).toEqual([
    expect.objectContaining({
      entityType: 'service_subcategory', entityId: subcategoryId,
      targetCategoryId: categoryId, targetSubcategoryId: subcategoryId,
    }),
    expect.objectContaining({
      entityType: 'service_addon', entityId: addonId,
      targetCategoryId: categoryId, targetSubcategoryId: subcategoryId,
    }),
  ]);
});
