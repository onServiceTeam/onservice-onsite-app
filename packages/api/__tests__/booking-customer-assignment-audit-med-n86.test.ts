import express from 'express';
import request from 'supertest';

const mockDbQuery = jest.fn();
const mockTransaction = jest.fn();
const mockTransactionQuery = jest.fn();
const mockGetBookingByIdAdmin = jest.fn();
const mockHasBookingConflict = jest.fn();
const mockCalculateSukiDiscount = jest.fn();
const mockNotifyProvider = jest.fn();
const mockNotifyCustomer = jest.fn();
const mockLogSecurityEvent = jest.fn();
let mockActor = { userId: 'customer-med-n86', role: 'customer' };

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      ...mockActor,
      iat: 0,
      exp: 0,
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...args: unknown[]) => mockGetBookingByIdAdmin(...args),
  calculateServiceFee: jest.fn(),
}));

jest.mock('../src/services/matching.service', () => ({
  hasBookingConflict: (...args: unknown[]) => mockHasBookingConflict(...args),
}));

jest.mock('../src/services/suki.service', () => ({
  calculateSukiDiscountForBooking: (...args: unknown[]) => mockCalculateSukiDiscount(...args),
}));

jest.mock('../src/services/notification.service', () => ({
  notifyProviderNewJob: (...args: unknown[]) => mockNotifyProvider(...args),
  notifyCustomerProviderAssigned: (...args: unknown[]) => mockNotifyCustomer(...args),
}));

jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: jest.fn(),
  appendProviderAssignmentTermsInTransaction: jest.fn(),
}));

jest.mock('../src/services/security.service', () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

const booking = {
  id: 'booking-med-n86',
  customer_id: 'customer-med-n86',
  provider_id: null,
  status: 'requested',
  escrow_status: null,
  service_price: 100_000,
  service_fee: 10_000,
  total_amount: 110_000,
  description: 'Deep cleaning for a two-bedroom home',
  city: 'Cebu City',
  scheduled_at: new Date('2026-09-02T02:00:00.000Z'),
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActor = { userId: 'customer-med-n86', role: 'customer' };
  mockGetBookingByIdAdmin.mockResolvedValue(booking);
  mockDbQuery.mockResolvedValue({
    rows: [{
      id: 'provider-med-n86',
      user_id: 'provider-user-med-n86',
      business_name: 'Provider MED-N86',
    }],
    rowCount: 1,
  });
  mockHasBookingConflict.mockResolvedValue(false);
  mockCalculateSukiDiscount.mockResolvedValue({ discountAmount: 0 });
  mockTransactionQuery.mockImplementation(async (sql: string) => (
    sql.includes('FOR UPDATE')
      ? { rows: [booking], rowCount: 1 }
      : { rows: [], rowCount: 1 }
  ));
  mockTransaction.mockImplementation(async (
    callback: (client: { query: typeof mockTransactionQuery }) => Promise<unknown>,
  ) => callback({ query: mockTransactionQuery }));
  mockNotifyProvider.mockResolvedValue(undefined);
  mockNotifyCustomer.mockResolvedValue(undefined);
  mockLogSecurityEvent.mockResolvedValue(undefined);
});

it('MED-N86 - customer direct assignment is audited without making audit availability part of booking availability', async () => {
  const app = buildApp();

  const customerAssignment = await request(app)
    .post('/bookings/booking-med-n86/assign')
    .send({ providerId: 'provider-med-n86' });

  expect(customerAssignment.status).toBe(200);
  expect(mockLogSecurityEvent).toHaveBeenCalledWith({
    userId: 'customer-med-n86',
    eventType: 'suspicious_activity',
    metadata: {
      kind: 'customer_self_assigned_provider',
      bookingId: 'booking-med-n86',
      providerId: 'provider-med-n86',
    },
  });

  mockLogSecurityEvent.mockRejectedValueOnce(new Error('security audit temporarily unavailable'));
  const assignmentDuringAuditOutage = await request(app)
    .post('/bookings/booking-med-n86/assign')
    .send({ providerId: 'provider-med-n86' });

  expect(assignmentDuringAuditOutage.status).toBe(200);
  expect(mockTransaction).toHaveBeenCalledTimes(2);

  mockActor = { userId: 'admin-med-n86', role: 'admin' };
  const adminAssignment = await request(app)
    .post('/bookings/booking-med-n86/assign')
    .send({ providerId: 'provider-med-n86' });

  expect(adminAssignment.status).toBe(200);
  expect(mockLogSecurityEvent).toHaveBeenCalledTimes(2);
  expect(mockTransaction).toHaveBeenCalledTimes(3);
});
