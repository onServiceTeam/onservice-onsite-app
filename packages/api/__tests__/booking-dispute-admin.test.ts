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
}));

jest.mock('../src/services/dispute.service', () => ({
  resolveDispute: jest.fn(),
  assignDispute: jest.fn(),
  escalateDispute: jest.fn(),
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

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  escrowMocks.releaseEscrow.mockReset();
  escrowMocks.refundFromEscrow.mockReset();
  escrowMocks.handleCancellation.mockReset();
  disputeMocks.resolveDispute.mockReset();
  disputeMocks.assignDispute.mockReset();
  disputeMocks.escalateDispute.mockReset();
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

  it('returns photos + chat count + gps + receipts', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: 'pu1' }]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'img1',
            image_url: 'https://x/a.jpg',
            image_type: 'before',
            uploaded_by: CUSTOMER_ID,
            created_at: new Date('2024-01-01T00:00:00Z'),
          },
          {
            id: 'img2',
            image_url: 'https://x/b.jpg',
            image_type: 'after',
            uploaded_by: 'pu1',
            created_at: new Date('2024-01-02T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ cnt: '5' }]))
      .mockResolvedValueOnce(rows([{ tbl: 'public.gps_checkins' }]))
      .mockResolvedValueOnce(
        rows([
          {
            created_at: new Date('2024-01-01T00:00:00Z'),
            latitude: '14.5',
            longitude: '121.0',
            event_type: 'arrived',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ tbl: 'public.receipts' }]))
      .mockResolvedValueOnce(
        rows([{ id: 'r1', url: 'https://x/r.pdf', created_at: new Date('2024-01-01T00:00:00Z') }]),
      );

    const out = await bookingSvc.getBookingEvidence(BOOKING_ID);
    expect(out.photos).toHaveLength(2);
    expect(out.photos[0].uploadedBy).toBe('customer');
    expect(out.photos[1].uploadedBy).toBe('provider');
    expect(out.chatMessageCount).toBe(5);
    expect(out.gpsCheckIns).toEqual([
      { at: '2024-01-01T00:00:00.000Z', lat: 14.5, lng: 121.0, eventType: 'arrived' },
    ]);
    expect(out.receipts[0].url).toBe('https://x/r.pdf');
  });

  it('skips gps + receipts when to_regclass returns null', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: 'pu1' }]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([{ tbl: null }]))
      .mockResolvedValueOnce(rows([{ tbl: null }]));
    const out = await bookingSvc.getBookingEvidence(BOOKING_ID);
    expect(out.gpsCheckIns).toEqual([]);
    expect(out.receipts).toEqual([]);
    expect(out.chatMessageCount).toBe(0);
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

  it('happy path: calls releaseEscrow then INSERTs manual_escrow_release', async () => {
    escrowMocks.releaseEscrow.mockResolvedValueOnce({
      providerReceives: 80000,
      platformRetains: 20000,
    } as unknown as Awaited<ReturnType<typeof escrowMocks.releaseEscrow>>);
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'aa-rel' }]));
    const out = await bookingSvc.manualReleaseEscrow(
      BOOKING_ID,
      'Customer abandoned booking',
      ADMIN_ID,
    );
    expect(escrowMocks.releaseEscrow).toHaveBeenCalledWith(BOOKING_ID);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO admin_actions/);
    expect(sql).toContain("'manual_escrow_release'");
    expect(out.adminActionId).toBe('aa-rel');
    expect(out.releasedAmount).toBe(100000);
  });

  it('propagates errors from escrowService', async () => {
    escrowMocks.releaseEscrow.mockRejectedValueOnce(new Error('escrow boom'));
    await expect(
      bookingSvc.manualReleaseEscrow(BOOKING_ID, 'Customer abandoned booking', ADMIN_ID),
    ).rejects.toThrow('escrow boom');
  });
});

// ─── booking-admin: refundBookingEscrow ─────────────────────────────────────

describe('refundBookingEscrow', () => {
  it('rejects refundAmount <= 0', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(BOOKING_ID, 0, 'A reasonable reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects non-integer refundAmount', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(BOOKING_ID, 12.5, 'A reasonable reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects short reason', async () => {
    await expect(
      bookingSvc.refundBookingEscrow(BOOKING_ID, 5000, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('happy path: delegates to refundFromEscrow with EXACT amount + INSERTs refund_issued', async () => {
    escrowMocks.refundFromEscrow.mockResolvedValueOnce(undefined as never);
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'aa-ref' }]));
    const out = await bookingSvc.refundBookingEscrow(
      BOOKING_ID,
      7777,
      'Customer requested partial refund',
      ADMIN_ID,
    );
    expect(escrowMocks.refundFromEscrow).toHaveBeenCalledWith(
      BOOKING_ID,
      7777,
      'Customer requested partial refund',
    );
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO admin_actions/);
    expect(sql).toContain("'refund_issued'");
    expect(out.refundedAmount).toBe(7777);
    expect(out.bookingId).toBe(BOOKING_ID);
    expect(out.adminActionId).toBe('aa-ref');
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
        return rows([{ id: BOOKING_ID, status: 'confirmed_by_provider', provider_id: 'old' }]);
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

  it('happy path: UPDATE bookings + INSERT booking_reassigned', async () => {
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: BOOKING_ID, status: 'requested', provider_id: 'old' }]);
      }
      if (/FROM providers/.test(sql)) {
        return rows([{ id: PROVIDER_ID, is_active: true }]);
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
    expect(calls.find((c) => /UPDATE bookings SET provider_id/.test(c.sql))).toBeDefined();
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'booking_reassigned'");
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
    dbQueryMock.mockResolvedValueOnce(
      rows([{ id: BOOKING_ID, status: 'cancelled_by_admin', escrow_status: null }]),
    );
    await expect(
      bookingSvc.cancelBookingAsAdmin(BOOKING_ID, 'A solid cancellation reason', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('escrow held → calls handleCancellation with passed args + records refundAmount', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ id: BOOKING_ID, status: 'confirmed_by_provider', escrow_status: 'held' }]),
    );
    escrowMocks.handleCancellation.mockResolvedValueOnce({
      customerRefundAmount: 4242,
    } as unknown as Awaited<ReturnType<typeof escrowMocks.handleCancellation>>);
    const calls = setupTxRecorder(async (sql) => {
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
    expect(escrowMocks.handleCancellation).toHaveBeenCalledWith(BOOKING_ID, 6, false, true);
    expect(out.refundAmount).toBe(4242);
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'booking_cancelled'");
  });

  it('escrow not held → no escrow call, still UPDATE + audit', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ id: BOOKING_ID, status: 'requested', escrow_status: 'pending' }]),
    );
    const calls = setupTxRecorder(async (sql) => {
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-can2' }]);
      return rows([]);
    });
    const out = await bookingSvc.cancelBookingAsAdmin(
      BOOKING_ID,
      'A solid cancellation reason',
      ADMIN_ID,
    );
    expect(escrowMocks.handleCancellation).not.toHaveBeenCalled();
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

  it('happy path: delegates + INSERTs dispute_assigned', async () => {
    disputeMocks.assignDispute.mockResolvedValueOnce({} as never);
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'aa-asg' }]));
    const out = await disputeAdminSvc.adminAssignDispute(DISPUTE_ID, 'admin-2', ADMIN_ID);
    expect(disputeMocks.assignDispute).toHaveBeenCalledWith(DISPUTE_ID, ADMIN_ID, 'admin-2');
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'dispute_assigned'");
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

  it('happy path: delegates + INSERTs dispute_resolved + returns refundAmount', async () => {
    disputeMocks.resolveDispute.mockResolvedValueOnce({
      refund_amount: 8888,
    } as unknown as Awaited<ReturnType<typeof disputeMocks.resolveDispute>>);
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'aa-res' }]));
    const out = await disputeAdminSvc.adminResolveDispute(
      DISPUTE_ID,
      {
        resolutionType: 'full_refund',
        decisionNotes: 'Provider failed to deliver service',
      },
      ADMIN_ID,
    );
    expect(disputeMocks.resolveDispute).toHaveBeenCalledTimes(1);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'dispute_resolved'");
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

  it('happy path: delegates + INSERTs dispute_escalated', async () => {
    disputeMocks.escalateDispute.mockResolvedValueOnce({
      tier: 2,
    } as unknown as Awaited<ReturnType<typeof disputeMocks.escalateDispute>>);
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'aa-esc' }]));
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
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'dispute_escalated'");
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

  it('happy path: only INSERTs dispute_message_sent and truncates reason to 500', async () => {
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
    const writes = calls.filter((c) => /INSERT|UPDATE/.test(c.sql));
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain("'dispute_message_sent'");
    const reasonParam = writes[0].params[3] as string;
    expect(reasonParam).toHaveLength(500);
  });
});

// ─── dispute-admin: reopenDispute ───────────────────────────────────────────

describe('reopenDispute', () => {
  it('rejects reason <20 chars with 400', async () => {
    await expect(
      disputeAdminSvc.reopenDispute(DISPUTE_ID, 'too short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when status not in (resolved, closed)', async () => {
    setupTxRecorder(async (sql) => {
      if (/FROM disputes WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: DISPUTE_ID, status: 'open' }]);
      }
      return rows([]);
    });
    await expect(
      disputeAdminSvc.reopenDispute(
        DISPUTE_ID,
        'New material evidence has surfaced today',
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("happy path: UPDATE status='under_review', resolved_at/by NULL + INSERT dispute_reopened", async () => {
    const calls = setupTxRecorder(async (sql) => {
      if (/FROM disputes WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([{ id: DISPUTE_ID, status: 'resolved' }]);
      }
      if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'aa-reo' }]);
      return rows([]);
    });
    const out = await disputeAdminSvc.reopenDispute(
      DISPUTE_ID,
      'New material evidence has surfaced today',
      ADMIN_ID,
    );
    expect(out.previousStatus).toBe('resolved');
    expect(out.adminActionId).toBe('aa-reo');
    const update = calls.find((c) => /UPDATE disputes/.test(c.sql));
    expect(update?.sql).toMatch(/status\s*=\s*'under_review'/);
    expect(update?.sql).toMatch(/resolved_at\s*=\s*NULL/);
    expect(update?.sql).toMatch(/resolved_by\s*=\s*NULL/);
    const insert = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(insert?.sql).toContain("'dispute_reopened'");
  });
});
