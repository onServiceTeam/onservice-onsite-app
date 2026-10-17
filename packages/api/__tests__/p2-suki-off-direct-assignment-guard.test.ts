// Guard for the Suki off switch (customer review 2026-10-17, slice P2, fix
// round; D41 Q33 option a). CR-263 and CR-264 cover acceptQuote and the
// confirm preview. This covers the third place a Suki discount could be taken:
// assigning a Service Provider directly to a fixed-price booking. With Suki
// off, the booking keeps its catalog price, no Suki discount is stored and no
// new pricing record is written. The second half turns the switch on in the
// synthetic settings row and shows the same request would take a 5% Suki
// discount, so the first half is about the switch and not the setup.
// This is a coverage guard, not a bug fix: the code already behaved this way.
//
// The real booking router, the real Suki service and the real settings
// service run. The database answers are synthetic: the booking is ₱1,500.00,
// the customer is at the Suki tier with this Service Provider, and the
// settings rows say what each half needs.
import express from 'express';
import request from 'supertest';

const mockDbQuery = jest.fn();
const mockTransactionQuery = jest.fn();
const mockGetBookingByIdAdmin = jest.fn();
const mockAppendPricingTerms = jest.fn();
let sukiSwitch = 'false';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-p2-suki', role: 'admin', iat: 0, exp: 0 };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: async (callback: (client: { query: typeof mockTransactionQuery }) => Promise<unknown>) =>
      callback({ query: mockTransactionQuery }),
  },
}));
jest.mock('../src/services/booking.service', () => ({
  getBookingByIdAdmin: (...args: unknown[]) => mockGetBookingByIdAdmin(...args),
  calculateServiceFee: jest.fn(async (price: number) => Math.round(price * 0.1)),
}));
jest.mock('../src/services/matching.service', () => ({ hasBookingConflict: jest.fn().mockResolvedValue(false) }));
jest.mock('../src/services/notification.service', () => ({
  notifyProviderNewJob: jest.fn().mockResolvedValue(undefined),
  notifyCustomerProviderAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: (...args: unknown[]) => mockAppendPricingTerms(...args),
  appendProviderAssignmentTermsInTransaction: jest.fn(),
}));
jest.mock('../src/services/security.service', () => ({ logSecurityEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const bookingId = 'c5000000-0000-4000-8000-0000000002a0';
const providerId = 'c3000000-0000-4000-8000-000000000011';
const customerId = 'c2000000-0000-4000-8000-000000000001';
const booking = {
  id: bookingId,
  customer_id: customerId,
  provider_id: null,
  booking_type: 'fixed_price',
  status: 'requested',
  escrow_status: null,
  service_price: '150000',
  service_fee: '15000',
  total_amount: '165000',
  description: 'Deep clean of a two-bedroom condo unit.',
  city: 'Cebu City',
  scheduled_at: new Date('2026-10-21T01:00:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBookingByIdAdmin.mockResolvedValue(booking);
  mockAppendPricingTerms.mockResolvedValue({ id: 'terms-p2-suki' });
  mockDbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM platform_settings WHERE key = $1')) {
      return params?.[0] === 'suki_program_enabled' ? { rows: [{ value: sukiSwitch }] } : { rows: [] };
    }
    if (sql.includes('FROM suki_memberships')) return { rows: [{ tier: 'suki' }] };
    if (sql.includes('FROM providers WHERE id = $1')) {
      return { rows: [{ id: providerId, user_id: 'c2000000-0000-4000-8000-000000000011', business_name: 'Linis Pro Cleaning Services' }] };
    }
    throw new Error(`Unexpected query in the Suki guard: ${sql.slice(0, 80)}`);
  });
  mockTransactionQuery.mockImplementation(async (sql: string) => (
    sql.includes('FOR UPDATE') ? { rows: [booking], rowCount: 1 } : { rows: [], rowCount: 1 }
  ));
});

async function assign(): Promise<{ status: number; updates: Array<{ sql: string; params: unknown[] }> }> {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);
  const response = await request(app).post(`/api/v1/bookings/${bookingId}/assign`).send({ providerId });
  const updates = mockTransactionQuery.mock.calls
    .filter(([sql]) => /UPDATE bookings/.test(String(sql)))
    .map(([sql, params]) => ({ sql: String(sql), params: params as unknown[] }));
  return { status: response.status, updates };
}

it('Suki off guard — a direct Service Provider assignment keeps the catalog price for a Suki-tier customer', async () => {
  sukiSwitch = 'false';
  const off = await assign();
  expect(off.status).toBe(200);
  expect(off.updates).toHaveLength(1);
  // The price-keeping update: provider and status only, no price, fee, total or suki_discount.
  expect(off.updates[0]!.sql).not.toMatch(/service_price|service_fee|total_amount|suki_discount/);
  expect(off.updates[0]!.params).toEqual([providerId, bookingId]);
  expect(mockAppendPricingTerms).not.toHaveBeenCalled();

  // Switch on (synthetic row only): the same assignment takes 5% off ₱1,500.00.
  jest.clearAllMocks();
  sukiSwitch = 'true';
  const on = await assign();
  expect(on.status).toBe(200);
  expect(on.updates).toHaveLength(1);
  expect(on.updates[0]!.sql).toMatch(/suki_discount = \$6/);
  expect(on.updates[0]!.params).toEqual([providerId, bookingId, 142500, 14250, 156750, 7500]);
  expect(mockAppendPricingTerms).toHaveBeenCalledTimes(1);
});
