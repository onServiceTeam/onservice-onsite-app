import express from 'express';
import request from 'supertest';

const requestPayoutMock = jest.fn();
const formatPayoutMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'provider-user-med-n166',
      role: req.header('x-test-role') ?? 'provider',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));

jest.mock('../src/services/payout.service', () => ({
  requestPayout: (...args: unknown[]) => requestPayoutMock(...args),
  formatPayout: (...args: unknown[]) => formatPayoutMock(...args),
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

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/wallet', walletRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));
  return app;
}

it('MED-N166 - provider wallet withdrawal delegates only to the canonical payout workflow', async () => {
  const payout = { id: 'payout-med-n166' };
  const formatted = { id: 'payout-med-n166', amount: 12500, status: 'pending' };
  requestPayoutMock.mockResolvedValueOnce(payout);
  formatPayoutMock.mockReturnValueOnce(formatted);
  const app = createApp();

  const accepted = await request(app)
    .post('/wallet/withdraw')
    .send({ amount: 12500, method: 'gcash', destinationAccount: '09171234567' });

  expect(accepted.status).toBe(201);
  expect(accepted.body).toEqual({ success: true, data: formatted });
  expect(requestPayoutMock).toHaveBeenCalledWith('provider-user-med-n166', {
    amount: 12500,
    method: 'gcash',
    destinationAccount: '09171234567',
    accountName: undefined,
    notes: undefined,
  });
  expect(formatPayoutMock).toHaveBeenCalledWith(payout);

  const customerAttempt = await request(app)
    .post('/wallet/withdraw')
    .set('x-test-role', 'customer')
    .send({ amount: 12500, method: 'gcash', destinationAccount: '09171234567' });

  expect(customerAttempt.status).toBe(403);
  expect(customerAttempt.body).toEqual({ error: 'Only providers can withdraw funds.' });
  expect(requestPayoutMock).toHaveBeenCalledTimes(1);

  requestPayoutMock.mockRejectedValueOnce(Object.assign(
    new Error('Withdrawal requires internal large-payout review.'),
    { statusCode: 409 },
  ));
  const held = await request(app)
    .post('/wallet/withdraw')
    .send({ amount: 50000000, method: 'maya', destinationAccount: '09181234567' });

  expect(held.status).toBe(409);
  expect(held.body).toEqual({ error: 'Withdrawal requires internal large-payout review.' });
  expect(formatPayoutMock).toHaveBeenCalledTimes(1);
});
