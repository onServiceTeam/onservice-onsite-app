import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const listMock = jest.fn();
jest.mock('../src/services/payout.service', () => ({
  listPayouts: (...args: unknown[]) => listMock(...args),
  formatPayout: (payout: unknown) => payout,
}));

import payoutRouter from '../src/routes/payout.routes';

it('Bug UX-724 — payout management forwards a provider name search instead of requiring an opaque UUID', async () => {
  listMock.mockResolvedValue({ payouts: [], total: 0 });
  const app = express();
  app.use('/payouts', payoutRouter);

  const response = await request(app).get('/payouts?search=Cebu%20Home&page=2&pageSize=20');

  expect(response.status).toBe(200);
  expect(listMock).toHaveBeenCalledWith({
    payoutId: undefined,
    providerId: undefined,
    search: 'Cebu Home',
    status: undefined,
    page: 2,
    pageSize: 20,
  });
});
