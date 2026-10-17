// CR-272 (customer review 2026-10-17, slice P2, discovery-support-4, fix
// round): Service Provider profile privacy fix (matching list). The list of
// matching Service Providers that a customer can ask for on their own quote
// request carries the public fields only (id, business name, tier, rating,
// jobs done), in the matcher's order. It carries no account id, no distance
// and no internal score. Real booking router over supertest; the matcher's
// answer is typed as the real ScoredProvider, so a field the matcher adds
// later is caught here too.
import express from 'express';
import request from 'supertest';
import type { ScoredProvider } from '../src/services/matching.service';

const mockGetBookingById = jest.fn();
const mockFindMatchingProvidersSimple = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'c2000000-0000-4000-8000-000000000001', role: 'customer', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/services/booking.service', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));
jest.mock('../src/services/matching.service', () => ({
  findMatchingProvidersSimple: (...args: unknown[]) => mockFindMatchingProvidersSimple(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const bookingId = 'c5000000-0000-4000-8000-000000000001';
const matched: ScoredProvider[] = [
  {
    providerId: 'c3000000-0000-4000-8000-000000000011',
    userId: 'c2000000-0000-4000-8000-000000000011',
    businessName: 'Linis Pro Cleaning Services',
    tier: 'verified',
    rating: 4.8,
    totalJobs: 42,
    distanceKm: 1.37,
    score: 0.912,
  },
  {
    providerId: 'c3000000-0000-4000-8000-000000000016',
    userId: 'c2000000-0000-4000-8000-000000000016',
    businessName: "Kuya Mike's Plumbing",
    tier: 'new',
    rating: 4.5,
    totalJobs: 10,
    distanceKm: 4.02,
    score: 0.611,
  },
];

it('Bug CR-272 — the matching list a customer gets has no account id, no distance and no score', async () => {
  mockGetBookingById.mockResolvedValue({
    id: bookingId,
    customer_id: 'c2000000-0000-4000-8000-000000000001',
    status: 'requested',
    category_id: 'c4000000-0000-4000-8000-000000000001',
    latitude: '10.31570000',
    longitude: '123.88540000',
    scheduled_at: '2026-10-20T01:00:00.000Z',
  });
  mockFindMatchingProvidersSimple.mockResolvedValue(matched);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/api/v1/bookings/${bookingId}/match`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    success: true,
    data: {
      bookingId,
      providers: [
        {
          providerId: 'c3000000-0000-4000-8000-000000000011',
          businessName: 'Linis Pro Cleaning Services',
          tier: 'verified',
          rating: 4.8,
          totalJobs: 42,
        },
        {
          providerId: 'c3000000-0000-4000-8000-000000000016',
          businessName: "Kuya Mike's Plumbing",
          tier: 'new',
          rating: 4.5,
          totalJobs: 10,
        },
      ],
    },
  });
  // Neither the account ids nor the distances appear anywhere in the answer.
  const body = JSON.stringify(response.body);
  expect(body).not.toContain('c2000000-0000-4000-8000-000000000011');
  expect(body).not.toContain('c2000000-0000-4000-8000-000000000016');
  expect(body).not.toMatch(/1\.37|4\.02|distance|score|userId/i);
});
