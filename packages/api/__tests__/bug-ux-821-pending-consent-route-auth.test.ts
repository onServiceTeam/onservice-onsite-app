import express from 'express';
import request from 'supertest';

const authMock = jest.fn((req: express.Request, _res: express.Response, next: express.NextFunction): void => {
  (req as express.Request & { user: { userId: string; role: string } }).user = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'customer',
  };
  next();
});
const pendingMock = jest.fn().mockResolvedValue([{ consentType: 'privacy_policy' }]);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (...args: Parameters<typeof authMock>) => authMock(...args),
}));
jest.mock('../src/services/compliance.service', () => ({
  getPendingMaterialConsents: (...args: unknown[]) => pendingMock(...args),
}));

import complianceRouter from '../src/routes/compliance.routes';

it('Bug UX-821 — the pending-consent endpoint executes authentication and scopes the service call to that user', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/compliance', complianceRouter);

  const response = await request(app).get('/api/v1/compliance/my-pending-consents');

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual([{ consentType: 'privacy_policy' }]);
  expect(authMock).toHaveBeenCalledTimes(1);
  expect(pendingMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
});
