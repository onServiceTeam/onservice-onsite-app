/**
 * Phase 07 — unit tests for booking-admin and dispute-admin services.
 *
 * Mirrors the hermetic pattern of customer-admin.test.ts: db.query and
 * db.transaction are fully mocked, escrow.service and dispute.service are
 * mocked at module level. No real SQL, no integration, no real money math.
 *
 * Sacred-file note: money-mutating delegations (releaseEscrow,
 * refundFromEscrow, handleCancellation, resolveDispute) are asserted to
 * receive the EXACT inputs passed by the caller (no transformation), and
 * every admin write is asserted to emit the correct admin_actions row.
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/services/escrow.service', () => ({
  releaseEscrow: jest.fn(),
  refundFromEscrow: jest.fn(),
  handleCancellation: jest.fn(),
  // Phase 14 Dispatch 06 — trx-aware helpers used by D06-wrapped callers.
  releaseEscrowInTransaction: jest.fn(),
  refundFromEscrowInTransaction: jest.fn(),
  handleCancellationInTransaction: jest.fn(),
  processCancellationGatewayRefund: jest.fn(),
}));

// S1-8: the admin cancel kicks the slot waitlist after its commit; keep that
// away from the mocked database here.
jest.mock('../src/services/slot-waitlist.service', () => ({
  processSlotAvailability: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/dispute.service', () => ({
  resolveDispute: jest.fn(),
  resolveDisputeInTransaction: jest.fn(),
  assertDisputeResolutionAvailable: jest.fn(),
  assignDispute: jest.fn(),
  escalateDispute: jest.fn(),
}));

jest.mock('../src/services/or.service', () => ({
  issueOR: jest.fn(),
}));

jest.mock('../src/services/payment.service', () => ({
  processRefund: jest.fn(),
}));

const createPushNotificationMock = jest.fn();
const deliverStoredNotificationPushMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
  deliverStoredNotificationPush: (...args: unknown[]) => deliverStoredNotificationPushMock(...args),
}));

const emitAdminEventMock = jest.fn();
jest.mock('../src/services/socket.service', () => ({
  ADMIN_EVENTS: { BOOKING_PROVIDER_ASSIGNED: 'booking:provider_assigned', BOOKING_STATUS_CHANGED: 'booking:status_changed' },
  emitAdminEvent: (...args: unknown[]) => emitAdminEventMock(...args),
  emitToConversation: jest.fn(),
  emitToUser: jest.fn(),
}));

const appendProviderAssignmentTermsMock = jest.fn();
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendProviderAssignmentTermsInTransaction: (...args: unknown[]) =>
    appendProviderAssignmentTermsMock(...args),
}));

import * as bookingSvc from '../src/services/booking-admin.service';
import * as disputeAdminSvc from '../src/services/dispute-admin.service';
import * as escrowService from '../src/services/escrow.service';
import * as disputeService from '../src/services/dispute.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

interface TxCall {
  sql: string;
  params: unknown[];
}

type ClientQueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult<unknown>>;
type TxCallback = (client: { query: ClientQueryFn }) => Promise<unknown>;

function setupTxRecorder(
  handler: (sql: string, params: unknown[]) => Promise<QueryResult<unknown>>,
): TxCall[] {
  const calls: TxCall[] = [];
  dbTransactionMock.mockImplementationOnce(async (cb: TxCallback) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return handler(sql, params);
      }),
    };
    return cb(client);
  });
  return calls;
}

const escrowMocks = escrowService as jest.Mocked<typeof escrowService>;
const disputeMocks = disputeService as jest.Mocked<typeof disputeService>;

const BOOKING_ID = 'b0000000-0000-0000-0000-000000000001';
const PROVIDER_ID = 'p0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const DISPUTE_ID = 'd0000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';
const SUPPORT_TICKET_ID = '33333333-3333-4333-8333-333333333333';
const REFUND_REQUEST_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  escrowMocks.releaseEscrow.mockReset();
  escrowMocks.refundFromEscrow.mockReset();
  escrowMocks.handleCancellation.mockReset();
  escrowMocks.releaseEscrowInTransaction.mockReset();
  escrowMocks.refundFromEscrowInTransaction.mockReset();
  escrowMocks.handleCancellationInTransaction.mockReset();
  disputeMocks.resolveDispute.mockReset();
  disputeMocks.resolveDisputeInTransaction.mockReset();
  disputeMocks.assertDisputeResolutionAvailable.mockReset();
  disputeMocks.assignDispute.mockReset();
  disputeMocks.escalateDispute.mockReset();
  createPushNotificationMock.mockReset();
  createPushNotificationMock.mockResolvedValue({ id: 'notification-1' });
  deliverStoredNotificationPushMock.mockReset();
  deliverStoredNotificationPushMock.mockResolvedValue(undefined);
  emitAdminEventMock.mockReset();
  appendProviderAssignmentTermsMock.mockReset();
  appendProviderAssignmentTermsMock.mockResolvedValue(null);
});

// ─── booking-admin: getBookingDetail ────────────────────────────────────────

describe('getBookingDetail', () => {
  it('throws 404 when booking missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(bookingSvc.getBookingDetail(BOOKING_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns nested customer + provider + address shape', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: BOOKING_ID,
            status: 'confirmed',
            escrow_status: 'held',
            booking_type: 'fixed',
            scheduled_at: new Date('2024-05-01T08:00:00Z'),
            completed_at: null,
            confirmed_at: new Date('2024-05-01T10:00:00Z'),
            cancelled_at: null,
            cancellation_reason: null,
            service_price: '100000',
            service_fee: '10000',
            total_amount: '110000',
            address: '123 Main',
            barangay: 'BGC',
            city: 'Taguig',
            province: 'NCR',
            created_at: new Date('2024-04-30T00:00:00Z'),
            category_id: 'cat1',
            category_name: 'Plumbing',
            subcategory_id: null,
            subcategory_name: null,
            customer_id: CUSTOMER_ID,
            customer_first_name: 'Joe',
            customer_last_name: 'C',
            customer_phone: '+639170000000',
            customer_email: 'joe@x.com',
            customer_avatar: null,
            provider_id: PROVIDER_ID,
            provider_user_id: 'pu1',
            provider_business_name: 'Acme',
            provider_tier: 'verified',
            provider_rating: '4.50',
            provider_total_jobs: 12,
            provider_first_name: 'Pat',
            provider_last_name: 'P',
            provider_phone: '+639170000001',
            provider_avatar: null,
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ lifetime: '7', avg: '4.20' }]));
    const out = await bookingSvc.getBookingDetail(BOOKING_ID);
    expect(out.customer?.fullName).toBe('Joe C');
    expect(out.customer?.lifetimeBookings).toBe(7);
    expect(out.customer?.averageRatingGiven).toBe(4.2);
    expect(out.provider?.businessName).toBe('Acme');
    expect(out.provider?.rating).toBe(4.5);
    expect(out.address).toEqual({
      full: '123 Main',
      barangay: 'BGC',
      city: 'Taguig',
      province: 'NCR',
    });
    expect(out.totalAmount).toBe(110000);
  });
});

// ─── booking-admin: getBookingTimeline ──────────────────────────────────────

describe('getBookingTimeline', () => {
  it('throws 404 when booking missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(bookingSvc.getBookingTimeline(BOOKING_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns events sorted ascending including derived + admin_actions', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: BOOKING_ID,
            created_at: new Date('2024-01-01T00:00:00Z'),
            confirmed_at: new Date('2024-01-03T00:00:00Z'),
            completed_at: new Date('2024-01-02T00:00:00Z'),
            cancelled_at: null,
            cancellation_reason: null,
            customer_id: CUSTOMER_ID,
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'aa1',
            admin_id: ADMIN_ID,
            action_type: 'manual_escrow_release',
            reason: 'released',
            details: null,
            created_at: new Date('2024-01-04T00:00:00Z'),
            admin_first: 'A',
            admin_last: 'B',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ first_at: null, last_at: null, cnt: '0' }]));

    const events = await bookingSvc.getBookingTimeline(BOOKING_ID);
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'booking_created',
      'job_completed',
      'booking_confirmed',
      'manual_escrow_release',
    ]);
    expect(events[3].actor).toEqual({ kind: 'admin', id: ADMIN_ID, name: 'A B' });
  });

  it('emits booking_cancelled derived event when cancelled_at present', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: BOOKING_ID,
            created_at: new Date('2024-01-01T00:00:00Z'),
            confirmed_at: null,
            completed_at: null,
            cancelled_at: new Date('2024-01-05T00:00:00Z'),
            cancellation_reason: 'no show',
            customer_id: CUSTOMER_ID,
          },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ first_at: null, last_at: null, cnt: '0' }]));
    const events = await bookingSvc.getBookingTimeline(BOOKING_ID);
    expect(events.map((e) => e.type)).toEqual(['booking_created', 'booking_cancelled']);
    expect(events[1].description).toBe('no show');
  });
});

// ─── booking-admin: getBookingEvidence ──────────────────────────────────────

describe('getBookingEvidence', () => {
  it('throws 404 when booking missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(bookingSvc.getBookingEvidence(BOOKING_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns photos (UNION of legacy + new) + chat count; gpsCheckIns + receipts are empty arrays (MED-N08+N09)', async () => {
    // MED-N09: photos query is now ONE call (UNION ALL across
    // booking_images + booking_photos with normalized columns).
    // MED-N08: gps_checkins + receipts dead-code lookups removed
    // — function returns empty arrays for those fields.
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: 'pu1' }]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'img1',
            photo_url: 'https://x/a.jpg',
            photo_type: 'before',
            uploaded_by: CUSTOMER_ID,
            created_at: new Date('2024-01-01T00:00:00Z'),
          },
          {
            id: 'img2',
            photo_url: 'https://x/b.jpg',
            photo_type: 'after',
            uploaded_by: 'pu1',
            created_at: new Date('2024-01-02T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ cnt: '5' }]));

    const out = await bookingSvc.getBookingEvidence(BOOKING_ID);
    expect(out.photos).toHaveLength(2);
    expect(out.photos[0].uploadedBy).toBe('customer');
    expect(out.photos[1].uploadedBy).toBe('provider');
    expect(out.chatMessageCount).toBe(5);
    // MED-N08: gpsCheckIns + receipts are always empty arrays now.
    expect(out.gpsCheckIns).toEqual([]);
    expect(out.receipts).toEqual([]);
  });

  it('photos query SQL is a single UNION ALL across both tables (MED-N09)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: 'pu1' }]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ cnt: '0' }]));

    await bookingSvc.getBookingEvidence(BOOKING_ID);

    const photosCall = dbQueryMock.mock.calls[1]!;
    expect(photosCall[0]).toMatch(/FROM booking_images/);
    expect(photosCall[0]).toMatch(/FROM booking_photos/);
    expect(photosCall[0]).toMatch(/UNION ALL/);
    expect(photosCall[0]).toMatch(/deleted_at IS NULL/);
  });
});

// ─── booking-admin: getBookingDispute ───────────────────────────────────────

describe('getBookingDispute', () => {
  it('returns null when no dispute', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    const out = await bookingSvc.getBookingDispute(BOOKING_ID);
    expect(out).toBeNull();
  });

  it('returns full dispute shape when present', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: DISPUTE_ID,
          status: 'resolved',
          tier: 1,
          type: 'incomplete',
          description: 'half done',
          created_at: new Date('2024-01-01T00:00:00Z'),
          filed_by: CUSTOMER_ID,
          provider_response: 'I disagree',
          provider_responded_at: new Date('2024-01-02T00:00:00Z'),
          resolution_type: 'partial_refund',
          refund_amount: '5000',
          resolved_at: new Date('2024-01-03T00:00:00Z'),
        },
      ]),
    );
    const out = await bookingSvc.getBookingDispute(BOOKING_ID);
    expect(out).toMatchObject({
      id: DISPUTE_ID,
      status: 'resolved',
      tier: 1,
      type: 'incomplete',
      filedBy: CUSTOMER_ID,
      resolutionType: 'partial_refund',
      refundAmount: 5000,
    });
  });
});

// ─── booking-admin: manualReleaseEscrow ─────────────────────────────────────

describe('manualReleaseEscrow', () => {
  it('rejects empty reason with 400', async () => {
    await expect(
      bookingSvc.manualReleaseEscrow(BOOKING_ID, '   ', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects short (<10) reason with 400', async () => {
    await expect(
      bookingSvc.manualReleaseEscrow(BOOKING_ID, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: calls releaseEscrowInTransaction then INSERTs manual_escrow_release inside one transaction (Bug 70)', async () => {
    escrowMocks.releaseEscrowInTransaction.mockResolvedValueOnce({
      providerReceives: 80000,
      platformRetains: 20000,
      commissionAmount: 15000,
      serviceFeeAmount: 5000,
    } as unknown as Awaited<ReturnType<typeof escrowMocks.releaseEscrowInTransaction>>);
    const calls = setupTxRecorder(async (sql) => {
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-rel' }]);
      return rows([]);
    });
    const out = await bookingSvc.manualReleaseEscrow(
      BOOKING_ID,
      'Customer abandoned booking',
      ADMIN_ID,
    );
    // Phase 14 Dispatch 06 — Bug 70. Money work + audit are now in ONE
    // transaction via the trx-aware helper.
    expect(escrowMocks.releaseEscrowInTransaction).toHaveBeenCalledTimes(1);
    expect(escrowMocks.releaseEscrow).not.toHaveBeenCalled();
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("'manual_escrow_release'");
    expect(insert!.sql).toContain('full_notes');
    expect(out.adminActionId).toBe('aa-rel');
    expect(out.releasedAmount).toBe(100000);
  });

  it('propagates errors from releaseEscrowInTransaction (no audit row written)', async () => {
    escrowMocks.releaseEscrowInTransaction.mockRejectedValueOnce(new Error('escrow boom'));
    const calls = setupTxRecorder(async () => rows([]));
    await expect(
      bookingSvc.manualReleaseEscrow(BOOKING_ID, 'Customer abandoned booking', ADMIN_ID),
    ).rejects.toThrow('escrow boom');
    // No audit row was inserted — confirms abort happened before INSERT.
    expect(calls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });
});

// ─── booking-admin: refundBookingEscrow ─────────────────────────────────────

describe('refundBookingEscrow', () => {
  it('rejects refundAmount <= 0', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(
        BOOKING_ID, 0, 'A reasonable reason here', ADMIN_ID, SUPPORT_TICKET_ID, REFUND_REQUEST_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects non-integer refundAmount', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(
        BOOKING_ID, 12.5, 'A reasonable reason here', ADMIN_ID, SUPPORT_TICKET_ID, REFUND_REQUEST_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects short reason', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(
        BOOKING_ID, 5000, 'short', ADMIN_ID, SUPPORT_TICKET_ID, REFUND_REQUEST_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: delegates to refundFromEscrowInTransaction with EXACT amount + INSERTs refund_issued (Bug 71)', async () => {
    escrowMocks.refundFromEscrowInTransaction.mockResolvedValueOnce({
      remainingEscrowCentavos: 2223,
      paymentMethod: 'wallet',
      customerWalletCredited: true,
    });
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM support_tickets/.test(sql)) {
        return rows([{ id: SUPPORT_TICKET_ID, ticket_number: 'SUP-1001' }]);
      }
      if (/INSERT INTO gateway_retry_queue/.test(sql)) return rows([{ id: 'retry-ref' }]);
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-ref' }]);
      return rows([]);
    });
    const out = await bookingSvc.refundBookingEscrow(
      BOOKING_ID,
      7777,
      'Customer requested partial refund',
      ADMIN_ID,
      SUPPORT_TICKET_ID,
      REFUND_REQUEST_ID,
    );
    // Phase 14 Dispatch 06 — Bug 71. The trx-aware helper composes
    // atomically with the admin_actions audit row.
    expect(escrowMocks.refundFromEscrowInTransaction).toHaveBeenCalledTimes(1);
    expect(escrowMocks.refundFromEscrow).not.toHaveBeenCalled();
    const refundCall = escrowMocks.refundFromEscrowInTransaction.mock.calls[0]!;
    expect(typeof (refundCall[0] as { query?: unknown })?.query).toBe('function');
    expect(refundCall.slice(1)).toEqual([
      BOOKING_ID,
      7777,
      'Customer requested partial refund',
    ]);
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("'refund_issued'");
    expect(insert!.sql).toContain('full_notes');
    expect(out.refundedAmount).toBe(7777);
    expect(out.bookingId).toBe(BOOKING_ID);
    expect(out.adminActionId).toBe('aa-ref');
    expect(out.supportTicketId).toBe(SUPPORT_TICKET_ID);
    expect(out.remainingEscrowAmount).toBe(2223);
  });
});

// ─── booking-admin: reassignBookingProvider ─────────────────────────────────

describe('reassignBookingProvider', () => {
  it('rejects reason <5 chars with 400', async () => {
    await expect(
      bookingSvc.reassignBookingProvider(BOOKING_ID, PROVIDER_ID, 'no', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when new provider missing', async () => {
    setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{
          id: BOOKING_ID,
          status: 'confirmed_by_provider',
          provider_id: 'old',
          category_id: 'cat-1',
          subcategory_id: null,
          latitude: '10.3157',
          longitude: '123.8854',
        }]);
      }
      if (/FROM providers/.test(sql)) return rows([]);
      return rows([]);
    });
    await expect(
      bookingSvc.reassignBookingProvider(BOOKING_ID, PROVIDER_ID, 'valid reason', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when booking is in terminal/post-completion status', async () => {
    setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: BOOKING_ID, status: 'paid_out', provider_id: 'old' }]);
      }
      return rows([]);
    });
    await expect(
      bookingSvc.reassignBookingProvider(BOOKING_ID, PROVIDER_ID, 'valid reason', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('Bug UX-468 — reassignment moves booking, conversation, staff assignment, offers, notices, and audit together', async () => {
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{
          id: BOOKING_ID,
          status: 'requested',
          customer_id: CUSTOMER_ID,
          provider_id: 'old',
          performer_staff_id: 'old-staff',
          old_provider_user_id: 'old-provider-user',
          category_id: 'cat-1',
          subcategory_id: null,
          latitude: '10.3157',
          longitude: '123.8854',
        }]);
      }
      if (/FROM providers/.test(sql)) {
        return rows([{
          id: PROVIDER_ID,
          user_id: 'new-provider-user',
          status: 'approved',
          is_active: true,
          is_available: true,
          service_eligible: true,
          in_range: true,
        }]);
      }
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-ras' }]);
      return rows([]);
    });
    const out = await bookingSvc.reassignBookingProvider(
      BOOKING_ID,
      PROVIDER_ID,
      'valid reason',
      ADMIN_ID,
    );
    expect(out.newProviderId).toBe(PROVIDER_ID);
    expect(out.oldProviderId).toBe('old');
    const bookingUpdate = calls.find((c) => /UPDATE bookings[\s\S]*provider_id/.test(c.sql));
    expect(bookingUpdate?.sql).toContain('performer_staff_id = NULL');
    expect(calls.find((c) => /UPDATE conversations/.test(c.sql))).toBeDefined();
    expect(calls.find((c) => /UPDATE booking_offers/.test(c.sql))).toBeDefined();
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'booking_reassigned'");
    expect(appendProviderAssignmentTermsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        providerId: PROVIDER_ID,
        event: 'provider_reassigned',
        sourceEventId: 'aa-ras',
      }),
    );
    expect(createPushNotificationMock).toHaveBeenCalledTimes(3);
    expect(emitAdminEventMock).toHaveBeenCalledWith('booking:provider_assigned', {
      id: BOOKING_ID,
      oldProviderId: 'old',
      newProviderId: PROVIDER_ID,
    });
  });
});

// ─── booking-admin: cancelBookingAsAdmin ────────────────────────────────────

describe('cancelBookingAsAdmin', () => {
  it('rejects short reason (<10) with 400', async () => {
    await expect(
      bookingSvc.cancelBookingAsAdmin(BOOKING_ID, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when already cancelled', async () => {
    // S1-8: decided on the locked row inside the transaction.
    const calls = setupTxRecorder(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return rows([{ id: BOOKING_ID, status: 'cancelled_by_admin', escrow_status: null }]);
      return rows([]);
    });
    await expect(
      bookingSvc.cancelBookingAsAdmin(BOOKING_ID, 'A solid cancellation reason', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    // Only the lock ran: nothing was written.
    expect(calls).toHaveLength(1);
  });

  it('escrow held → calls handleCancellationInTransaction with passed args + records refundAmount (Bug 69)', async () => {
    // S1-8: the booking (including its service fee) is read from the locked
    // row inside the transaction; there is no top-level pre-read any more.
    const locked = {
      id: BOOKING_ID, status: 'paid', escrow_status: 'held', provider_id: null, service_fee: 0,
      scheduled_at: new Date('2026-10-20T02:00:00.000Z'), category_id: 'category-1', city: 'Cebu City',
    };
    escrowMocks.handleCancellationInTransaction.mockResolvedValueOnce({
      customerRefundAmount: 4242,
    } as unknown as Awaited<ReturnType<typeof escrowMocks.handleCancellationInTransaction>>);
    const calls = setupTxRecorder(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return rows([locked]);
      if (/UPDATE bookings SET/.test(sql)) return rows([{ ...locked, status: 'cancelled_by_admin' }]);
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-can' }]);
      return rows([]);
    });
    const out = await bookingSvc.cancelBookingAsAdmin(
      BOOKING_ID,
      'Provider unreachable repeatedly',
      ADMIN_ID,
      6,
      false,
      true,
    );
    // Phase 14 Dispatch 06 — Bug 69. Escrow handling now flows through
    // the trx-aware helper so it composes atomically with the audit insert.
    expect(escrowMocks.handleCancellationInTransaction).toHaveBeenCalledTimes(1);
    const txArg = escrowMocks.handleCancellationInTransaction.mock.calls[0]![0];
    expect(typeof (txArg as { query?: unknown })?.query).toBe('function');
    expect(escrowMocks.handleCancellationInTransaction.mock.calls[0]!.slice(1)).toEqual([
      BOOKING_ID,
      6,
      false,
      true,
    ]);
    // Legacy public function must NOT be called (proves D06 wiring is in
    // place — without the helper switch, money + audit would land in
    // separate transactions).
    expect(escrowMocks.handleCancellation).not.toHaveBeenCalled();
    expect(out.refundAmount).toBe(4242);
    // The admin's customerNoShow choice reaches the after-commit refund step.
    expect(escrowMocks.processCancellationGatewayRefund).toHaveBeenCalledWith(
      BOOKING_ID, expect.objectContaining({ customerRefundAmount: 4242 }), 0, true,
      expect.objectContaining({ retryDescription: 'Admin cancellation refund' }),
    );
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'booking_cancelled'");
    expect(calls[0]?.sql).toMatch(/SELECT \* FROM bookings WHERE id = \$1 FOR UPDATE/);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('escrow not held → no escrow call, still UPDATE + audit', async () => {
    const locked = {
      id: BOOKING_ID, status: 'requested', escrow_status: 'pending', provider_id: null, service_fee: 0,
      scheduled_at: new Date('2026-10-20T02:00:00.000Z'), category_id: 'category-1', city: 'Cebu City',
    };
    const calls = setupTxRecorder(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return rows([locked]);
      if (/UPDATE bookings SET/.test(sql)) return rows([{ ...locked, status: 'cancelled_by_admin' }]);
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-can2' }]);
      return rows([]);
    });
    const out = await bookingSvc.cancelBookingAsAdmin(
      BOOKING_ID,
      'A solid cancellation reason',
      ADMIN_ID,
    );
    expect(escrowMocks.handleCancellation).not.toHaveBeenCalled();
    expect(escrowMocks.handleCancellationInTransaction).not.toHaveBeenCalled();
    expect(out.refundAmount).toBe(0);
    expect(calls.find((c) => /UPDATE bookings/.test(c.sql))).toBeDefined();
  });
});

// ─── booking-admin: forceCompleteBooking ────────────────────────────────────

describe('forceCompleteBooking', () => {
  it('rejects reason <20 chars with 400', async () => {
    await expect(
      bookingSvc.forceCompleteBooking(BOOKING_ID, 'too short reason', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when status not in (in_progress, completed_by_provider)', async () => {
    setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: BOOKING_ID, status: 'requested' }]);
      }
      return rows([]);
    });
    await expect(
      bookingSvc.forceCompleteBooking(
        BOOKING_ID,
        'A sufficiently long admin reason here',
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("happy path: UPDATE status='confirmed' + INSERT booking_force_completed; no escrow release", async () => {
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: BOOKING_ID, status: 'completed_by_provider' }]);
      }
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-fc' }]);
      return rows([]);
    });
    const out = await bookingSvc.forceCompleteBooking(
      BOOKING_ID,
      'A sufficiently long admin reason here',
      ADMIN_ID,
    );
    expect(out.adminActionId).toBe('aa-fc');
    const update = calls.find((c) => /UPDATE bookings/.test(c.sql));
    expect(update?.sql).toMatch(/status\s*=\s*'confirmed'/);
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'booking_force_completed'");
    expect(escrowMocks.releaseEscrow).not.toHaveBeenCalled();
  });
});

// ─── dispute-admin: getDisputeFullDetail ────────────────────────────────────

interface DisputeDetailFixture {
  total_amount?: string | null;
  created_at?: Date;
  customer_id?: string | null;
  provider_id?: string | null;
  provider_user_id?: string | null;
}

function disputeDetailRow(overrides: DisputeDetailFixture = {}): Record<string, unknown> {
  return {
    id: DISPUTE_ID,
    booking_id: BOOKING_ID,
    status: 'open',
    tier: 1,
    type: 'incomplete',
    description: 'desc',
    filed_by: CUSTOMER_ID,
    created_at: overrides.created_at ?? new Date(Date.now() - 2 * 60 * 60 * 1000),
    resolved_at: null,
    resolved_by: null,
    resolution_type: null,
    refund_amount: null,
    decision_notes: null,
    internal_notes: null,
    provider_response: null,
    provider_responded_at: null,
    assigned_to: null,
    booking_status: 'in_progress',
    total_amount: overrides.total_amount === undefined ? '100000' : overrides.total_amount,
    scheduled_at: null,
    completed_at: null,
    service_price: '90000',
    service_fee: '10000',
    customer_id: overrides.customer_id === undefined ? CUSTOMER_ID : overrides.customer_id,
    customer_first_name: 'Joe',
    customer_last_name: 'C',
    customer_phone: '+639170000000',
    customer_avatar: null,
    provider_id: overrides.provider_id === undefined ? PROVIDER_ID : overrides.provider_id,
    provider_user_id: overrides.provider_user_id === undefined ? 'pu1' : overrides.provider_user_id,
    provider_business_name: 'Acme',
    provider_tier: 'verified',
    provider_first_name: 'Pat',
    provider_last_name: 'P',
    provider_avatar: null,
  };
}

describe('getDisputeFullDetail', () => {
  it('throws 404 when dispute missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('computes priorityScore = totalAmount * ageHours', async () => {
    const filedAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
    dbQueryMock
      .mockResolvedValueOnce(
        rows([disputeDetailRow({ total_amount: '100000', created_at: filedAt })]),
      )
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([]));
    const out = await disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID);
    expect(out.ageHours).toBe(5);
    expect(out.priorityScore).toBe(500000);
    expect(out.customer?.pattern).toBe('OK');
    expect(out.provider?.pattern).toBe('OK');
  });

  it('customer pattern AT_RISK when ≥3 disputes and ≥50% favored customer', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([disputeDetailRow()]))
      .mockResolvedValueOnce(rows([{ total: '4', matched: '2' }]))
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([]));
    const out = await disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID);
    expect(out.customer?.pattern).toBe('AT_RISK');
  });

  it('customer pattern REVIEW_REQUIRED when 2 disputes, no AT_RISK threshold', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([disputeDetailRow()]))
      .mockResolvedValueOnce(rows([{ total: '2', matched: '0' }]))
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([]));
    const out = await disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID);
    expect(out.customer?.pattern).toBe('REVIEW_REQUIRED');
  });

  it('provider pattern AT_RISK when ≥5 disputes and ≥50% lost', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([disputeDetailRow()]))
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([{ total: '6', matched: '4' }]))
      .mockResolvedValueOnce(rows([]));
    const out = await disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID);
    expect(out.provider?.pattern).toBe('AT_RISK');
  });

  it('provider pattern REVIEW_REQUIRED when 3 disputes, none lost', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([disputeDetailRow()]))
      .mockResolvedValueOnce(rows([{ total: '0', matched: '0' }]))
      .mockResolvedValueOnce(rows([{ total: '3', matched: '0' }]))
      .mockResolvedValueOnce(rows([]));
    const out = await disputeAdminSvc.getDisputeFullDetail(DISPUTE_ID);
    expect(out.provider?.pattern).toBe('REVIEW_REQUIRED');
  });
});

// ─── dispute-admin: adminAssignDispute ──────────────────────────────────────

describe('adminAssignDispute', () => {
  it('rejects empty assigneeAdminId', async () => {
    await expect(
      disputeAdminSvc.adminAssignDispute(DISPUTE_ID, '   ', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: reuses the canonical transactional dispute_assigned audit', async () => {
    disputeMocks.assignDispute.mockResolvedValueOnce({ adminActionId: 'aa-asg' } as never);
    const out = await disputeAdminSvc.adminAssignDispute(DISPUTE_ID, 'admin-2', ADMIN_ID);
    expect(disputeMocks.assignDispute).toHaveBeenCalledWith(DISPUTE_ID, ADMIN_ID, 'admin-2');
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(out.assignedTo).toBe('admin-2');
    expect(out.adminActionId).toBe('aa-asg');
  });
});

// ─── dispute-admin: adminResolveDispute ─────────────────────────────────────

describe('adminResolveDispute', () => {
  it('rejects decisionNotes <20 chars with 400', async () => {
    await expect(
      disputeAdminSvc.adminResolveDispute(
        DISPUTE_ID,
        { resolutionType: 'full_refund', decisionNotes: 'too short' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects partial_refund without refundPercent', async () => {
    await expect(
      disputeAdminSvc.adminResolveDispute(
        DISPUTE_ID,
        {
          resolutionType: 'partial_refund',
          decisionNotes: 'A sufficiently long set of notes',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects partial_refund with refundPercent out of (0,100]', async () => {
    await expect(
      disputeAdminSvc.adminResolveDispute(
        DISPUTE_ID,
        {
          resolutionType: 'partial_refund',
          refundPercent: 0,
          decisionNotes: 'A sufficiently long set of notes',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      disputeAdminSvc.adminResolveDispute(
        DISPUTE_ID,
        {
          resolutionType: 'partial_refund',
          refundPercent: 101,
          decisionNotes: 'A sufficiently long set of notes',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: delegates to resolveDisputeInTransaction + INSERTs dispute_resolved in same transaction (Bug 83)', async () => {
    disputeMocks.resolveDisputeInTransaction.mockResolvedValueOnce({
      dispute: {} as unknown as Awaited<ReturnType<typeof disputeMocks.resolveDispute>>,
      refundAmount: 8888,
      refundPercent: 100,
      bookingId: BOOKING_ID,
      bookingTotalAmount: 8888,
      providerId: PROVIDER_ID,
      pushRequests: [],
    });
    const calls = setupTxRecorder(async (sql) => {
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-res' }]);
      return rows([]);
    });
    const out = await disputeAdminSvc.adminResolveDispute(
      DISPUTE_ID,
      {
        resolutionType: 'full_refund',
        decisionNotes: 'Provider failed to deliver service',
      },
      ADMIN_ID,
    );
    expect(disputeMocks.resolveDisputeInTransaction).toHaveBeenCalledTimes(1);
    expect(disputeMocks.resolveDispute).not.toHaveBeenCalled();
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("'dispute_resolved'");
    expect(insert!.sql).toContain('full_notes');
    expect(out.refundAmount).toBe(8888);
    expect(out.adminActionId).toBe('aa-res');
  });
});

// ─── dispute-admin: adminEscalateDispute ────────────────────────────────────

describe('adminEscalateDispute', () => {
  it('rejects short reason with 400', async () => {
    await expect(
      disputeAdminSvc.adminEscalateDispute(DISPUTE_ID, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: reuses the canonical transactional dispute_escalated audit', async () => {
    disputeMocks.escalateDispute.mockResolvedValueOnce({
      tier: 2,
      adminActionId: 'aa-esc',
    } as unknown as Awaited<ReturnType<typeof disputeMocks.escalateDispute>>);
    const out = await disputeAdminSvc.adminEscalateDispute(
      DISPUTE_ID,
      'Customer pressing for senior review',
      ADMIN_ID,
    );
    expect(disputeMocks.escalateDispute).toHaveBeenCalledWith(
      DISPUTE_ID,
      ADMIN_ID,
      'Customer pressing for senior review',
    );
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(out.newTier).toBe(2);
    expect(out.adminActionId).toBe('aa-esc');
  });
});

// ─── dispute-admin: sendDisputeMessage ──────────────────────────────────────

describe('sendDisputeMessage', () => {
  it('rejects message <5 chars with 400', async () => {
    await expect(
      disputeAdminSvc.sendDisputeMessage(DISPUTE_ID, 'customer', 'hi', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects message >2000 chars with 400', async () => {
    await expect(
      disputeAdminSvc.sendDisputeMessage(DISPUTE_ID, 'customer', 'x'.repeat(2001), ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when dispute missing', async () => {
    setupTxRecorder(async () => rows([]));
    await expect(
      disputeAdminSvc.sendDisputeMessage(
        DISPUTE_ID,
        'both',
        'A sufficiently long message body',
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('happy path: durably delivers a participant notification with the audit row', async () => {
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM disputes/.test(sql)) {
        return rows([
          {
            id: DISPUTE_ID,
            booking_id: BOOKING_ID,
            customer_id: CUSTOMER_ID,
            provider_user_id: 'pu1',
          },
        ]);
      }
      if (/INSERT INTO notifications/.test(sql)) return rows([{ id: 'notification-dispute' }]);
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-msg' }]);
      return rows([]);
    });
    const longMsg = 'M'.repeat(800);
    const out = await disputeAdminSvc.sendDisputeMessage(
      DISPUTE_ID,
      'customer',
      longMsg,
      ADMIN_ID,
    );
    expect(out.adminActionId).toBe('aa-msg');
    expect(out.deliveredTo).toEqual(['customer']);
    expect(out.notificationIds).toEqual(['notification-dispute']);
    const writes = calls.filter((c) => /INSERT|UPDATE/.test(c.sql));
    expect(writes).toHaveLength(2);
    const notificationWrite = writes.find((call) => /INSERT INTO notifications/.test(call.sql));
    expect(notificationWrite?.sql).toContain("'dispute_update'");
    const auditWrite = writes.find((call) => /INSERT INTO admin_actions/.test(call.sql));
    expect(auditWrite?.sql).toContain("'dispute_message_sent'");
    expect(auditWrite?.sql).toContain('full_notes');
    // params: [adminUserId, disputeId, JSON, reason(slice 500), full_notes]
    const reasonParam = auditWrite!.params[3] as string;
    expect(reasonParam).toHaveLength(500);
    const fullNotes = auditWrite!.params[4] as string;
    expect(fullNotes).toBe(longMsg);
    expect(fullNotes).toHaveLength(800);
    expect(deliverStoredNotificationPushMock).toHaveBeenCalledWith(expect.objectContaining({
      notificationId: 'notification-dispute',
      userId: CUSTOMER_ID,
      type: 'dispute_update',
      data: expect.objectContaining({ disputeId: DISPUTE_ID, bookingId: BOOKING_ID }),
    }));
  });
});

// ─── dispute-admin: reopenDispute ───────────────────────────────────────────

describe('reopenDispute', () => {
  it('rejects reason <20 chars with 400', async () => {
    await expect(
      disputeAdminSvc.reopenDispute(DISPUTE_ID, 'too short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('blocks reopen under E51 before reading or rewriting the settled dispute', async () => {
    await expect(
      disputeAdminSvc.reopenDispute(
        DISPUTE_ID,
        'New material evidence has surfaced today',
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
