import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  providerUserA, providerUserB, providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-093 - a provider cannot set quoted or matched without the quote or offer flow', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='requested' WHERE id=$1", [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);
    const patch = participantHttp(providerUserB, 'provider');

    // Before SEC-093 both answered 200: "quoted" with no quote row and
    // "matched" with no accepted offer or quote.
    for (const target of ['quoted', 'matched']) {
      const response = await patch(bookingB, target);
      expect({ target, status: response.status, code: response.body.error?.code })
        .toEqual({ target, status: 409, code: 'BOOKING_TRANSITION_FLOW_ONLY' });
    }

    // The assignment check still answers first for a provider not on the job.
    const stranger = await participantHttp(providerUserA, 'provider')(bookingB, 'quoted');
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.message).toBe('You are not assigned to this booking.');
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 30000);
