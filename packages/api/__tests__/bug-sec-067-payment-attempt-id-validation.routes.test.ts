import express from 'express';
import request from 'supertest';

const getPaymentOperationsSummaryMock = jest.fn();

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

it('Bug SEC-067 - a malformed exact payment-attempt ID is rejected before service access', async () => {
  const app = express();
  app.use('/financials', financialAdminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get('/financials/payments?paymentAttemptId=not-a-uuid');

  expect(response.status).toBe(400);
  expect(response.body.error.message).toContain('paymentAttemptId must be a valid UUID');
  expect(getPaymentOperationsSummaryMock).not.toHaveBeenCalled();
});
