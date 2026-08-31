import express from 'express';
import request from 'supertest';

const updateAreaMock = jest.fn();
const notifyWaitlistMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => ({
  updateServiceArea: (...args: unknown[]) => updateAreaMock(...args),
  notifyWaitlist: (...args: unknown[]) => notifyWaitlistMock(...args),
  formatServiceArea: (area: unknown) => area,
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);
  return app;
}

const areaId = '11111111-1111-4111-8111-111111111111';
const reason = 'Approved provider capacity and launch operations were checked.';

beforeEach(() => {
  updateAreaMock.mockReset().mockResolvedValue({ id: areaId, status: 'active' });
  notifyWaitlistMock.mockReset();
});

it('Bug UX-785 — activation reports the actual registered-account notification count without claiming every lead was contacted', async () => {
  notifyWaitlistMock.mockResolvedValue(2);
  const response = await request(buildApp()).post(`/admin/service-areas/${areaId}/activate`).send({ reason });

  expect(response.status).toBe(200);
  expect(response.body.waitlistNotification).toEqual({ notifiedCount: 2, warning: null });
  expect(response.body.message).toMatch(/2 registered waitlist accounts notified/i);
  expect(response.body.message).toMatch(/other entries remain awaiting contact/i);
});

it('Bug UX-786 — a notification outage returns the already-committed activation as success with an explicit retry warning', async () => {
  notifyWaitlistMock.mockRejectedValue(new Error('notification database unavailable'));
  const response = await request(buildApp()).post(`/admin/service-areas/${areaId}/activate`).send({ reason });

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: areaId, status: 'active' });
  expect(response.body.waitlistNotification.warning).toMatch(/activated.*could not be completed/i);
  expect(response.body.message).toMatch(/retry.*Service Areas/i);
});
