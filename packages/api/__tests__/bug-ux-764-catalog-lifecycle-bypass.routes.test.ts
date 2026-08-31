import express from 'express';
import request from 'supertest';

const updateSubcategoryMock = jest.fn();
const updateAddonMock = jest.fn();

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
  updateSubcategory: (...args: unknown[]) => updateSubcategoryMock(...args),
  updateAddon: (...args: unknown[]) => updateAddonMock(...args),
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

it('Bug UX-764 — generic catalog edits cannot bypass reasoned lifecycle endpoints', async () => {
  const app = express();
  app.use(express.json());
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const serviceResponse = await request(app)
    .put(`/catalog/admin/subcategories/${id}`)
    .send({ isActive: true });
  const addonResponse = await request(app)
    .put(`/catalog/admin/addons/${id}`)
    .send({ isActive: true });

  expect(serviceResponse.status).toBe(400);
  expect(addonResponse.status).toBe(400);
  expect(updateSubcategoryMock).not.toHaveBeenCalled();
  expect(updateAddonMock).not.toHaveBeenCalled();
});
