import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transitionBookingStatusMock = jest.fn();
const notifyBookingStatusChangeMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'provider-user-1', role: 'provider', iat: 0, exp: 0,
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));

jest.mock('../src/services/booking.service', () => ({
  transitionBookingStatus: (...args: unknown[]) => transitionBookingStatusMock(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  notifyBookingStatusChange: (...args: unknown[]) => notifyBookingStatusChangeMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));
jest.mock('../src/services/referral.service', () => ({}));
jest.mock('../src/services/suki.service', () => ({}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('Bug UX-302 — saving proof does not restart the server-clocked minimum on-site timer', async () => {
  const workStartedAt = new Date(Date.now() - 60 * 60 * 1000);
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        status: 'in_progress',
        escrow_status: 'held',
        latitude: '10.31570000',
        longitude: '123.88540000',
        is_hourly: false,
        work_started_at: workStartedAt,
        // A proof upload just changed updated_at. The completion timer must
        // still use work_started_at and therefore allow completion.
        updated_at: new Date(),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }], rowCount: 1 });

  transitionBookingStatusMock.mockResolvedValue({
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    category_id: 'category-1',
    subcategory_id: null,
    booking_type: 'fixed_price',
    status: 'completed_by_provider',
    escrow_status: 'held',
    service_price: 10000,
    service_fee: 1000,
    total_amount: 11000,
    description: '',
    address: 'Cebu City',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: '10.31570000',
    longitude: '123.88540000',
    scheduled_at: new Date('2026-08-25T08:00:00.000Z'),
    completed_at: new Date(),
    confirmed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    payment_method: 'wallet',
    payment_intent_id: null,
    surge_multiplier: '1',
    surge_amount: 0,
    pricing_rule_id: null,
    rebooked_from_id: null,
    suki_discount: 0,
    job_photos: [],
    provider_before_photos: [],
    provider_after_photos: [],
    business_account_id: null,
    contract_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app)
    .patch('/bookings/booking-1/status')
    .send({ status: 'completed_by_provider' });

  expect(response.status).toBe(200);
  expect(transitionBookingStatusMock).toHaveBeenCalledWith(
    'booking-1',
    'provider-user-1',
    'provider',
    'completed_by_provider',
    undefined,
    undefined,
  );
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
});
