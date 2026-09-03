import express from 'express';
import request from 'supertest';

let mockRole: 'admin' | 'super_admin' = 'admin';
const changeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const getByIdMock = jest.fn().mockResolvedValue({
  id: changeId, providerId: 'provider-user-1', providerRecordId: 'provider-record-1',
  providerName: 'Ramil Santos', providerEmail: 'ramil@example.com', providerPhone: '+639181234567',
  currentAreaName: 'Metro Cebu', requestedAreaName: 'Davao Metro', status: 'approved',
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: mockRole,
    };
    next();
  },
}));
jest.mock('../src/services/service-area-change.service', () => ({
  getById: (...args: unknown[]) => getByIdMock(...args),
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

function buildApp(): express.Express {
  const app = express();
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);
  return app;
}

it('Bug SEC-046 - exact area-change evidence masks provider contact for support admins but not super-admins', async () => {
  const app = buildApp();
  mockRole = 'admin';
  const adminResponse = await request(app).get(`/admin/service-area-changes/${changeId}`);
  mockRole = 'super_admin';
  const superResponse = await request(app).get(`/admin/service-area-changes/${changeId}`);

  expect(adminResponse.status).toBe(200);
  expect(adminResponse.body.data).toMatchObject({
    id: changeId, providerEmail: 'r•••@example.com', providerPhone: '+63 9XX XXX 4567', contactMasked: true,
  });
  expect(superResponse.status).toBe(200);
  expect(superResponse.body.data).toMatchObject({
    id: changeId, providerEmail: 'ramil@example.com', providerPhone: '+639181234567', contactMasked: false,
  });
});
