import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();
const getBookingMock = jest.fn();
const calculateSukiDiscountMock = jest.fn();
const appendProviderTermsMock = jest.fn();
const notifyProviderMock = jest.fn();
const notifyCustomerMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'admin-ux-1015', role: 'super_admin', iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...args: unknown[]) => getBookingMock(...args),
  calculateServiceFee: jest.fn(),
}));
jest.mock('../src/services/matching.service', () => ({
  hasBookingConflict: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/services/suki.service', () => ({
  calculateSukiDiscountForBooking: (...args: unknown[]) => calculateSukiDiscountMock(...args),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: jest.fn(),
  appendProviderAssignmentTermsInTransaction: (...args: unknown[]) => appendProviderTermsMock(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  notifyProviderNewJob: (...args: unknown[]) => notifyProviderMock(...args),
  notifyCustomerProviderAssigned: (...args: unknown[]) => notifyCustomerMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('Bug UX-1015 — direct assignment cannot overwrite a provider selected before the booking lock is acquired', async () => {
  const preReadBooking = {
    id: 'booking-ux-1015', customer_id: 'customer-1', provider_id: null,
    status: 'requested', escrow_status: null, service_price: 100_000,
    service_fee: 10_000, total_amount: 110_000,
    description: 'Provider race check', city: 'Cebu City',
    scheduled_at: new Date('2026-09-03T02:00:00.000Z'),
  };
  const lockedBooking = {
    ...preReadBooking,
    provider_id: 'provider-winner',
    status: 'paid',
    escrow_status: 'held',
    service_price: '100000',
    total_amount: '110000',
  };
  getBookingMock.mockResolvedValue(preReadBooking);
  dbQueryMock.mockResolvedValue({
    rows: [{ id: 'provider-loser', user_id: 'provider-user-loser', business_name: 'Provider Loser' }],
    rowCount: 1,
  });
  transactionQueryMock.mockResolvedValue({ rows: [lockedBooking], rowCount: 1 });
  transactionMock.mockImplementation(async (
    callback: (client: { query: typeof transactionQueryMock }) => Promise<unknown>,
  ) => callback({ query: transactionQueryMock }));

  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => (
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' })
  ));

  const response = await request(app)
    .post('/bookings/booking-ux-1015/assign')
    .send({ providerId: 'provider-loser' });

  expect(response.status).toBe(409);
  expect(response.body.error).toBe('This booking has already been assigned to a provider.');
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/SELECT customer_id, provider_id, status, escrow_status[\s\S]*FOR UPDATE/),
    ['booking-ux-1015'],
  );
  expect(calculateSukiDiscountMock).not.toHaveBeenCalled();
  expect(appendProviderTermsMock).not.toHaveBeenCalled();
  expect(notifyProviderMock).not.toHaveBeenCalled();
  expect(notifyCustomerMock).not.toHaveBeenCalled();
});
