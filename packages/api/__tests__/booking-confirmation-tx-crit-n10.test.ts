import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const transitionBookingStatusMock = jest.fn();
const releaseEscrowInTransactionMock = jest.fn();
const issueORMock = jest.fn();
const creditReferrerMock = jest.fn();
const recordSukiMock = jest.fn();
const notifyBookingStatusChangeMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'customer-1', role: 'customer', iat: 0, exp: 0,
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
  transitionBookingStatus: (...args: unknown[]) => transitionBookingStatusMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({
  releaseEscrowInTransaction: (...args: unknown[]) => releaseEscrowInTransactionMock(...args),
}));
jest.mock('../src/services/or.service', () => ({
  issueOR: (...args: unknown[]) => issueORMock(...args),
}));
jest.mock('../src/services/referral.service', () => ({
  creditReferrerAfterBooking: (...args: unknown[]) => creditReferrerMock(...args),
}));
jest.mock('../src/services/suki.service', () => ({
  recordBookingForSuki: (...args: unknown[]) => recordSukiMock(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  notifyBookingStatusChange: (...args: unknown[]) => notifyBookingStatusChangeMock(...args),
}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

interface LedgerState {
  bookingStatus: string;
  escrowStatus: string;
}

function bookingFixture(status: string): Record<string, unknown> {
  return {
    id: 'booking-crit-n10',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    category_id: 'category-1',
    subcategory_id: null,
    booking_type: 'fixed_price',
    status,
    escrow_status: 'held',
    service_price: 10000,
    service_fee: 1000,
    total_amount: 11000,
    description: 'Repair the leaking kitchen pipe.',
    address: 'Cebu City',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: '10.31570000',
    longitude: '123.88540000',
    scheduled_at: new Date('2026-08-25T08:00:00.000Z'),
    completed_at: new Date('2026-08-25T10:00:00.000Z'),
    confirmed_at: new Date('2026-08-25T10:05:00.000Z'),
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
    created_at: new Date('2026-08-24T08:00:00.000Z'),
    updated_at: new Date('2026-08-25T10:05:00.000Z'),
  };
}

function createApp(): express.Express {
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

it('CRIT-N10 - customer confirmation commits escrow release and payout-ready together or rolls both back', async () => {
  const events: string[] = [];
  const state: LedgerState = { bookingStatus: 'completed_by_provider', escrowStatus: 'held' };
  let failPayoutWrite = false;

  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT status, escrow_status')) {
      return {
        rows: [{
          status: state.bookingStatus,
          escrow_status: state.escrowStatus,
          latitude: '10.31570000',
          longitude: '123.88540000',
          is_hourly: false,
          work_started_at: new Date('2026-08-25T08:00:00.000Z'),
          updated_at: new Date('2026-08-25T08:00:00.000Z'),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('SELECT user_id FROM providers')) {
      return { rows: [{ user_id: 'provider-user-1' }], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  transitionBookingStatusMock.mockImplementation(async (
    _bookingId: string,
    _userId: string,
    _role: string,
    newStatus: string,
  ) => {
    state.bookingStatus = newStatus;
    events.push(`booking:${newStatus}`);
    return bookingFixture(newStatus);
  });

  releaseEscrowInTransactionMock.mockImplementation(async (client: unknown) => {
    events.push('escrow:release');
    state.escrowStatus = 'released';
    return {
      commissionAmount: 1500,
      serviceFeeAmount: 1000,
      providerReceives: 8500,
      platformRetains: 2500,
      transactionClient: client,
    };
  });

  transactionMock.mockImplementation(async (
    callback: (client: { query: jest.Mock }) => Promise<unknown>,
  ) => {
    const snapshot = { ...state };
    const client = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        events.push('booking:payout-write');
        expect(sql).toContain("status = 'payout_ready'");
        expect(params).toEqual(['booking-crit-n10']);
        state.bookingStatus = 'payout_ready';
        if (failPayoutWrite) throw new Error('simulated payout-ready write failure');
        return { rows: [], rowCount: 1 };
      }),
    };
    events.push('transaction:start');
    try {
      const result = await callback(client);
      expect(releaseEscrowInTransactionMock).toHaveBeenLastCalledWith(
        client,
        'booking-crit-n10',
      );
      events.push('transaction:commit');
      return result;
    } catch (error) {
      Object.assign(state, snapshot);
      events.push('transaction:rollback');
      throw error;
    }
  });

  issueORMock.mockImplementation(async () => {
    events.push('or:failed');
    throw new Error('simulated receipt service outage');
  });
  creditReferrerMock.mockImplementation(async () => events.push('referral:credit'));
  recordSukiMock.mockImplementation(async () => events.push('suki:record'));
  notifyBookingStatusChangeMock.mockImplementation(async () => events.push('provider:notify'));

  const app = createApp();
  const committed = await request(app)
    .patch('/bookings/booking-crit-n10/status')
    .send({ status: 'confirmed' });

  expect(committed.status).toBe(200);
  expect(state).toEqual({ bookingStatus: 'payout_ready', escrowStatus: 'released' });
  expect(events).toEqual([
    'booking:confirmed',
    'transaction:start',
    'escrow:release',
    'booking:payout-write',
    'transaction:commit',
    'or:failed',
    'referral:credit',
    'suki:record',
    'provider:notify',
  ]);

  state.bookingStatus = 'completed_by_provider';
  state.escrowStatus = 'held';
  events.length = 0;
  failPayoutWrite = true;
  issueORMock.mockClear();
  creditReferrerMock.mockClear();
  recordSukiMock.mockClear();
  notifyBookingStatusChangeMock.mockClear();

  const rolledBack = await request(app)
    .patch('/bookings/booking-crit-n10/status')
    .send({ status: 'confirmed' });

  expect(rolledBack.status).toBe(500);
  expect(rolledBack.body).toEqual({ error: 'simulated payout-ready write failure' });
  expect(state).toEqual({ bookingStatus: 'confirmed', escrowStatus: 'held' });
  expect(events).toEqual([
    'booking:confirmed',
    'transaction:start',
    'escrow:release',
    'booking:payout-write',
    'transaction:rollback',
  ]);
  expect(issueORMock).not.toHaveBeenCalled();
  expect(creditReferrerMock).not.toHaveBeenCalled();
  expect(recordSukiMock).not.toHaveBeenCalled();
  expect(notifyBookingStatusChangeMock).not.toHaveBeenCalled();
});
