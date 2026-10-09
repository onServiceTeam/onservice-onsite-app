// MED-N28 fix verified — failed gateway actions (refund / release /
// partial release) are enqueued to gateway_retry_queue when the
// post-commit call fails, then drained by a periodic worker job.
//
// Pre-fix: dispute-admin.service.ts logged the failure with
// logger.error and forgot. Customer never got their money back
// without manual ops triage of logs.
//
// Post-fix:
// 1. New gatewayRetryService.enqueueRetry(input) inserts a
//    pending row with attempts=0, next_retry_at=NOW().
// 2. New gatewayRetryService.processRetries() worker claims a
//    batch via FOR UPDATE SKIP LOCKED, runs each, advances
//    status accordingly, applies exponential backoff on retry,
//    and flips status=failed_permanent after max_attempts.
// 3. Worker is wired into the scheduler queue (every 5 min).

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const resolveDisputeInTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));

jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
  releasePartialEscrow: jest.fn(),
}));

jest.mock('../src/services/dispute.service', () => ({
  resolveDisputeInTransaction: (...args: unknown[]) => resolveDisputeInTransactionMock(...args),
  assertDisputeResolutionAvailable: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

import * as gatewayRetryService from '../src/services/gateway-retry.service';
import { adminResolveDispute } from '../src/services/dispute-admin.service';

const escrowService = require('../src/services/escrow.service') as {
  refundFromEscrow: jest.Mock;
  releaseEscrow: jest.Mock;
  releasePartialEscrow: jest.Mock;
};

describe('MED-N28 — enqueueRetry stores a pending row with the original action params', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it('inserts a pending row with attempts=0 and the captured params', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await gatewayRetryService.enqueueRetry({
      actionType: 'refund_from_escrow',
      bookingId: 'booking-1',
      disputeId: 'dispute-1',
      amountCentavos: 12345,
      description: 'Admin dispute resolution: full_refund',
      initialError: 'PayMongo gateway timeout',
    });

    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQueryMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO gateway_retry_queue/);
    // The literal `0` for attempts and 'pending' for status both
    // appear in the VALUES clause; verify each individually.
    expect(sql).toMatch(/attempts/);
    expect(sql).toMatch(/'pending'/);
    expect(params).toEqual([
      'refund_from_escrow', 'booking-1', 'dispute-1', 12345,
      'Admin dispute resolution: full_refund', 'PayMongo gateway timeout',
    ]);
  });

  it('does NOT throw when the queue insert itself fails (post-commit caller would lose its primary error otherwise)', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('queue table missing'));
    await expect(
      gatewayRetryService.enqueueRetry({
        actionType: 'release_escrow',
        bookingId: 'booking-1',
        initialError: 'gateway 500',
      }),
    ).resolves.toBeUndefined();
  });

  it('truncates very long error messages to 2000 chars', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const huge = 'x'.repeat(5000);
    await gatewayRetryService.enqueueRetry({
      actionType: 'release_escrow',
      bookingId: 'b1',
      initialError: huge,
    });
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    expect((params[5] as string).length).toBe(2000);
  });
});

describe('MED-N28 — processRetries worker semantics', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    escrowService.refundFromEscrow.mockReset();
    escrowService.releaseEscrow.mockReset();
    escrowService.releasePartialEscrow.mockReset();
  });

  it('claims pending rows with FOR UPDATE SKIP LOCKED (concurrency-safe)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // claim returns nothing

    await gatewayRetryService.processRetries(10);

    const claimSql = dbQueryMock.mock.calls[0]![0] as string;
    expect(claimSql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claimSql).toMatch(/status = 'pending'/);
    expect(claimSql).toMatch(/next_retry_at <= NOW\(\)/);
  });

  it('on success: marks the row succeeded and advances attempts', async () => {
    // Claim returns a refund row.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'retry-1', action_type: 'refund_from_escrow',
        booking_id: 'booking-1', dispute_id: null,
        amount_centavos: '5000', description: 'test',
        attempts: 0, max_attempts: 5,
      }],
      rowCount: 1,
    });
    escrowService.refundFromEscrow.mockResolvedValueOnce(undefined);
    // Followup UPDATE to mark succeeded.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const counts = await gatewayRetryService.processRetries(25);

    expect(counts).toEqual({
      attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0,
    });
    // Verify escrow was called with the captured amount + description.
    expect(escrowService.refundFromEscrow).toHaveBeenCalledWith('booking-1', 5000, 'test');
    // The 2nd query (after the claim) should mark succeeded.
    const successSql = dbQueryMock.mock.calls[1]![0] as string;
    expect(successSql).toMatch(/status = 'succeeded'/);
    expect(successSql).toMatch(/succeeded_at = NOW\(\)/);
  });

  it('on failure (attempts < max): reschedules with exponential backoff', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'retry-1', action_type: 'release_escrow',
        booking_id: 'booking-1', dispute_id: 'd1',
        amount_centavos: null, description: 'test',
        attempts: 1, max_attempts: 5,
      }],
      rowCount: 1,
    });
    escrowService.releaseEscrow.mockRejectedValueOnce(new Error('PayMongo 503'));
    // UPDATE to reschedule.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const counts = await gatewayRetryService.processRetries();

    expect(counts.failedAndRetrying).toBe(1);
    expect(counts.failedPermanent).toBe(0);
    const rescheduleSql = dbQueryMock.mock.calls[1]![0] as string;
    const rescheduleParams = dbQueryMock.mock.calls[1]![1] as unknown[];
    expect(rescheduleSql).toMatch(/status = 'pending'/);
    expect(rescheduleSql).toMatch(/next_retry_at = NOW\(\) \+/);
    // attempt becomes 2 → backoff = 2^2 = 4 minutes.
    expect(rescheduleParams[0]).toBe('4');
    expect(rescheduleParams[1]).toBe(2); // attempts
  });

  it('on failure (attempts >= max): marks failed_permanent for manual ops', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'retry-1', action_type: 'refund_from_escrow',
        booking_id: 'booking-1', dispute_id: 'd1',
        amount_centavos: '999', description: 'last gasp',
        attempts: 4, max_attempts: 5, // next attempt would be 5 = max
      }],
      rowCount: 1,
    });
    escrowService.refundFromEscrow.mockRejectedValueOnce(new Error('gateway hard-down'));
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const counts = await gatewayRetryService.processRetries();

    expect(counts.failedPermanent).toBe(1);
    expect(counts.failedAndRetrying).toBe(0);
    const failSql = dbQueryMock.mock.calls[1]![0] as string;
    expect(failSql).toMatch(/status = 'failed_permanent'/);
    expect(failSql).toMatch(/failed_permanent_at = NOW\(\)/);
  });

  it('routes action_type correctly: release_partial_escrow uses the captured amount', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'retry-1', action_type: 'release_partial_escrow',
        booking_id: 'booking-1', dispute_id: null,
        amount_centavos: '7500', description: 'partial',
        attempts: 0, max_attempts: 5,
      }],
      rowCount: 1,
    });
    escrowService.releasePartialEscrow.mockResolvedValueOnce(undefined);
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await gatewayRetryService.processRetries();

    expect(escrowService.releasePartialEscrow).toHaveBeenCalledWith('booking-1', 7500);
  });
});

describe('MED-N28 — listFailedPermanent for admin compliance dashboard', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it('returns rows ordered by failed_permanent_at DESC scoped to status=failed_permanent', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'r-1', action_type: 'refund_from_escrow',
        booking_id: 'b-1', dispute_id: 'd-1',
        amount_centavos: '12345', attempts: 5,
        last_error: 'PayMongo connection refused',
        failed_permanent_at: new Date('2026-05-02T10:00:00Z'),
      }],
      rowCount: 1,
    });

    const out = await gatewayRetryService.listFailedPermanent(10);
    expect(out).toHaveLength(1);
    expect(out[0]!.actionType).toBe('refund_from_escrow');
    expect(out[0]!.amountCentavos).toBe(12345);
    expect(out[0]!.lastError).toBe('PayMongo connection refused');

    const sql = dbQueryMock.mock.calls[0]![0] as string;
    expect(sql).toMatch(/status = 'failed_permanent'/);
    expect(sql).toMatch(/ORDER BY failed_permanent_at DESC/);
  });
});

it('MED-N28 - every failed admin dispute money outcome creates the matching durable retry', async () => {
  dbTransactionMock.mockImplementation(async (
    callback: (client: { query: jest.Mock }) => Promise<unknown>,
  ) => callback({
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'admin-action-med-n28' }], rowCount: 1 }),
  }));
  resolveDisputeInTransactionMock
    .mockResolvedValueOnce({
      refundAmount: 10000,
      bookingId: 'booking-full-refund',
      providerId: 'provider-1',
      bookingTotalAmount: 10000,
    })
    .mockResolvedValueOnce({
      refundAmount: 4000,
      bookingId: 'booking-partial-refund',
      providerId: 'provider-1',
      bookingTotalAmount: 10000,
    })
    .mockResolvedValueOnce({
      refundAmount: 0,
      bookingId: 'booking-no-refund',
      providerId: 'provider-1',
      bookingTotalAmount: 10000,
    });
  escrowService.refundFromEscrow
    .mockRejectedValueOnce(new Error('refund gateway timeout'))
    .mockResolvedValueOnce(undefined);
  escrowService.releasePartialEscrow.mockRejectedValueOnce(new Error('partial release timeout'));
  escrowService.releaseEscrow.mockRejectedValueOnce(new Error('full release timeout'));
  const enqueueSpy = jest.spyOn(gatewayRetryService, 'enqueueRetry').mockResolvedValue(undefined);

  await adminResolveDispute('dispute-full', {
    resolutionType: 'full_refund',
    decisionNotes: 'The customer evidence supports a complete refund.',
  }, 'admin-med-n28');
  await adminResolveDispute('dispute-partial', {
    resolutionType: 'partial_refund',
    refundPercent: 40,
    decisionNotes: 'The evidence supports a partial customer refund.',
  }, 'admin-med-n28');
  await adminResolveDispute('dispute-none', {
    resolutionType: 'no_refund',
    decisionNotes: 'The completed service evidence supports provider release.',
  }, 'admin-med-n28');

  expect(enqueueSpy.mock.calls.map(([input]) => input)).toEqual([
    {
      actionType: 'refund_from_escrow',
      bookingId: 'booking-full-refund',
      disputeId: 'dispute-full',
      amountCentavos: 10000,
      description: 'Admin dispute resolution: full_refund',
      initialError: 'refund gateway timeout',
    },
    {
      actionType: 'release_partial_escrow',
      bookingId: 'booking-partial-refund',
      disputeId: 'dispute-partial',
      amountCentavos: 6000,
      description: 'Partial release after refund (partial_refund)',
      initialError: 'partial release timeout',
    },
    {
      actionType: 'release_escrow',
      bookingId: 'booking-no-refund',
      disputeId: 'dispute-none',
      description: 'Release after dispute (no_refund)',
      initialError: 'full release timeout',
    },
  ]);
});
