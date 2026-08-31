import express from 'express';
import request from 'supertest';

let currentRole: 'admin' | 'super_admin' = 'admin';
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: currentRole };
    next();
  },
}));

const formatMock = jest.fn((payout: unknown) => payout);
jest.mock('../src/services/payout.service', () => ({
  listPayouts: jest.fn().mockResolvedValue({ payouts: [{ id: 'payout-1' }], total: 1 }),
  formatPayout: (...args: unknown[]) => formatMock(...args),
}));

import payoutRouter from '../src/routes/payout.routes';

it('Bug UX-734 — payout list route requests masked destination data for ordinary admins only', async () => {
  const app = express();
  app.use('/payouts', payoutRouter);

  currentRole = 'admin';
  expect((await request(app).get('/payouts')).status).toBe(200);
  expect(formatMock).toHaveBeenLastCalledWith({ id: 'payout-1' }, { maskSensitive: true });

  currentRole = 'super_admin';
  expect((await request(app).get('/payouts')).status).toBe(200);
  expect(formatMock).toHaveBeenLastCalledWith({ id: 'payout-1' }, { maskSensitive: false });
});
