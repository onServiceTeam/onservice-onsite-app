// Phase 14 Dispatch 07 — Bug 463 + 1220.
// Server-side enforcement of provider job-completion preconditions:
//   1. Checklist must have been opened (booking_checklists row exists)
//   2. All required checklist items must be completed (Bug 463)
//   3. At least 2 'after' photos must be uploaded (Bug 1220)
//
// transitionBookingStatus(bookingId, userId, role, 'completed_by_provider')
// must reject with 400 if any precondition fails.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const checklistStatusMock = jest.fn();
jest.mock('../../src/services/checklist.service', () => ({
  getChecklistCompletionStatus: (...args: unknown[]) => checklistStatusMock(...args),
}));

const countAfterPhotosMock = jest.fn();
jest.mock('../../src/services/booking-photo.service', () => ({
  countAfterPhotos: (...args: unknown[]) => countAfterPhotosMock(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/socket.service', () => ({
  emitAdminEvent: jest.fn(),
  ADMIN_EVENTS: {
    BOOKING_STATUS_CHANGED: 'booking:status_changed',
  },
}));

jest.mock('../../src/services/slot-waitlist.service', () => ({
  processSlotAvailability: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/notification.service', () => ({
  createNotification: jest.fn(),
}));

import { transitionBookingStatus } from '../../src/services/booking.service';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const PROVIDER_USER_ID = '22222222-2222-2222-2222-222222222222';
const PROVIDER_ID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  checklistStatusMock.mockReset();
  countAfterPhotosMock.mockReset();
});

function setupTransactionMock(captureBookingRow: {
  id: string;
  status: string;
  provider_id: string;
  customer_id: string;
  category_id: string;
  city: string;
  scheduled_at: Date;
}, finalRow?: Record<string, unknown>) {
  dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => unknown) => {
    const clientQuery = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM bookings WHERE id = $1 FOR UPDATE')) {
        return { rows: [captureBookingRow], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE bookings')) {
        return { rows: [finalRow ?? { ...captureBookingRow, status: 'completed_by_provider' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    return cb({ query: clientQuery as unknown as jest.Mock });
  });
}

describe('Bug 463 + 1220 — completed_by_provider enforcement', () => {
  const happyBooking = {
    id: BOOKING_ID,
    status: 'in_progress',
    provider_id: PROVIDER_ID,
    customer_id: 'cust-1',
    category_id: 'cat-1',
    city: 'Boracay',
    scheduled_at: new Date('2026-04-30T08:00:00Z'),
  };

  it('rejects 400 when checklist was never opened (Bug 463)', async () => {
    setupTransactionMock(happyBooking);
    // validateRoleForTransition uses provider_user_id check — stub the
    // booking.provider_id → providers.user_id resolution that lives in
    // the global db.query path before the transaction.
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM providers WHERE id')) {
        return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    checklistStatusMock.mockResolvedValue({
      totalRequired: 0, completedRequired: 0, isFullyComplete: false, checklistShown: false,
    });

    await expect(
      transitionBookingStatus(BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider'),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(countAfterPhotosMock).not.toHaveBeenCalled();
  });

  it('rejects 400 when checklist incomplete (Bug 463)', async () => {
    setupTransactionMock(happyBooking);
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM providers WHERE id')) {
        return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    checklistStatusMock.mockResolvedValue({
      totalRequired: 5, completedRequired: 3, isFullyComplete: false, checklistShown: true,
    });

    await expect(
      transitionBookingStatus(BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider'),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(countAfterPhotosMock).not.toHaveBeenCalled();
  });

  it('rejects 400 when fewer than 2 after-photos uploaded (Bug 1220)', async () => {
    setupTransactionMock(happyBooking);
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM providers WHERE id')) {
        return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    checklistStatusMock.mockResolvedValue({
      totalRequired: 5, completedRequired: 5, isFullyComplete: true, checklistShown: true,
    });
    countAfterPhotosMock.mockResolvedValue(1);

    await expect(
      transitionBookingStatus(BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: checklist complete + ≥2 after-photos → status updates to completed_by_provider', async () => {
    setupTransactionMock(happyBooking);
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM providers WHERE id')) {
        return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    checklistStatusMock.mockResolvedValue({
      totalRequired: 5, completedRequired: 5, isFullyComplete: true, checklistShown: true,
    });
    countAfterPhotosMock.mockResolvedValue(2);

    const result = await transitionBookingStatus(
      BOOKING_ID, PROVIDER_USER_ID, 'provider', 'completed_by_provider',
    );
    expect(result.status).toBe('completed_by_provider');

    expect(checklistStatusMock).toHaveBeenCalledWith(BOOKING_ID);
    expect(countAfterPhotosMock).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('does NOT enforce checklist for non-completion transitions', async () => {
    setupTransactionMock(
      { ...happyBooking, status: 'paid' },
      { ...happyBooking, status: 'provider_en_route' },
    );
    dbQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT user_id FROM providers WHERE id')) {
        return { rows: [{ user_id: PROVIDER_USER_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await transitionBookingStatus(
      BOOKING_ID, PROVIDER_USER_ID, 'provider', 'provider_en_route',
    );

    expect(checklistStatusMock).not.toHaveBeenCalled();
    expect(countAfterPhotosMock).not.toHaveBeenCalled();
  });
});
