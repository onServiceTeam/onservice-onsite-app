import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();
const handleCancellationInTransactionMock = jest.fn();
const createPushNotificationMock = jest.fn();
const getBookingByIdAdminMock = jest.fn();
const mockEventOrder: string[] = [];
const mockTransactionClient = { query: transactionQueryMock };

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'provider-user-1',
      role: 'provider',
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
}));

jest.mock('../src/services/escrow.service', () => ({
  handleCancellationInTransaction: (...args: unknown[]) => handleCancellationInTransactionMock(...args),
}));

jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
}));

jest.mock('../src/services/settings.service', () => ({
  getProviderNoShowMinutes: jest.fn(async () => 15),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('MED-N88 — no-show cancellation and escrow share one transaction before its non-fatal customer push', async () => {
  const booking = {
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    status: 'provider_arrived',
    escrow_status: 'held',
    scheduled_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [booking], rowCount: 1 });
  getBookingByIdAdminMock.mockResolvedValue({ ...booking, status: 'cancelled_by_customer' });
  transactionQueryMock.mockImplementation(async () => {
    mockEventOrder.push('booking-update');
    return { rows: [], rowCount: 1 };
  });
  handleCancellationInTransactionMock.mockImplementation(async () => {
    mockEventOrder.push('escrow-cancellation');
  });
  transactionMock.mockImplementation(async (
    callback: (client: typeof mockTransactionClient) => Promise<unknown>,
  ) => {
    mockEventOrder.push('transaction-start');
    const result = await callback(mockTransactionClient);
    mockEventOrder.push('transaction-commit');
    return result;
  });
  createPushNotificationMock.mockImplementation(async () => {
    mockEventOrder.push('customer-push');
    throw new Error('push transport unavailable');
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

  const response = await request(app).post('/bookings/booking-1/report-no-show');

  expect(response.status).toBe(200);
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/status = 'cancelled_by_customer'/),
    [expect.stringMatching(/Customer no-show/), 'booking-1'],
  );
  expect(handleCancellationInTransactionMock).toHaveBeenCalledWith(
    mockTransactionClient,
    'booking-1',
    -1,
    true,
    true,
  );
  expect(createPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'customer-1',
    type: 'customer_cancelled',
    data: { bookingId: 'booking-1' },
  }));
  expect(mockEventOrder).toEqual([
    'transaction-start',
    'booking-update',
    'escrow-cancellation',
    'transaction-commit',
    'customer-push',
  ]);
});
