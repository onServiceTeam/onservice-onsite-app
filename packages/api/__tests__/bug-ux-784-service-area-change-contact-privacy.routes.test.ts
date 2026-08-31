import express from 'express';
import request from 'supertest';

let mockRole: 'admin' | 'super_admin' = 'admin';
const listPendingMock = jest.fn().mockResolvedValue([{
  id: 'change-1', providerId: 'provider-user-1', providerRecordId: 'provider-record-1',
  providerName: 'Ramil Santos', providerEmail: 'ramil@example.com', providerPhone: '+639181234567',
  currentAreaName: 'Metro Cebu', requestedAreaName: 'Davao Metro',
}]);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: mockRole,
    };
    next();
  },
}));
jest.mock('../src/services/service-area-change.service', () => ({
  listPending: (...args: unknown[]) => listPendingMock(...args),
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

function buildApp(): express.Express {
  const app = express();
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);
  return app;
}

it('Bug UX-784 — provider change-queue contacts are masked for support admins and remain available to super admins', async () => {
  const app = buildApp();
  mockRole = 'admin';
  const adminResponse = await request(app).get('/admin/service-area-changes');
  mockRole = 'super_admin';
  const superResponse = await request(app).get('/admin/service-area-changes');

  expect(adminResponse.status).toBe(200);
  expect(adminResponse.body.data[0]).toMatchObject({
    providerEmail: 'r•••@example.com', providerPhone: '+63 9XX XXX 4567', contactMasked: true,
  });
  expect(superResponse.body.data[0]).toMatchObject({
    providerEmail: 'ramil@example.com', providerPhone: '+639181234567', contactMasked: false,
  });
});
