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

const listDisputesMock = jest.fn();
jest.mock('../src/services/dispute.service', () => ({
  listDisputes: (...args: unknown[]) => listDisputesMock(...args),
  formatDispute: (value: unknown) => value,
}));

import disputeRouter from '../src/routes/dispute.routes';

it('Bug UX-510 — dispute list route validates and forwards active/stale operational views', async () => {
  listDisputesMock.mockResolvedValue({ disputes: [], total: 0 });
  const app = express();
  app.use(express.json());
  app.use('/disputes', disputeRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  expect((await request(app).get('/disputes?view=active')).status).toBe(200);
  expect((await request(app).get('/disputes?view=stale')).status).toBe(200);
  const invalid = await request(app).get('/disputes?view=anything');

  expect(listDisputesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ view: 'active' }));
  expect(listDisputesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ view: 'stale' }));
  expect(invalid.status).toBe(400);
  expect(listDisputesMock).toHaveBeenCalledTimes(2);
});
