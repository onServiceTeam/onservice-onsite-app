// UX-302 regression, re-homed by SEC-089 (Claude Code, 2026-10-10).
// The minimum on-site timer moved from the PATCH route into
// transitionBookingStatus, where it now runs after the actor guard and reads
// the locked booking row. These tests exercise the real service function
// (with a mocked transaction client), and the real PATCH route over that real
// service, so a timer reintroduced in either place on updated_at would fail.
import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const checklistStatusMock = jest.fn();
const countAfterPhotosMock = jest.fn();
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
jest.mock('../src/services/notification.service', () => ({
  notifyBookingStatusChange: (...args: unknown[]) => notifyBookingStatusChangeMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));
jest.mock('../src/services/referral.service', () => ({}));
jest.mock('../src/services/suki.service', () => ({}));
jest.mock('../src/services/settings.service', () => ({}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/services/checklist.service', () => ({
  getChecklistCompletionStatus: (...args: unknown[]) => checklistStatusMock(...args),
}));
jest.mock('../src/services/booking-photo.service', () => ({
  countAfterPhotos: (...args: unknown[]) => countAfterPhotosMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: jest.fn(),
  ADMIN_EVENTS: { BOOKING_STATUS_CHANGED: 'booking:status_changed' },
}));
jest.mock('../src/services/slot-waitlist.service', () => ({
  processSlotAvailability: jest.fn(() => Promise.resolve()),
}));

import { transitionBookingStatus } from '../src/services/booking.service';
import bookingRouter from '../src/routes/booking.routes';

const BOOKING_ID = 'booking-1';
const PROVIDER_ID = 'provider-1';
const PROVIDER_USER_ID = 'provider-user-1';

function lockedBooking(workStartedAt: Date, updatedAt: Date) {
  return {
    id: BOOKING_ID, customer_id: 'customer-1', provider_id: PROVIDER_ID, category_id: 'category-1',
    city: 'Cebu City', status: 'in_progress', escrow_status: 'held',
    latitude: '10.31570000', longitude: '123.88540000',
    scheduled_at: new Date('2026-08-25T08:00:00.000Z'),
    work_started_at: workStartedAt, updated_at: updatedAt,
  };
}

function useLockedBooking(row: ReturnType<typeof lockedBooking>): jest.Mock {
  const clientQuery = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT * FROM bookings WHERE id = $1 FOR UPDATE')) return { rows: [row], rowCount: 1 };
    if (sql.startsWith('UPDATE bookings')) return { rows: [{ ...row, status: 'completed_by_provider' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => unknown) => cb({ query: clientQuery }));
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id FROM providers WHERE id')) return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
    // The PATCH route's pre-read for its post-transition money steps.
    if (sql.includes('SELECT status, escrow_status, is_hourly FROM bookings')) {
      return { rows: [{ status: row.status, escrow_status: row.escrow_status, is_hourly: false }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  checklistStatusMock.mockResolvedValue({
    totalRequired: 3, completedRequired: 3, isFullyComplete: true, checklistShown: true,
  });
  countAfterPhotosMock.mockResolvedValue(2);
  return clientQuery;
}

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  checklistStatusMock.mockReset();
  countAfterPhotosMock.mockReset();
  notifyBookingStatusChangeMock.mockReset();
});

it('Bug UX-302 — saving proof does not restart the server-clocked minimum on-site timer', async () => {
  // Work started an hour ago; a proof upload just changed updated_at. The
  // timer must use work_started_at and therefore allow completion.
  const clientQuery = useLockedBooking(lockedBooking(new Date(Date.now() - 60 * 60 * 1000), new Date()));

  const result = await transitionBookingStatus(BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider');

  expect(result.status).toBe('completed_by_provider');
  expect(clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE bookings'))).toBe(true);
  expect(checklistStatusMock).toHaveBeenCalledWith(BOOKING_ID);
  expect(countAfterPhotosMock).toHaveBeenCalledWith(BOOKING_ID);
});

it('the minimum on-site timer reads the work start marker, not the last evidence update', async () => {
  // The inverse: evidence was last saved two hours ago, but work started one
  // minute ago. Completion must wait for the server-clocked start, not pass
  // on the old updated_at.
  const clientQuery = useLockedBooking(
    lockedBooking(new Date(Date.now() - 60 * 1000), new Date(Date.now() - 2 * 60 * 60 * 1000)),
  );

  await expect(
    transitionBookingStatus(BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider'),
  ).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringMatching(
      /^You must be on-site for at least 15 minutes before marking the job complete\. Please wait 14 more minute\(s\)\.$/,
    ),
  });
  expect(clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE bookings'))).toBe(false);
  expect(checklistStatusMock).not.toHaveBeenCalled();
  expect(countAfterPhotosMock).not.toHaveBeenCalled();
});

it('the PATCH route completes a job whose proof upload just changed updated_at', async () => {
  // Route-level guard for the original UX-302 symptom: the route itself must
  // not restart the timer from updated_at. Real router, real service, mocked
  // database and gates. Work started an hour ago; proof was saved just now.
  const clientQuery = useLockedBooking(lockedBooking(new Date(Date.now() - 60 * 60 * 1000), new Date()));
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
    .patch(`/bookings/${BOOKING_ID}/status`)
    .send({ status: 'completed_by_provider' });

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: BOOKING_ID, status: 'completed_by_provider' });
  expect(clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE bookings'))).toBe(true);
  expect(notifyBookingStatusChangeMock).toHaveBeenCalledWith('customer-1', BOOKING_ID, 'completed_by_provider');
});
