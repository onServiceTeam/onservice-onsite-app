const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const coverageMock = jest.fn();
jest.mock('../src/services/service-area.service', () => ({
  checkCoverage: (...args: unknown[]) => coverageMock(...args),
}));

import { createBooking, createJobRequest } from '../src/services/booking.service';
import { createBookingSchema, createJobRequestSchema } from '../src/validators/booking.validators';

const location = { latitude: 14.5547, longitude: 121.0244 };

it('Bug UX-052 — fixed and quote bookings require coordinates inside an active service area before any booking row is written', async () => {
  const base = {
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Need a qualified provider for this service request.',
    address: '123 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  };

  expect(createBookingSchema.safeParse({
    ...base,
    bookingType: 'fixed_price',
    scheduledAt: '2026-09-01T01:00:00.000Z',
  }).success).toBe(false);
  expect(createJobRequestSchema.safeParse({
    ...base,
    urgency: 'within_3_days',
    jobPhotos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
  }).success).toBe(false);

  coverageMock.mockResolvedValue({ covered: false, area: null, nearestArea: null, distanceKm: null });

  await expect(createBooking({
    customerId: 'customer-1',
    ...base,
    ...location,
    bookingType: 'fixed_price',
    subcategoryId: 'subcategory-1',
    scheduledAt: '2026-09-01T01:00:00.000Z',
  })).rejects.toMatchObject({ statusCode: 422 });

  await expect(createJobRequest('customer-1', {
    ...base,
    ...location,
    urgency: 'within_3_days',
    jobPhotos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
  })).rejects.toMatchObject({ statusCode: 422 });

  expect(dbQueryMock).not.toHaveBeenCalled();
});
