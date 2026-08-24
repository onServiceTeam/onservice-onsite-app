import express from 'express';
import request from 'supertest';

let currentUser = { userId: 'customer-1', role: 'customer' };
const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const getBookingByIdAdminMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      ...currentUser,
      iat: 0,
      exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: async (fn: (client: { query: typeof clientQueryMock }) => Promise<unknown>) =>
      fn({ query: clientQueryMock }),
  },
}));
jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...args: unknown[]) => getBookingByIdAdminMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';
import { countAfterPhotos } from '../src/services/booking-photo.service';

it('Bug UX-307 — only assigned provider-side after photos satisfy provider completion evidence', async () => {
  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  const actorRow = {
    id: 'booking-1',
    provider_user_id: 'provider-user-1',
    staff_user_id: 'staff-user-1',
    staff_status: 'approved',
  };

  dbQueryMock.mockResolvedValueOnce({ rows: [actorRow], rowCount: 1 });
  const customerAttempt = await request(app)
    .post('/bookings/booking-1/photos')
    .send({ phase: 'after', urls: ['https://example.test/customer-after.jpg'] });
  expect(customerAttempt.status).toBe(403);
  expect(clientQueryMock).not.toHaveBeenCalled();

  currentUser = { userId: 'staff-user-1', role: 'provider_staff' };
  dbQueryMock.mockResolvedValueOnce({ rows: [actorRow], rowCount: 1 });
  clientQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });
  getBookingByIdAdminMock.mockResolvedValueOnce({
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    category_id: 'category-1',
    subcategory_id: null,
    booking_type: 'fixed_price',
    status: 'in_progress',
    escrow_status: 'held',
    service_price: 10000,
    service_fee: 500,
    total_amount: 10500,
    description: 'Clean the unit',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: null,
    longitude: null,
    scheduled_at: new Date(),
    completed_at: null,
    confirmed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    payment_method: null,
    payment_intent_id: null,
    surge_multiplier: '1',
    surge_amount: 0,
    pricing_rule_id: null,
    rebooked_from_id: null,
    suki_discount: 0,
    job_photos: [],
    provider_before_photos: [],
    provider_after_photos: ['https://example.test/staff-after.jpg'],
    business_account_id: null,
    contract_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const staffAttempt = await request(app)
    .post('/bookings/booking-1/photos')
    .send({ phase: 'after', urls: ['https://example.test/staff-after.jpg'] });
  expect(staffAttempt.status).toBe(200);
  const insertCall = clientQueryMock.mock.calls.find((call) =>
    String(call[0]).includes('INSERT INTO booking_photos'),
  );
  expect(insertCall?.[1]).toEqual(expect.arrayContaining(['staff-user-1', 'provider', 'after']));

  dbQueryMock.mockImplementationOnce((sql: unknown) => Promise.resolve({
    rows: [{ count: String(sql).includes("uploaded_by_role = 'provider'") ? '2' : '99' }],
    rowCount: 1,
  }));
  await expect(countAfterPhotos('booking-1')).resolves.toBe(2);
});
