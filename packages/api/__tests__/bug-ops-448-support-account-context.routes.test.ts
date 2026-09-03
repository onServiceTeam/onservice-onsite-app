import express from 'express';
import request from 'supertest';

const getSupportAccountContext = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-448', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  getSupportAccountContext: (...args: unknown[]) => getSupportAccountContext(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-448 - Support owner context canonicalizes the account ID and uses the acting Admin role', async () => {
  const userId = '44800000-abcd-4abc-8def-000000000448';
  getSupportAccountContext.mockResolvedValue({
    id: userId,
    role: 'customer',
    displayName: 'Maria S.',
    isActive: true,
    providerProfileId: null,
    providerBusinessName: null,
  });
  const app = express();
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app).get(
    `/support-tickets/account-context/${userId.toUpperCase()}`,
  );

  expect(response.status).toBe(200);
  expect(getSupportAccountContext).toHaveBeenCalledWith(userId, 'admin');
  expect(response.body.data).toEqual(expect.objectContaining({
    id: userId,
    displayName: 'Maria S.',
  }));
  expect(response.body.data).not.toHaveProperty('phone');
  expect(response.body.data).not.toHaveProperty('email');
});
