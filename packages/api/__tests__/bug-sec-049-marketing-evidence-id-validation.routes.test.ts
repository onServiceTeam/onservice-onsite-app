import express from 'express';
import request from 'supertest';

const getPromotionByIdMock = jest.fn();
const getPromoCodeMock = jest.fn();
const getCampaignMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
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

it('Bug SEC-049 - malformed Marketing record IDs are rejected before any exact-record service query', async () => {
  const app = express();
  app.use('/promotions', promotionRouter);
  app.use('/admin/marketing', marketingAdminRouter);
  app.use(errorMiddleware);

  const [promotion, promoCode, campaign] = await Promise.all([
    request(app).get('/promotions/not-a-promotion'),
    request(app).get('/admin/marketing/promos/not-a-promo'),
    request(app).get('/admin/marketing/campaigns/not-a-campaign'),
  ]);

  expect(promotion.status).toBe(400);
  expect(promotion.body.error.message).toBe('Promotion ID must be a valid UUID.');
  expect(promoCode.status).toBe(400);
  expect(promoCode.body.error.message).toBe('Promo code ID must be a valid UUID.');
  expect(campaign.status).toBe(400);
  expect(campaign.body.error.message).toBe('Campaign ID must be a valid UUID.');
  expect(getPromotionByIdMock).not.toHaveBeenCalled();
  expect(getPromoCodeMock).not.toHaveBeenCalled();
  expect(getCampaignMock).not.toHaveBeenCalled();
});
