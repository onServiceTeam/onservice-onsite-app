import * as disputeService from '../src/services/dispute.service';
import { adminResolveDispute } from '../src/services/dispute-admin.service';
import { withDisputeDatabase, bookingEscrowLeft } from './helpers/dispute-postgres';
import { decisionSnapshot } from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, customerB, escrowWallet, operatorId, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-015 - a dispute decision whose refund cannot be made is not recorded as resolved', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, {
      type: 'substandard', description: 'Synthetic dispute: the work was incomplete.',
    });
    // Booking B still holds its whole 1,000,000 and is labelled "held", so
    // the S2-3 checks pass and the refund itself runs. The fault is
    // injected: the shared escrow account is set by direct SQL to hold only
    // 900,000 in all, as if its balance had drifted from its ledger, so the
    // 1,000,000 refund fails inside the decision. After S2-3 this is the only
    // refund failure the decision can meet, other than a database error.
    // Before FIN-015 a refund that could not be made answered success: the
    // dispute was resolved and the booking marked refunded with no money
    // moved, and a whole-refund retry was queued to replay it later. (Until
    // S2-3 this test used an earlier support refund; S2-3 now refuses that
    // decision before any refund is tried.)
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('1000000');
    await database.query('UPDATE wallets SET pending_balance=900000 WHERE id=$1', [escrowWallet]);
    const before = await decisionSnapshot(database);

    await expect(adminResolveDispute(dispute.id, {
      resolutionType: 'full_refund',
      decisionNotes: 'Synthetic admin decision: the customer is refunded in full.',
    } as Parameters<typeof adminResolveDispute>[1], operatorId)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Insufficient escrow balance for refund.',
    });

    expect(await decisionSnapshot(database)).toEqual(before);
    expect((await database.query('SELECT status FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ status: 'open' }]);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'disputed', escrow_status: 'held' }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
  });
}, 60000);
