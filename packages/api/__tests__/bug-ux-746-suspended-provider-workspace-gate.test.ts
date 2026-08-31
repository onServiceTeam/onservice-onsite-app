import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const areaStateMock = jest.fn();
const jobRequestsMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'provider-user-1', role: 'provider' };
    next();
  },
}));

jest.mock('../src/services/service-area-change.service', () => ({
  getProviderAreaChangeState: (...args: unknown[]) => areaStateMock(...args),
}));

jest.mock('../src/services/job-leads.service', () => ({
  getOpenJobRequestsForProvider: (...args: unknown[]) => jobRequestsMock(...args),
}));

import providerRouter from '../src/routes/provider.routes';

it('Bug UX-746 — suspended providers cannot enter previously unguarded service-area or job-request workspace paths', async () => {
  dbQueryMock.mockResolvedValue({
    rows: [{ id: 'provider-1', user_id: 'provider-user-1', status: 'suspended' }],
    rowCount: 1,
  });
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const [areaResponse, leadsResponse] = await Promise.all([
    request(app).get('/providers/me/service-area'),
    request(app).get('/providers/me/job-requests'),
  ]);

  expect(areaResponse.status).toBe(403);
  expect(leadsResponse.status).toBe(403);
  expect(areaResponse.body.error).toMatch(/not approved/i);
  expect(areaStateMock).not.toHaveBeenCalled();
  expect(jobRequestsMock).not.toHaveBeenCalled();
});
