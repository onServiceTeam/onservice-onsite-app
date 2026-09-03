import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();
const getBookingMock = jest.fn();
const calculateServiceFeeMock = jest.fn();
const calculateSukiDiscountMock = jest.fn();
const appendProviderTermsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'admin-ux-1014', role: 'super_admin', iat: 0, exp: 0,
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
  appendPricingTermsInTransaction: jest.fn(),
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

it('Bug UX-1014 — direct assignment preserves held customer money and fixes provider terms in the same transaction', async () => {
  const paidBooking = {
    id: 'booking-ux-1014', customer_id: 'customer-1', provider_id: null,
    status: 'paid', escrow_status: 'held', service_price: 100_000,
    service_fee: 0, total_amount: 100_000,
    description: 'Paid booking awaiting provider', city: 'Cebu City',
    scheduled_at: new Date('2026-09-03T02:00:00.000Z'),
  };
  getBookingMock
    .mockResolvedValueOnce(paidBooking)
    .mockResolvedValueOnce({ ...paidBooking, provider_id: 'provider-1' });
  dbQueryMock.mockResolvedValue({
    rows: [{ id: 'provider-1', user_id: 'provider-user-1', business_name: 'Provider One' }],
    rowCount: 1,
  });
  calculateSukiDiscountMock.mockResolvedValue({ discountAmount: 5_000 });
  transactionQueryMock.mockImplementation(async (sql: string) => (
    sql.includes('FOR UPDATE')
      ? { rows: [paidBooking], rowCount: 1 }
      : { rows: [], rowCount: 1 }
  ));
  transactionMock.mockImplementation(async (
    callback: (client: { query: typeof transactionQueryMock }) => Promise<unknown>,
  ) => callback({ query: transactionQueryMock }));
  appendProviderTermsMock.mockResolvedValue({ id: 'terms-2' });

  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => (
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' })
  ));

  const response = await request(app)
    .post('/bookings/booking-ux-1014/assign')
    .send({ providerId: 'provider-1' });

  expect(response.status).toBe(200);
  expect(calculateServiceFeeMock).not.toHaveBeenCalled();
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/SELECT customer_id, provider_id, status, escrow_status[\s\S]*FOR UPDATE/),
    ['booking-ux-1014'],
  );
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(
      /UPDATE bookings[\s\S]*SET provider_id = \$1[\s\S]*WHEN status IN \('requested', 'quoted'\) THEN 'matched'[\s\S]*ELSE status/,
    ),
    ['provider-1', 'booking-ux-1014'],
  );
  expect(appendProviderTermsMock).toHaveBeenCalledWith(
    expect.objectContaining({ query: transactionQueryMock }),
    expect.objectContaining({
      bookingId: 'booking-ux-1014',
      providerId: 'provider-1',
      event: 'provider_assigned',
      sourceEventId: 'direct-assignment:provider-1',
      metadata: expect.objectContaining({
        preservedAuthorizedAmounts: true,
        skippedSukiDiscountCentavos: 5_000,
      }),
    }),
  );
  const updateCallIndex = transactionQueryMock.mock.calls.findIndex(
    ([sql]) => /UPDATE bookings[\s\S]*SET provider_id = \$1/.test(String(sql)),
  );
  expect(updateCallIndex).toBeGreaterThanOrEqual(0);
  expect(transactionQueryMock.mock.invocationCallOrder[updateCallIndex]!).toBeLessThan(
    appendProviderTermsMock.mock.invocationCallOrder[0]!,
  );
});
