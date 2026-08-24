import express from 'express';
import request from 'supertest';

const updateProfileMock = jest.fn();
const assignProviderToAreaMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'user-1', role: 'provider' };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../src/services/provider.service', () => ({
  getProviderByUserId: jest.fn().mockResolvedValue({ id: 'provider-1' }),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
  formatProvider: (value: unknown) => value,
}));

jest.mock('../src/services/service-area.service', () => ({
  assignProviderToArea: (...args: unknown[]) => assignProviderToAreaMock(...args),
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import providerRouter from '../src/routes/provider.routes';
import serviceAreaRouter from '../src/routes/service-area.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-263 — both legacy instant-change APIs reject provider coverage writes and leave mutation services untouched', async () => {
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use('/service-areas', serviceAreaRouter);
  app.use(errorMiddleware);

  const profileWrite = await request(app).patch('/providers/me').send({ serviceRadiusKm: 25 });
  expect(profileWrite.status).toBe(409);
  expect(profileWrite.body.error.message).toMatch(/admin review/i);

  const assignmentWrite = await request(app).post('/service-areas/provider/areas').send({ serviceAreaId: 'area-2', isPrimary: true });
  expect(assignmentWrite.status).toBe(409);
  expect(assignmentWrite.body.error.message).toMatch(/admin review/i);

  expect(updateProfileMock).not.toHaveBeenCalled();
  expect(assignProviderToAreaMock).not.toHaveBeenCalled();
});
