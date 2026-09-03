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

it('Bug OPS-423 - the exact financial route returns the requested retained commission agreement', async () => {
  const rateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  getCommissionRateByIdMock.mockResolvedValueOnce({ id: rateId, lifecycleStatus: 'superseded' });
  const app = express();
  app.use('/financials', financialRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/financials/commission-controls/${rateId}`);

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: rateId, lifecycleStatus: 'superseded' });
  expect(getCommissionRateByIdMock).toHaveBeenCalledWith(rateId);
});
