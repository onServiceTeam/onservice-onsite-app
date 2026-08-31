import express from 'express';
import request from 'supertest';

const getAdminActionsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    const role = req.header('x-test-role') ?? 'super_admin';
    (req as express.Request & { user: unknown }).user = {
      userId: `${role}-med-n02`, role, iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/services/admin.service', () => ({
  getAdminActions: (...args: unknown[]) => getAdminActionsMock(...args),
  formatAdminAction: (value: unknown) => value,
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('MED-N02 - admin action filters reject malformed values before the audit service', async () => {
  getAdminActionsMock.mockResolvedValue({ actions: [{ id: 'action-med-n02' }], total: 1 });
  const app = express();
  app.use('/admin', adminRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const badAdminId = await request(app).get('/admin/actions?adminId=not-a-uuid');
  const badActionType = await request(app).get('/admin/actions?actionType=Provider-Approved');
  const ordinaryAdmin = await request(app)
    .get('/admin/actions')
    .set('x-test-role', 'admin');

  expect(badAdminId.status).toBe(400);
  expect(badAdminId.body.error).toBe('adminId must be a valid UUID.');
  expect(badActionType.status).toBe(400);
  expect(badActionType.body.error).toMatch(/lowercase letters, digits, or underscores/i);
  expect(ordinaryAdmin.status).toBe(403);
  expect(getAdminActionsMock).not.toHaveBeenCalled();

  const adminId = '11111111-1111-4111-9111-1111111111AA';
  const filtered = await request(app).get(
    `/admin/actions?adminId=${adminId}&actionType=provider_approved&page=2&pageSize=50`,
  );
  const unfiltered = await request(app).get('/admin/actions');

  expect(filtered.status).toBe(200);
  expect(filtered.body.data).toEqual([{ id: 'action-med-n02' }]);
  expect(getAdminActionsMock).toHaveBeenNthCalledWith(1, {
    adminId,
    actionType: 'provider_approved',
    page: 2,
    pageSize: 50,
  }, 'super_admin');
  expect(unfiltered.status).toBe(200);
  expect(getAdminActionsMock).toHaveBeenNthCalledWith(2, {
    adminId: undefined,
    actionType: undefined,
    page: 1,
    pageSize: 20,
  }, 'super_admin');
});
