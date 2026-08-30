import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const listPayoutsMock = jest.fn();
jest.mock('../src/services/payout.service', () => ({
  listPayouts: (...args: unknown[]) => listPayoutsMock(...args),
  formatPayout: (value: unknown) => value,
}));

import payoutRouter from '../src/routes/payout.routes';

it('Bug UX-521 — payout list validates and applies an exact payout identifier', async () => {
  listPayoutsMock.mockResolvedValue({ payouts: [], total: 0 });
  const app = express();
  app.use('/payouts', payoutRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  const payoutId = '66666666-6666-4666-8666-666666666666';

  const valid = await request(app).get('/payouts').query({ payoutId });
  const invalid = await request(app).get('/payouts').query({ payoutId: 'not-a-uuid' });

  expect(valid.status).toBe(200);
  expect(listPayoutsMock).toHaveBeenCalledWith({
    payoutId,
    providerId: undefined,
    status: undefined,
    page: 1,
    pageSize: 20,
  });
  expect(invalid.status).toBe(400);
  expect(listPayoutsMock).toHaveBeenCalledTimes(1);
});
