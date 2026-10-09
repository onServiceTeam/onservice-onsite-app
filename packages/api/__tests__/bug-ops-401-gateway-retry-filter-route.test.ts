import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));

const getPaymentOperationsSummaryMock = jest.fn().mockResolvedValue({});
jest.mock('../src/services/financial-admin.service', () => ({
  getPaymentOperationsSummary: (...args: unknown[]) => getPaymentOperationsSummaryMock(...args),
}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';

it('Bug OPS-401 - payment operations route preserves an exact gateway retry handoff', async () => {
  const app = express();
  app.use('/financials', financialAdminRouter);

  const response = await request(app).get(
    '/financials/payments?retryLimit=25&retryOffset=0&retrySearch=40100000-0000-4000-8000-000000000401',
  );

  expect(response.status).toBe(200);
  expect(getPaymentOperationsSummaryMock).toHaveBeenCalledWith({
    retryLimit: 25,
    retryOffset: 0,
    intentSearch: undefined,
    retrySearch: '40100000-0000-4000-8000-000000000401',
  });
});
