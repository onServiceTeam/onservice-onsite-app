import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'provider',
    };
    next();
  },
}));

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

const validateDestinationAccountMock = jest.fn();
jest.mock('../src/services/payout.service', () => ({
  validateDestinationAccount: (...args: unknown[]) => validateDestinationAccountMock(...args),
  requestPayout: jest.fn(),
  formatPayout: jest.fn(),
}));

import walletRouter from '../src/routes/wallet.routes';

it('Bug UX-072 — saving withdrawal details invokes canonical destination validation', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      payout_frequency: 'manual',
      payout_min_threshold: 50_000,
      payout_preferred_method: 'bank_instapay',
      payout_destination_account: '12345678',
    }],
    rowCount: 1,
  });
  const app = express();
  app.use(express.json());
  app.use('/wallet', walletRouter);

  const response = await request(app).put('/wallet/payout-preferences').send({
    preferredMethod: 'bank_instapay',
    destinationAccount: '12345678',
  });

  expect(response.status).toBe(200);
  expect(validateDestinationAccountMock).toHaveBeenCalledWith('bank_instapay', '12345678');
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
