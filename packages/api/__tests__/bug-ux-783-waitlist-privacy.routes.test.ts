import express from 'express';
import request from 'supertest';

let mockRole: 'admin' | 'super_admin' = 'admin';
const getWaitlistMock = jest.fn().mockResolvedValue({
  items: [{
    id: 'wait-1', full_name: 'Maria Santos', phone: '+639171234567', email: 'maria@example.com',
    city: 'Cebu City', province: 'Cebu', barangay: 'Lahug', latitude: '10.33000', longitude: '123.90000',
    service_area_id: null, notified: false, notified_at: null, created_at: new Date('2026-08-01T00:00:00.000Z'),
  }],
  total: 1,
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: mockRole,
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => {
  const actual = jest.requireActual('../src/services/service-area.service') as Record<string, unknown>;
  return { ...actual, getWaitlist: (...args: unknown[]) => getWaitlistMock(...args) };
});

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

function buildApp(): express.Express {
  const app = express();
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);
  return app;
}

it('Bug UX-783 — waitlist contact and exact coordinates stay masked for ordinary admins while super admins retain operational access', async () => {
  const app = buildApp();
  mockRole = 'admin';
  const adminResponse = await request(app).get('/admin/service-areas-waitlist');
  mockRole = 'super_admin';
  const superResponse = await request(app).get('/admin/service-areas-waitlist');

  expect(adminResponse.status).toBe(200);
  expect(adminResponse.body.data[0]).toMatchObject({
    fullName: 'Maria S.', phone: '+63 9XX XXX 4567', email: 'm•••@example.com',
    latitude: null, longitude: null, contactMasked: true, exactLocationMasked: true,
  });
  expect(superResponse.body.data[0]).toMatchObject({
    fullName: 'Maria Santos', phone: '+639171234567', email: 'maria@example.com',
    latitude: 10.33, longitude: 123.9, contactMasked: false,
  });
});

it('Bug UX-788 — malformed waitlist filters are rejected instead of silently changing scope', async () => {
  mockRole = 'admin';
  getWaitlistMock.mockClear();
  const response = await request(buildApp()).get('/admin/service-areas-waitlist?page=1.5&notified=yes');

  expect(response.status).toBe(400);
  expect(getWaitlistMock).not.toHaveBeenCalled();
});
