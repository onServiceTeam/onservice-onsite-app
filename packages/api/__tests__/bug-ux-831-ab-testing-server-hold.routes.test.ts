import express from 'express';
import request from 'supertest';

const getFlagMock = jest.fn(async () => false);
const listMock = jest.fn();
const createMock = jest.fn();
const resultsMock = jest.fn();
const statusMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingBoolean: (...args: unknown[]) => getFlagMock(...args),
}));
jest.mock('../src/services/admin-analytics.service', () => ({
  listAbTests: (...args: unknown[]) => listMock(...args),
  createAbTest: (...args: unknown[]) => createMock(...args),
  getAbTestResults: (...args: unknown[]) => resultsMock(...args),
  updateAbTestStatus: (...args: unknown[]) => statusMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-831 — the disabled A/B launch flag blocks every direct admin read and mutation route', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const responses = await Promise.all([
    request(app).get('/admin/analytics/ab-tests'),
    request(app).post('/admin/analytics/ab-tests').send({ name: 'Held experiment' }),
    request(app).get('/admin/analytics/ab-tests/test-1/results'),
    request(app).patch('/admin/analytics/ab-tests/test-1/status').send({ status: 'active' }),
  ]);

  for (const response of responses) {
    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/held until assignment and exposure reporting/);
  }
  expect(getFlagMock).toHaveBeenCalledTimes(4);
  expect([listMock, createMock, resultsMock, statusMock].every((mock) => mock.mock.calls.length === 0)).toBe(true);
});
