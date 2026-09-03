import express from 'express';
import request from 'supertest';

const recordId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const getPromotionByIdMock = jest.fn();
const getPromoCodeMock = jest.fn();
const getCampaignMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/promotion.service', () => ({
  getPromotionById: (...args: unknown[]) => getPromotionByIdMock(...args),
  formatPromotion: (promotion: unknown) => promotion,
}));
jest.mock('../src/services/marketing-admin.service', () => ({
  getPromoCode: (...args: unknown[]) => getPromoCodeMock(...args),
  getCampaign: (...args: unknown[]) => getCampaignMock(...args),
}));

import marketingAdminRouter from '../src/routes/marketing-admin.routes';
import promotionRouter from '../src/routes/promotion.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-050 - customer accounts cannot load any exact Admin Marketing evidence record', async () => {
  const app = express();
  app.use('/promotions', promotionRouter);
  app.use('/admin/marketing', marketingAdminRouter);
  app.use(errorMiddleware);

  const [promotion, promoCode, campaign] = await Promise.all([
    request(app).get(`/promotions/${recordId}`),
    request(app).get(`/admin/marketing/promos/${recordId}`),
    request(app).get(`/admin/marketing/campaigns/${recordId}`),
  ]);

  expect(promotion.status).toBe(403);
  expect(promoCode.status).toBe(403);
  expect(campaign.status).toBe(403);
  expect(getPromotionByIdMock).not.toHaveBeenCalled();
  expect(getPromoCodeMock).not.toHaveBeenCalled();
  expect(getCampaignMock).not.toHaveBeenCalled();
});
