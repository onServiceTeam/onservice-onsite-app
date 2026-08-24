import express from 'express';
import request from 'supertest';

const completePayoutMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'super-admin-1', role: 'super_admin', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/services/payout.service', () => ({
  completePayout: (...args: unknown[]) => completePayoutMock(...args),
  formatPayout: (payout: unknown) => payout,
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import payoutRouter from '../src/routes/payout.routes';

it('Bug PHASE188-01 — complete-payout rejects an oversized transfer id before calling the money service', async () => {
  const app = express();
  app.use(express.json());
  app.use('/payouts', payoutRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  const rejected = await request(app)
    .put('/payouts/payout-1/complete')
    .send({ paymongoTransferId: 'x'.repeat(101), reason: 'External transfer receipt was verified.' });
  expect(rejected.status).toBe(400);
  expect(completePayoutMock).not.toHaveBeenCalled();

  completePayoutMock.mockResolvedValueOnce({ id: 'payout-1', status: 'completed' });
  const accepted = await request(app)
    .put('/payouts/payout-1/complete')
    .send({ paymongoTransferId: ' transfer-123 ', reason: 'External transfer receipt was verified.' });
  expect(accepted.status).toBe(200);
  expect(completePayoutMock).toHaveBeenCalledWith(
    'payout-1', 'super-admin-1', 'External transfer receipt was verified.', 'transfer-123',
  );
});
