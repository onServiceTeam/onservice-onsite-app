import express from 'express';
import request from 'supertest';

const listDsrs = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: '00000000-0000-0000-0000-000000000001', role: 'dpo' };
    next();
  },
}));
jest.mock('../src/services/compliance.service', () => ({ listDsrs: (...args: unknown[]) => listDsrs(...args) }));
jest.mock('../src/services/compliance-admin.service', () => ({}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug UX-801 — DSR request type and page bounds are applied by the server before rows are limited', async () => {
  listDsrs.mockResolvedValue({ rows: [], total: 73 });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/compliance', complianceAdminRouter);
  app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(error.statusCode ?? 500).json({ success: false, error: { message: error.message } });
  });

  const response = await request(app).get(
    '/api/v1/admin/compliance/dsr?status=in_progress&requestType=erasure&overdueOnly=false&limit=25&offset=50',
  );

  expect(response.status).toBe(200);
  expect(listDsrs).toHaveBeenCalledWith({
    status: 'in_progress',
    requestType: 'erasure',
    overdueOnly: false,
    limit: 25,
    offset: 50,
  });
  expect(response.body.data.total).toBe(73);
});
