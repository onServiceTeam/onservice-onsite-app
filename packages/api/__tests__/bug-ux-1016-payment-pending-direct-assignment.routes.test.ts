import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();
const getBookingMock = jest.fn();
const calculateServiceFeeMock = jest.fn();
const calculateSukiDiscountMock = jest.fn();
const appendPricingTermsMock = jest.fn();
const appendProviderTermsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'admin-ux-1016', role: 'super_admin', iat: 0, exp: 0,
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
  calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args),
}));
jest.mock('../src/services/matching.service', () => ({
  hasBookingConflict: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/services/suki.service', () => ({
  calculateSukiDiscountForBooking: (...args: unknown[]) => calculateSukiDiscountMock(...args),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: (...args: unknown[]) => appendPricingTermsMock(...args),
  appendProviderAssignmentTermsInTransaction: (...args: unknown[]) => appendProviderTermsMock(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  notifyProviderNewJob: jest.fn().mockResolvedValue(undefined),
  notifyCustomerProviderAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('Bug UX-1016 — direct assignment preserves an in-flight payment amount and payment_pending status', async () => {
  const booking = {
    id: 'booking-ux-1016', customer_id: 'customer-1', provider_id: null,
    status: 'payment_pending', escrow_status: 'pending', service_price: 100_000,
    service_fee: 10_000, total_amount: 110_000,
    description: 'Payment pending provider selection', city: 'Cebu City',
    scheduled_at: new Date('2026-09-03T02:00:00.000Z'),
  };
  getBookingMock
    .mockResolvedValueOnce(booking)
    .mockResolvedValueOnce({ ...booking, provider_id: 'provider-1' });
  dbQueryMock.mockResolvedValue({
    rows: [{ id: 'provider-1', user_id: 'provider-user-1', business_name: 'Provider One' }],
    rowCount: 1,
  });
  calculateSukiDiscountMock.mockResolvedValue({ discountAmount: 5_000 });
  transactionQueryMock.mockImplementation(async (sql: string) => (
    sql.includes('FOR UPDATE')
      ? {
        rows: [{
          ...booking,
          service_price: '100000',
          total_amount: '110000',
        }],
        rowCount: 1,
      }
      : { rows: [], rowCount: 1 }
  ));
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
    .post('/bookings/booking-ux-1016/assign')
    .send({ providerId: 'provider-1' });

  expect(response.status).toBe(200);
  expect(calculateServiceFeeMock).not.toHaveBeenCalled();
  const assignmentUpdate = transactionQueryMock.mock.calls.find(
    ([sql]) => String(sql).includes('UPDATE bookings'),
  );
  expect(assignmentUpdate).toBeDefined();
  expect(String(assignmentUpdate?.[0])).toMatch(
    /WHEN status IN \('requested', 'quoted'\) THEN 'matched'[\s\S]*ELSE status/,
  );
  expect(String(assignmentUpdate?.[0])).not.toContain('service_price =');
  expect(assignmentUpdate?.[1]).toEqual(['provider-1', 'booking-ux-1016']);
  expect(appendPricingTermsMock).not.toHaveBeenCalled();
  expect(appendProviderTermsMock).not.toHaveBeenCalled();
});
