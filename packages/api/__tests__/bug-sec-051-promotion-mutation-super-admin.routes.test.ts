import express from 'express';
import request from 'supertest';

const createPromotionMock = jest.fn();
const updatePromotionMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));

jest.mock('../src/services/promotion.service', () => ({
  createPromotion: (...args: unknown[]) => createPromotionMock(...args),
  updatePromotion: (...args: unknown[]) => updatePromotionMock(...args),
}));

import promotionRouter from '../src/routes/promotion.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-051 - ordinary Admin accounts cannot create or alter customer-facing home banners', async () => {
  const app = express();
  app.use(express.json());
  app.use('/promotions', promotionRouter);
  app.use(errorMiddleware);

  const [createResponse, updateResponse] = await Promise.all([
    request(app).post('/promotions').send({ title: 'Unapproved banner' }),
    request(app)
      .put('/promotions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({ title: 'Altered customer copy' }),
  ]);

  expect(createResponse.status).toBe(403);
  expect(updateResponse.status).toBe(403);
  expect(createPromotionMock).not.toHaveBeenCalled();
  expect(updatePromotionMock).not.toHaveBeenCalled();
});
