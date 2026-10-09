import express from 'express';
import request from 'supertest';

const getCommissionRateByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/commission-control.service', () => ({
  getCommissionRateById: (...args: unknown[]) => getCommissionRateByIdMock(...args),
}));

import financialRouter from '../src/routes/financial-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-056 - a customer cannot load an exact Admin commission agreement', async () => {
  const app = express();
  app.use('/financials', financialRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(
    '/financials/commission-controls/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );

  expect(response.status).toBe(403);
  expect(getCommissionRateByIdMock).not.toHaveBeenCalled();
});
