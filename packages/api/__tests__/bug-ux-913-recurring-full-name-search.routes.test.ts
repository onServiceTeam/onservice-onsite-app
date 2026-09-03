import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-913', role: 'admin' };
    next();
  },
}));

const dbQueryMock = jest.fn()
  .mockResolvedValueOnce({
    rows: [{ count: '0', active_count: '0', attention_count: '0', open_support_count: '0' }],
  })
  .mockResolvedValueOnce({ rows: [] });
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';

it('Bug UX-913 — recurring support search matches the full customer name shown to the operator', async () => {
  const app = express();
  app.use('/admin', adminRouter);

  const response = await request(app)
    .get('/admin/recurring')
    .query({ search: 'Maria Santos' });

  expect(response.status).toBe(200);
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  expect(dbQueryMock.mock.calls[0]![0]).toContain(
    "TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) ILIKE $1",
  );
  expect(dbQueryMock.mock.calls[0]![1]).toEqual(['%Maria Santos%']);
  expect(dbQueryMock.mock.calls[1]![1]).toEqual(['%Maria Santos%', 20, 0]);
});
