import express from 'express';
import request from 'supertest';

const generateBackupCodesMock = jest.fn();
let authenticatedRole: 'super_admin' | 'customer' = 'super_admin';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request & { user?: unknown },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.user = {
      userId: '10000000-0000-4000-8000-000000000044',
      role: authenticatedRole,
      sessionVersion: 1,
    };
    next();
  },
}));
jest.mock('../src/services/admin-2fa.service', () => ({
  generateBackupCodes: (...args: unknown[]) => generateBackupCodesMock(...args),
}));
jest.mock('../src/services/provider-onboarding.service', () => ({}));
jest.mock('../src/services/service-area-change.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-044 — recovery-code regeneration fails closed without rotating or disclosing a code set', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);

  authenticatedRole = 'customer';
  const forbidden = await request(app)
    .post('/admin/2fa/backup-codes/regenerate')
    .send({ adminUserId: '20000000-0000-4000-8000-000000000044' });
  expect(forbidden.status).toBe(403);

  authenticatedRole = 'super_admin';
  const held = await request(app)
    .post('/admin/2fa/backup-codes/regenerate')
    .send({ adminUserId: '20000000-0000-4000-8000-000000000044' });
  expect(held.status).toBe(409);
  expect(held.body.error.code).toBe('privileged_recovery_policy_required');
  expect(generateBackupCodesMock).not.toHaveBeenCalled();
});
