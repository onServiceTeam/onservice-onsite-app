import express from 'express';
import request from 'supertest';

const evidenceMock = jest.fn(async () => [{
  tier: 'verified', currentRate: 0.13, providerCount: 8,
  legacyQualitySampleCount: 8, averageCompletedBookings: 6,
  averageCompletedBookingValue: 250000, sampleStatus: 'available',
}]);

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));
jest.mock('../src/services/admin-analytics.service', () => ({
  getCommissionEvidence: (...args: unknown[]) => evidenceMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-827 — the API returns read-only commission evidence and retires automated rate advice', async () => {
  const app = express();
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const evidence = await request(app).get('/admin/analytics/commission-evidence');
  const retired = await request(app).get('/admin/analytics/commission-optimization');

  expect(evidence.status).toBe(200);
  expect(evidence.body.data[0]).not.toHaveProperty('suggestedRate');
  expect(evidence.body.data[0]).toMatchObject({ currentRate: 0.13, sampleStatus: 'available' });
  expect(retired.status).toBe(410);
  expect(retired.body.error.message).toMatch(/E48/);
});
