import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerA, customerB, providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-092 - a customer cannot mark a booking disputed without filing a dispute', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='completed_by_provider' WHERE id=$1",
        [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);

    // Before SEC-092 this answered 200: the booking became "disputed" and its
    // escrow stayed held with no dispute record, so no dispute flow could
    // ever resolve it. Disputes are filed through POST /api/v1/disputes.
    const response = await participantHttp(customerB, 'customer')(bookingB, 'disputed');
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'BOOKING_TRANSITION_FLOW_ONLY',
      message: 'This booking change can\'t be made from here.',
    });

    // The ownership check still answers first for another customer.
    const stranger = await participantHttp(customerA, 'customer')(bookingB, 'disputed');
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.message).toBe('You can only manage your own bookings.');
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 30000);
