import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: req.header('x-test-role') ?? 'admin',
    };
    next();
  },
}));

const searchMock = jest.fn();
jest.mock('../src/services/admin-search.service', () => ({
  searchAdminRecords: (...args: unknown[]) => searchMock(...args),
}));

import searchRouter from '../src/routes/admin-search.routes';

beforeEach(() => {
  searchMock.mockReset();
});

function buildApp() {
  const app = express();
  app.use('/search', searchRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  return app;
}

it('Bug UX-516 — global search trims and bounds a single query before service execution', async () => {
  searchMock.mockResolvedValueOnce([]);
  const app = buildApp();

  const valid = await request(app).get('/search').query({ q: '  Ana Reyes  ' });
  const tooShort = await request(app).get('/search').query({ q: 'a' });
  const repeated = await request(app).get('/search?q=ana&q=reyes');

  expect(valid.status).toBe(200);
  expect(searchMock).toHaveBeenCalledWith('Ana Reyes');
  expect(tooShort.status).toBe(400);
  expect(repeated.status).toBe(400);
  expect(searchMock).toHaveBeenCalledTimes(1);
});

it('Bug UX-517 — privacy-only DPO sessions cannot inherit general operations record search', async () => {
  const app = buildApp();
  const response = await request(app)
    .get('/search')
    .query({ q: 'Ana Reyes' })
    .set('x-test-role', 'dpo');

  expect(response.status).toBe(403);
  expect(response.body.message).toMatch(/Operations admin access required/i);
  expect(searchMock).not.toHaveBeenCalled();
});
