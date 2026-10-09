import express from 'express';
import request from 'supertest';

const getPaymentOperationsSummaryMock = jest.fn().mockResolvedValue({});

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/financial-admin.service', () => ({
  getPaymentOperationsSummary: (...args: unknown[]) => getPaymentOperationsSummaryMock(...args),
}));
jest.mock('../src/services/or.service', () => ({}));

import financialAdminRouter from '../src/routes/financial-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-436 - the payment operations route carries a canonical payment-attempt ID into the read service', async () => {
  const paymentAttemptId = '43600000-0000-4000-8000-000000000436';
  const app = express();
  app.use('/financials', financialAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get(`/financials/payments?retryLimit=25&retryOffset=0&paymentAttemptId=${paymentAttemptId}`);

  expect(response.status).toBe(200);
  expect(getPaymentOperationsSummaryMock).toHaveBeenCalledWith({
    retryLimit: 25,
    retryOffset: 0,
    paymentAttemptId,
    intentSearch: undefined,
    retrySearch: undefined,
  });
});
