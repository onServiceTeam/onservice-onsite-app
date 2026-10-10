import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();
const getBookingByIdAdminMock = jest.fn();
const calculateServiceFeeMock = jest.fn();
const hasBookingConflictMock = jest.fn();
const calculateSukiDiscountMock = jest.fn();
const notifyProviderMock = jest.fn();
const notifyCustomerMock = jest.fn();
const appendPricingTermsMock = jest.fn();
const mockEventOrder: string[] = [];

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'admin-user-1',
      role: 'super_admin',
      iat: 0,
      exp: 0,
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
  getBookingByIdAdmin: (...args: unknown[]) => getBookingByIdAdminMock(...args),
  calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args),
}));

jest.mock('../src/services/matching.service', () => ({
  hasBookingConflict: (...args: unknown[]) => hasBookingConflictMock(...args),
}));

jest.mock('../src/services/suki.service', () => ({
  calculateSukiDiscountForBooking: (...args: unknown[]) => calculateSukiDiscountMock(...args),
}));

jest.mock('../src/services/notification.service', () => ({
  notifyProviderNewJob: (...args: unknown[]) => notifyProviderMock(...args),
  notifyCustomerProviderAssigned: (...args: unknown[]) => notifyCustomerMock(...args),
}));

jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: (...args: unknown[]) => appendPricingTermsMock(...args),
  appendProviderAssignmentTermsInTransaction: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('MED-N87 — provider assignment commits its price update before either linked notification runs', async () => {
  const booking = {
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: null,
    status: 'requested',
    escrow_status: null,
    service_price: 100_000,
    service_fee: 10_000,
    total_amount: 110_000,
    description: 'Deep cleaning for a two-bedroom home',
    city: 'Cebu City',
    scheduled_at: new Date('2026-08-25T02:00:00.000Z'),
  };
  getBookingByIdAdminMock
    .mockResolvedValueOnce(booking)
    .mockResolvedValueOnce({ ...booking, provider_id: 'provider-1', status: 'matched' });
  dbQueryMock.mockResolvedValueOnce({
    rows: [{ id: 'provider-1', user_id: 'provider-user-1', business_name: 'Provider One' }],
    rowCount: 1,
  });
  hasBookingConflictMock.mockResolvedValue(false);
  calculateSukiDiscountMock.mockResolvedValue({ discountAmount: 5_000 });
  calculateServiceFeeMock.mockResolvedValue(9_500);
  appendPricingTermsMock.mockImplementation(async () => {
    mockEventOrder.push('financial-terms');
  });
  transactionQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FOR UPDATE')) {
      return { rows: [booking], rowCount: 1 };
    }
    mockEventOrder.push('booking-update');
    return { rows: [], rowCount: 1 };
  });
  transactionMock.mockImplementation(async (
    callback: (client: { query: typeof transactionQueryMock }) => Promise<unknown>,
  ) => {
    mockEventOrder.push('transaction-start');
    const result = await callback({ query: transactionQueryMock });
    mockEventOrder.push('transaction-commit');
    return result;
  });
  notifyProviderMock.mockImplementation(async () => {
    mockEventOrder.push('provider-notification');
  });
  notifyCustomerMock.mockImplementation(async () => {
    mockEventOrder.push('customer-notification');
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
    .post('/bookings/booking-1/assign')
    .send({ providerId: 'provider-1' });

  expect(response.status).toBe(200);
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/UPDATE bookings SET[\s\S]*status = 'matched'/),
    ['provider-1', 'booking-1', 95_000, 9_500, 104_500, 5_000],
  );
  expect(dbQueryMock).not.toHaveBeenCalledWith(
    expect.stringMatching(/UPDATE bookings/),
    expect.anything(),
  );
  expect(appendPricingTermsMock).toHaveBeenCalledWith(
    expect.objectContaining({ query: transactionQueryMock }),
    expect.objectContaining({
      bookingId: 'booking-1',
      event: 'booking_priced',
      sourceEventId: 'direct-assignment:provider-1',
      metadata: expect.objectContaining({ sukiDiscountCentavos: 5_000 }),
    }),
  );
  expect(notifyProviderMock).toHaveBeenCalledWith(
    'provider-user-1',
    'booking-1',
    'Deep cleaning for a two-bedroom home',
    104_500,
    'Cebu City',
  );
  expect(notifyCustomerMock).toHaveBeenCalledWith(
    'customer-1',
    'booking-1',
    'Provider One',
  );
  expect(mockEventOrder).toEqual([
    'transaction-start',
    'booking-update',
    'financial-terms',
    'transaction-commit',
    'provider-notification',
    'customer-notification',
  ]);
});
