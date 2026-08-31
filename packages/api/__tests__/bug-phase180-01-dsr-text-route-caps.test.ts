import express from 'express';
import request from 'supertest';

const mockStartDsrReview = jest.fn();
const mockRequestDsrMoreInfo = jest.fn();
const mockRejectDsr = jest.fn();
const mockEscalateDsrToNpc = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '22222222-2222-4222-8222-222222222222',
      role: 'dpo',
    };
    next();
  },
}));
jest.mock('../src/services/compliance.service', () => ({}));
jest.mock('../src/services/compliance-admin.service', () => ({
  startDsrReview: (...args: unknown[]) => mockStartDsrReview(...args),
  requestDsrMoreInfo: (...args: unknown[]) => mockRequestDsrMoreInfo(...args),
  rejectDsr: (...args: unknown[]) => mockRejectDsr(...args),
  escalateDsrToNpc: (...args: unknown[]) => mockEscalateDsrToNpc(...args),
}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';

it('Bug PHASE180-01 — invalid or oversized DSR action evidence is rejected before service work', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/compliance', complianceAdminRouter);
  app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  const id = '11111111-1111-4111-8111-111111111111';
  const oversized = 'x'.repeat(5001);

  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${id}/start-review`).send({ reviewNote: oversized })).status).toBe(400);
  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${id}/request-info`).send({ infoNeeded: oversized })).status).toBe(400);
  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${id}/reject`).send({ reason: oversized })).status).toBe(400);
  expect((await request(app).post(`/api/v1/admin/compliance/dsr/${id}/escalate`).send({ npcReference: 'x'.repeat(101) })).status).toBe(400);
  expect(mockStartDsrReview).not.toHaveBeenCalled();
  expect(mockRequestDsrMoreInfo).not.toHaveBeenCalled();
  expect(mockRejectDsr).not.toHaveBeenCalled();
  expect(mockEscalateDsrToNpc).not.toHaveBeenCalled();
});
