import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-022', role: 'admin' };
    next();
  },
}));

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('Bug SEC-022 — malformed recurring admin controls are rejected before any database mutation or lookup', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);

  const invalidFilter = await request(app)
    .get('/admin/recurring')
    .query({ status: 'finished' });
  const invalidHistory = await request(app)
    .get('/admin/recurring/not-a-uuid/instances')
    .query({ page: 'zero' });
  const invalidCancellation = await request(app)
    .post('/admin/recurring/02202202-2022-4022-8022-022022022022/cancel')
    .send({ reason: 'too short', hiddenOverride: true });

  expect(invalidFilter.status).toBe(400);
  expect(invalidHistory.status).toBe(400);
  expect(invalidCancellation.status).toBe(400);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(transactionMock).not.toHaveBeenCalled();
});
