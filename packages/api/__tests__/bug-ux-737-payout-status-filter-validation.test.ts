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
}));

import payoutRouter from '../src/routes/payout.routes';

it('Bug UX-737 — unrecognized payout status filters fail before service or database work', async () => {
  const app = express();
  app.use('/payouts', payoutRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app).get('/payouts?status=sent-to-bank');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/recognized payout status/i);
  expect(listMock).not.toHaveBeenCalled();
});
