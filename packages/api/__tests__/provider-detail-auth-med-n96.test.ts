import express from 'express';
import request from 'supertest';

const mockGetProviderById = jest.fn();
const mockGetProviderServices = jest.fn();
const mockGetSchedule = jest.fn();
const mockGetProviderRating = jest.fn();
const mockGetPortfolio = jest.fn();
const mockGetPublicCertifications = jest.fn();
const mockGetSukiCount = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (req.header('x-test-auth') !== 'authenticated') {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    (req as express.Request & { user: unknown }).user = {
      userId: 'customer-med-n96',
      role: 'customer',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../src/services/provider.service', () => ({
  getProviderById: (...args: unknown[]) => mockGetProviderById(...args),
  getProviderServices: (...args: unknown[]) => mockGetProviderServices(...args),
  getSchedule: (...args: unknown[]) => mockGetSchedule(...args),
  getPortfolio: (...args: unknown[]) => mockGetPortfolio(...args),
  getPublicCertifications: (...args: unknown[]) => mockGetPublicCertifications(...args),
  getSukiCount: (...args: unknown[]) => mockGetSukiCount(...args),
  formatProvider: (value: unknown) => value,
  formatProviderService: (value: unknown) => value,
  formatScheduleSlot: (value: unknown) => value,
  formatPortfolioItem: (value: unknown) => value,
  formatPublicCertification: (value: unknown) => value,
}));

jest.mock('../src/services/review.service', () => ({
  getProviderAggregateRating: (...args: unknown[]) => mockGetProviderRating(...args),
}));

import providerRouter from '../src/routes/provider.routes';

it('MED-N96 - provider detail blocks anonymous access without changing the authenticated payload contract', async () => {
  mockGetProviderById.mockResolvedValue({
    id: 'provider-med-n96',
    first_name: 'Ana',
    last_name: 'Reyes',
    business_name: 'Ana Home Services',
  });
  mockGetProviderServices.mockResolvedValue([{ id: 'service-med-n96' }]);
  mockGetSchedule.mockResolvedValue([{ id: 'schedule-med-n96' }]);
  mockGetProviderRating.mockResolvedValue({ averageRating: 4.9, totalReviews: 12 });
  mockGetPortfolio.mockResolvedValue([{ id: 'portfolio-med-n96' }]);
  mockGetPublicCertifications.mockResolvedValue([{ id: 'certification-med-n96' }]);
  mockGetSukiCount.mockResolvedValue(7);

  const app = express();
  app.use('/providers', providerRouter);

  const anonymous = await request(app).get('/providers/provider-med-n96');
  expect(anonymous.status).toBe(401);
  expect(mockGetProviderById).not.toHaveBeenCalled();

  const authenticated = await request(app)
    .get('/providers/provider-med-n96')
    .set('x-test-auth', 'authenticated');

  expect(authenticated.status).toBe(200);
  expect(authenticated.body).toEqual({
    success: true,
    data: {
      id: 'provider-med-n96',
      first_name: 'Ana',
      last_name: 'Reyes',
      business_name: 'Ana Home Services',
      name: 'Ana Reyes',
      services: [{ id: 'service-med-n96' }],
      schedule: [{ id: 'schedule-med-n96' }],
      ratings: { averageRating: 4.9, totalReviews: 12 },
      portfolio: [{ id: 'portfolio-med-n96' }],
      certifications: [{ id: 'certification-med-n96' }],
      sukiCount: 7,
    },
  });
  expect(mockGetProviderServices).toHaveBeenCalledWith('provider-med-n96');
  expect(mockGetSchedule).toHaveBeenCalledWith('provider-med-n96');
  expect(mockGetProviderRating).toHaveBeenCalledWith('provider-med-n96');
  expect(mockGetPortfolio).toHaveBeenCalledWith('provider-med-n96');
  expect(mockGetPublicCertifications).toHaveBeenCalledWith('provider-med-n96');
  expect(mockGetSukiCount).toHaveBeenCalledWith('provider-med-n96');
});
