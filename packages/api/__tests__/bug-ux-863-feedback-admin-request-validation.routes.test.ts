import express from 'express';
import request from 'supertest';

const listFeedbackMock = jest.fn();
const getFeedbackMock = jest.fn();
const getHistoryMock = jest.fn();
const updateTriageMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '33333333-3333-4333-8333-333333333333',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/feedback-admin.service', () => ({
  listFeedbackForAdmin: (...args: unknown[]) => listFeedbackMock(...args),
  getFeedbackForAdmin: (...args: unknown[]) => getFeedbackMock(...args),
  getFeedbackHistoryForAdmin: (...args: unknown[]) => getHistoryMock(...args),
  updateFeedbackTriage: (...args: unknown[]) => updateTriageMock(...args),
}));
jest.mock('../src/services/feedback-screenshot.service', () => ({
  getFeedbackScreenshotForAdmin: jest.fn(),
}));

import feedbackAdminRouter from '../src/routes/feedback-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const FEEDBACK_ID = '11111111-1111-4111-8111-111111111111';

it('Bug UX-863 — Admin feedback rejects malformed query, path, and triage fields before service work', async () => {
  listFeedbackMock.mockResolvedValue({
    submissions: [],
    total: 0,
    page: 1,
    pageSize: 25,
    counts: { new: 0, triaged: 0, done: 0, dismissed: 0 },
  });
  const app = express();
  app.use(express.json());
  app.use('/admin/feedback', feedbackAdminRouter);
  app.use(errorMiddleware);

  expect((await request(app).get('/admin/feedback?page=not-a-number')).status).toBe(400);
  expect((await request(app).get('/admin/feedback?unknown=true')).status).toBe(400);
  expect((await request(app).get(`/admin/feedback?search=${'x'.repeat(101)}`)).status).toBe(400);
  expect((await request(app).get('/admin/feedback/not-a-uuid')).status).toBe(400);
  expect((await request(app)
    .patch(`/admin/feedback/${FEEDBACK_ID}/triage`)
    .send({ status: 'triaged', assignedAdminId: 'not-a-uuid', note: 'Verified and assigned.', expectedUpdatedAt: '2026-08-24T00:00:00.000Z' })).status).toBe(400);
  expect((await request(app)
    .patch(`/admin/feedback/${FEEDBACK_ID}/triage`)
    .send({ status: 'done', assignedAdminId: null, note: 'Verified and completed.', expectedUpdatedAt: '2026-08-24T00:00:00.000Z' })).status).toBe(400);
  expect((await request(app)
    .patch(`/admin/feedback/${FEEDBACK_ID}/triage`)
    .send({ status: 'new', assignedAdminId: null, note: 'Returned for another review.', expectedUpdatedAt: '2026-08-24T00:00:00.000Z', extra: true })).status).toBe(400);
  expect((await request(app)
    .patch(`/admin/feedback/${FEEDBACK_ID}/triage`)
    .send({ status: 'new', assignedAdminId: null, note: 'Returned for another review.' })).status).toBe(400);
  expect((await request(app)
    .patch(`/admin/feedback/${FEEDBACK_ID}/triage`)
    .send({ status: 'new', assignedAdminId: '22222222-2222-4222-8222-222222222222', note: 'Returned for another review.', expectedUpdatedAt: '2026-08-24T00:00:00.000Z' })).status).toBe(400);

  expect(listFeedbackMock).not.toHaveBeenCalled();
  expect(getFeedbackMock).not.toHaveBeenCalled();
  expect(updateTriageMock).not.toHaveBeenCalled();

  const valid = await request(app).get('/admin/feedback?page=1&pageSize=25&status=new&area=customer');
  expect(valid.status).toBe(200);
  expect(listFeedbackMock).toHaveBeenCalledWith({
    page: 1,
    pageSize: 25,
    status: 'new',
    area: 'customer',
    search: undefined,
    actorRole: 'admin',
  });
});
