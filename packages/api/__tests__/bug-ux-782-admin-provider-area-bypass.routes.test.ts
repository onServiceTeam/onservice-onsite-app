import express from 'express';
import request from 'supertest';

const assignMock = jest.fn();
const removeMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => ({
  assignProviderToArea: (...args: unknown[]) => assignMock(...args),
  removeProviderFromArea: (...args: unknown[]) => removeMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-782 — legacy admin provider-area writes fail closed and cannot bypass the reviewed change queue', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);
  const areaId = '11111111-1111-4111-8111-111111111111';
  const providerId = '22222222-2222-4222-8222-222222222222';

  const assign = await request(app).post(`/admin/service-areas/${areaId}/providers`).send({ providerId, isPrimary: true });
  const remove = await request(app).delete(`/admin/service-areas/${areaId}/providers/${providerId}`);

  expect(assign.status).toBe(409);
  expect(remove.status).toBe(409);
  expect(assign.body.error.message).toMatch(/review.*change request/i);
  expect(remove.body.error.message).toMatch(/review.*change request/i);
  expect(assignMock).not.toHaveBeenCalled();
  expect(removeMock).not.toHaveBeenCalled();
});
