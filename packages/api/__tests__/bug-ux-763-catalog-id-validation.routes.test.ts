import express from 'express';
import request from 'supertest';

const deleteAddonMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/catalog.service', () => ({
  deleteAddon: (...args: unknown[]) => deleteAddonMock(...args),
}));
jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/cache.service', () => ({
  getRuntimeCacheTtl: jest.fn().mockResolvedValue(60),
  cacheDeletePattern: jest.fn(),
}));

import catalogRouter from '../src/routes/catalog.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-763 — malformed catalog record IDs are rejected before a lifecycle service call', async () => {
  const app = express();
  app.use(express.json());
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .delete('/catalog/admin/addons/not-a-uuid')
    .send({ reason: 'Retired after the catalog operations review.' });

  expect(response.status).toBe(400);
  expect(deleteAddonMock).not.toHaveBeenCalled();
});
