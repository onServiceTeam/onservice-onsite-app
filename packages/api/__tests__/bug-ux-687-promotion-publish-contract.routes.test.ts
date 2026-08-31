import express from 'express';
import request from 'supertest';

const createPromotionMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'super-admin-1',
      role: 'super_admin',
    };
    next();
  },
}));

jest.mock('../src/services/promotion.service', () => ({
  createPromotion: (...args: unknown[]) => createPromotionMock(...args),
  updatePromotion: jest.fn(),
  deletePromotion: jest.fn(),
  getAllPromotions: jest.fn(),
  getActivePromotions: jest.fn(),
  formatPromotion: (promotion: unknown) => promotion,
}));

import promotionRouter from '../src/routes/promotion.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-687 — promotion creation rejects unsafe schedules and destinations and creates reviewed content as a draft', async () => {
  const app = express();
  app.use(express.json());
  app.use('/promotions', promotionRouter);
  app.use(errorMiddleware);

  const unsafeDestination = await request(app).post('/promotions').send({
    title: 'Unsafe destination',
    ctaLink: 'javascript:alert(1)',
  });
  expect(unsafeDestination.status).toBe(400);
  expect(unsafeDestination.body.error.message).toMatch(/internal app path or an HTTPS URL/i);

  const reversedSchedule = await request(app).post('/promotions').send({
    title: 'Reversed schedule',
    startDate: '2026-09-02T08:00:00+08:00',
    endDate: '2026-09-01T08:00:00+08:00',
  });
  expect(reversedSchedule.status).toBe(400);
  expect(reversedSchedule.body.error.message).toMatch(/endDate must be after startDate/i);
  expect(createPromotionMock).not.toHaveBeenCalled();

  createPromotionMock.mockResolvedValueOnce({ id: 'promotion-1', title: 'Cebu launch' });
  const validDraft = await request(app).post('/promotions').send({
    title: 'Cebu launch',
    subtitle: 'Book a vetted local provider.',
    ctaText: 'Browse services',
    ctaLink: '/customer/search',
    startDate: '2026-09-01T08:00:00+08:00',
    endDate: '2026-09-30T23:59:59+08:00',
    displayOrder: 1,
  });
  expect(validDraft.status).toBe(201);
  expect(createPromotionMock).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Cebu launch',
    ctaLink: '/customer/search',
    isActive: false,
    createdBy: 'super-admin-1',
  }));
});
