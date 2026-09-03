import express from 'express';
import request from 'supertest';

const exactDsr = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: { userId: string; role: string } }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'dpo',
    };
    next();
  },
}));
jest.mock('../src/middleware/require-dpo.middleware', () => ({
  requireDpoRole: (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/compliance.service', () => ({
  getDsr: (...args: unknown[]) => exactDsr(...args),
}));
jest.mock('../src/services/compliance-admin.service', () => ({}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug OPS-408 - an uppercase DSR route UUID reaches the service in canonical form', async () => {
  const dsrId = '12080000-abcd-4abc-8def-000000001208';
  exactDsr.mockResolvedValue({ id: dsrId, status: 'in_progress' });
  const app = express();
  app.use('/api/v1/admin/compliance', complianceAdminRouter);

  const response = await request(app)
    .get(`/api/v1/admin/compliance/dsr/${dsrId.toUpperCase()}`);

  expect(response.status).toBe(200);
  expect(exactDsr).toHaveBeenCalledWith(dsrId);
  expect(response.body.data).toMatchObject({ id: dsrId, status: 'in_progress' });
});
