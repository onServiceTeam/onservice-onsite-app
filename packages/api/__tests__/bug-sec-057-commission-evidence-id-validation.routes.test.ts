import express from 'express';
import request from 'supertest';

const getCommissionRateByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/commission-control.service', () => ({
  getCommissionRateById: (...args: unknown[]) => getCommissionRateByIdMock(...args),
}));

import financialRouter from '../src/routes/financial-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-057 - a malformed commission evidence ID is rejected before service access', async () => {
  const app = express();
  app.use('/financials', financialRouter);
  app.use(errorMiddleware);

  const response = await request(app).get('/financials/commission-controls/not-an-agreement');

  expect(response.status).toBe(400);
  expect(getCommissionRateByIdMock).not.toHaveBeenCalled();
});
