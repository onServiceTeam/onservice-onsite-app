import express from 'express';
import request from 'supertest';

const mockCreateProviderApplication = jest.fn();
const mockGetMaxProviderServiceRadiusKm = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'provider',
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../src/services/provider.service', () => ({
  createProviderApplication: (...args: unknown[]) => mockCreateProviderApplication(...args),
  formatProvider: (value: unknown) => value,
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: (...args: unknown[]) => mockGetMaxProviderServiceRadiusKm(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import providerRouter from '../src/routes/provider.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-528 — an existing provider account cannot submit a second provider application', async () => {
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use(errorMiddleware);

  const response = await request(app).post('/providers/apply').send({
    businessName: 'Duplicate Provider',
    categoryIds: ['11111111-1111-4111-8111-111111111111'],
    serviceAreaId: '22222222-2222-4222-8222-222222222222',
    serviceRadiusKm: 10,
    latitude: 10.3157,
    longitude: 123.8854,
    city: 'Cebu City',
    province: 'Cebu',
    governmentIdFrontUrl: 'https://cdn.example/front.jpg',
    governmentIdBackUrl: 'https://cdn.example/back.jpg',
    nbiClearanceUrl: 'https://cdn.example/nbi.jpg',
    selfieUrl: 'https://cdn.example/selfie.jpg',
    icAgreementAccepted: true,
  });

  expect(response.status).toBe(403);
  expect(response.body.error.message).toMatch(/only customer accounts/i);
  expect(mockGetMaxProviderServiceRadiusKm).not.toHaveBeenCalled();
  expect(mockCreateProviderApplication).not.toHaveBeenCalled();
});
