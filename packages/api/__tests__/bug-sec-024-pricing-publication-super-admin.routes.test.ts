import express from 'express';
import request from 'supertest';

const mutationMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/pricing-publication.service', () => ({
  createPricingRuleDraft: (...args: unknown[]) => mutationMock(...args),
  updatePricingRuleDraft: (...args: unknown[]) => mutationMock(...args),
  previewPricingRuleDraft: (...args: unknown[]) => mutationMock(...args),
  publishPricingRuleDraft: (...args: unknown[]) => mutationMock(...args),
  retirePricingRule: (...args: unknown[]) => mutationMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-024 — every pricing-rule mutation is restricted to super-admins', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);
  const ruleId = '00000000-0000-4000-8000-000000000024';
  const previewId = '00000000-0000-4000-8000-000000000025';
  const reason = 'Reviewing a controlled pricing publication change.';
  const requests = [
    request(app).post('/admin/pricing-rules').send({
      name: 'Cebu holiday',
      type: 'holiday',
      multiplier: 1.25,
      holidayDate: '2026-12-25',
      categoryScope: { mode: 'global' },
      serviceAreaScope: { mode: 'global' },
      reason,
    }),
    request(app).patch(`/admin/pricing-rules/${ruleId}`).send({
      multiplier: 1.3,
      expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
      reason,
    }),
    request(app).post(`/admin/pricing-rules/${ruleId}/preview`).send({
      samples: [{
        subcategoryId: '00000000-0000-4000-8000-000000000026',
        serviceAreaId: '00000000-0000-4000-8000-000000000027',
        scheduledAt: '2026-12-25T10:00:00.000+08:00',
      }],
    }),
    request(app).post(`/admin/pricing-rules/${ruleId}/publish`).send({ previewId, reason }),
    request(app).post(`/admin/pricing-rules/${ruleId}/retire`).send({ reason }),
  ];

  const responses = await Promise.all(requests);
  expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
  expect(mutationMock).not.toHaveBeenCalled();
});
