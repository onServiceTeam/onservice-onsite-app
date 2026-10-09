import express from 'express';
import request from 'supertest';

const requestPayoutMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'provider-user-ops-299', role: 'provider', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/services/payout.service', () => ({
  requestPayout: (...args: unknown[]) => requestPayoutMock(...args),
  formatPayout: jest.fn(() => ({ id: 'payout-ops-299', status: 'pending' })),
}));
jest.mock('../src/services/wallet.service', () => ({}));
jest.mock('../src/services/payment.service', () => ({}));
jest.mock('../src/services/external-payment-hold.service', () => ({
  assertExternalPaymentAuthorizationEnabled: jest.fn(),
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import walletRouter from '../src/routes/wallet.routes';

it('Bug OPS-299 - wallet withdrawal preserves account name and provider notes through validation', async () => {
  requestPayoutMock.mockResolvedValueOnce({ id: 'payout-ops-299' });
  const app = express();
  app.use(express.json());
  app.use('/wallet', walletRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app)
    .post('/wallet/withdraw')
    .send({
      amount: 25000,
      method: 'bank_instapay',
      destinationAccount: '123456789012',
      accountName: 'Roberto Santos',
      notes: 'Primary business settlement account',
    });

  expect(response.status).toBe(201);
  expect(requestPayoutMock).toHaveBeenCalledWith('provider-user-ops-299', {
    amount: 25000,
    method: 'bank_instapay',
    destinationAccount: '123456789012',
    accountName: 'Roberto Santos',
    notes: 'Primary business settlement account',
  });
});
