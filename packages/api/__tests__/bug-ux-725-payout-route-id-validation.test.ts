import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'super_admin' };
    next();
  },
}));

const getPayoutMock = jest.fn();
jest.mock('../src/services/payout.service', () => ({
  getPayoutById: (...args: unknown[]) => getPayoutMock(...args),
}));

import payoutRouter from '../src/routes/payout.routes';

it('Bug UX-725 — malformed payout action identifiers fail before payout service or database work', async () => {
  const app = express();
  app.use(express.json());
  app.use('/payouts', payoutRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app).get('/payouts/not-a-payout-id');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/valid UUID/i);
  expect(getPayoutMock).not.toHaveBeenCalled();
});
