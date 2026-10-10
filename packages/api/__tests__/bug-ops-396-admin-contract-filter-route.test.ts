import express from 'express';
import request from 'supertest';

const getContractsAdminMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '00000000-0000-4000-8000-000000000001', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/business.service', () => ({
  getContractsAdmin: (...args: unknown[]) => getContractsAdminMock(...args),
  formatContract: (contract: unknown) => contract,
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-396 - the Admin contract-list route validates and forwards an exact contract handoff', async () => {
  getContractsAdminMock.mockResolvedValueOnce({
    items: [{ id: '22222222-2222-4222-8222-222222222222' }],
    total: 1,
  });
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(
    '/admin/business-accounts/11111111-1111-4111-8111-111111111111/contracts?contractId=22222222-2222-4222-8222-222222222222',
  );

  expect(response.status).toBe(200);
  expect(getContractsAdminMock).toHaveBeenCalledWith(
    '11111111-1111-4111-8111-111111111111',
    1,
    20,
    '22222222-2222-4222-8222-222222222222',
  );
  expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
});
