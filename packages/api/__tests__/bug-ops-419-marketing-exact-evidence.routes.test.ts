import express from 'express';
import request from 'supertest';

const promotionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const promoCodeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const campaignId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const getPromotionByIdMock = jest.fn();
const getPromoCodeMock = jest.fn();
const getCampaignMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: 'admin',
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

it('Bug OPS-419 - exact Marketing evidence routes return the requested home banner, promo code, and campaign', async () => {
  getPromotionByIdMock.mockResolvedValueOnce({ id: promotionId, title: 'Cebu launch' });
  getPromoCodeMock.mockResolvedValueOnce({ id: promoCodeId, code: 'CEBU10' });
  getCampaignMock.mockResolvedValueOnce({ id: campaignId, name: 'Cebu launch tracking' });
  const app = express();
  app.use('/promotions', promotionRouter);
  app.use('/admin/marketing', marketingAdminRouter);
  app.use(errorMiddleware);

  const [promotion, promoCode, campaign] = await Promise.all([
    request(app).get(`/promotions/${promotionId}`),
    request(app).get(`/admin/marketing/promos/${promoCodeId}`),
    request(app).get(`/admin/marketing/campaigns/${campaignId}`),
  ]);

  expect(promotion.status).toBe(200);
  expect(promotion.body.data).toMatchObject({ id: promotionId, title: 'Cebu launch' });
  expect(promoCode.status).toBe(200);
  expect(promoCode.body.data).toMatchObject({ id: promoCodeId, code: 'CEBU10' });
  expect(campaign.status).toBe(200);
  expect(campaign.body.data).toMatchObject({ id: campaignId, name: 'Cebu launch tracking' });
  expect(getPromotionByIdMock).toHaveBeenCalledWith(promotionId);
  expect(getPromoCodeMock).toHaveBeenCalledWith(promoCodeId);
  expect(getCampaignMock).toHaveBeenCalledWith(campaignId);
});
