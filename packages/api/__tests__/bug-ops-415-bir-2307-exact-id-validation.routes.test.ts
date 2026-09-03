import express from 'express';
import request from 'supertest';

const getBatchByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/services/bir-2307.service', () => ({
  getBatchById: (...args: unknown[]) => getBatchByIdMock(...args),
  listBatchesForQuarter: jest.fn(),
  listBatchesForProvider: jest.fn(),
  generateQuarterly2307Batches: jest.fn(),
  regenerate2307ForProvider: jest.fn(),
}));
jest.mock('../src/services/vat-report.service', () => ({}));
jest.mock('../src/services/reconciliation.service', () => ({}));
jest.mock('../src/services/financial-admin.service', () => ({}));

import birAdminRouter from '../src/routes/bir-admin.routes';

it('Bug OPS-415 - exact 2307 evidence rejects a malformed batch ID before querying retained tax data', async () => {
  const app = express();
  app.use('/admin/bir', birAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request,
    res: express.Response, _next: express.NextFunction) => (
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' })
  ));

  const response = await request(app).get('/admin/bir/2307/not-a-uuid');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/2307 batch ID must be a valid UUID/i);
  expect(getBatchByIdMock).not.toHaveBeenCalled();
});
