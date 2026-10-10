import { db } from '../src/models/db';
import * as disputeService from '../src/services/dispute.service';
import { adminResolveDispute } from '../src/services/dispute-admin.service';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { withDisputeDatabase, bookingEscrowLeft } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, customerB, escrowWallet, operatorId, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-015 - a dispute decision whose refund cannot be made is not recorded as resolved', async () => {
  await withDisputeDatabase(async database => {
    // Support already refunded 250,000 of booking B's 1,000,000 through the
    // real escrow refund helper, so 750,000 is left in its escrow.
    await db.transaction(client => refundFromEscrowInTransaction(
      client, bookingB, 250000, 'Synthetic support-approved partial refund',
    ));
    const dispute = await disputeService.fileDispute(bookingB, customerB, {
      type: 'substandard', description: 'Synthetic dispute: the work was incomplete.',
    });
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('750000');
    const before = await participantSnapshot(database);

    // An 80% refund (800,000) cannot be made from the 750,000 the booking
    // still holds. (The shared escrow pool holds 850,000, so the booking's own
    // cap is what refuses it.) Before FIN-015 this answered success: the
    // dispute was resolved, the booking marked partially refunded, no money
    // moved, and a whole-refund retry was queued that could never succeed.
    await expect(adminResolveDispute(dispute.id, {
      resolutionType: 'partial_refund',
      refundPercent: 80,
      decisionNotes: 'Synthetic admin decision: the customer is refunded 80 percent.',
    } as Parameters<typeof adminResolveDispute>[1], operatorId)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Refund exceeds this booking\'s remaining escrow (750000 centavos).',
    });

    expect(await participantSnapshot(database)).toEqual(before);
    expect((await database.query('SELECT status FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ status: 'open' }]);
    expect((await database.query('SELECT status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'disputed' }]);
  });
}, 60000);
