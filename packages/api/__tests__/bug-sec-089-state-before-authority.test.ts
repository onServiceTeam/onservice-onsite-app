import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  providerUserA, providerUserB, providerB, customerB, bookingA, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-089 - callers who fail the booking guard learn neither its status nor its on-site timing', async () => {
  await withParticipantRefundDatabase(async database => {
    const before = await participantSnapshot(database);
    // An unrelated customer asks for a target the state machine refuses from
    // "paid". The answer must not reveal the booking's current status.
    const otherCustomer = await participantHttp(customerB, 'customer')(bookingA, 'paid_out');
    // An unassigned provider asks to complete a paid job. The answer must not
    // reveal how long anyone has been on site.
    const otherProvider = await participantHttp(providerUserA, 'provider')(bookingB, 'completed_by_provider');
    expect({ responses: [otherCustomer.status, otherProvider.status], state: await participantSnapshot(database) })
      .toEqual({ responses: [403, 403], state: before });
    expect(otherCustomer.body.error.message).toBe('You can only manage your own bookings.');
    expect(otherProvider.body.error.message).toBe('You are not assigned to this booking.');
    for (const text of [otherCustomer.text, otherProvider.text]) {
      expect(text).not.toMatch(/transition|"paid"|minute|on-site/i);
    }
  });
}, 30000);

it('the assigned provider still gets the transition and minimum on-site time messages', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const patch = participantHttp(providerUserB, 'provider');
    const before = await participantSnapshot(database);

    // From "paid" the state machine does not allow completion.
    const invalid = await patch(bookingB, 'completed_by_provider');
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.message).toMatch(/^Cannot transition from "paid" to "completed_by_provider"\./);
    expect(await participantSnapshot(database)).toEqual(before);

    // In progress for one minute: the server clock keeps the minimum time.
    await database.query(
      "UPDATE bookings SET status='in_progress', work_started_at=NOW() - INTERVAL '1 minute', updated_at=NOW() - INTERVAL '2 hours' WHERE id=$1",
      [bookingB],
    );
    const started = await participantSnapshot(database);
    const early = await patch(bookingB, 'completed_by_provider');
    expect(early.status).toBe(409);
    expect(early.body.error.message).toMatch(
      /^You must be on-site for at least 15 minutes before marking the job complete\. Please wait \d+ more minute\(s\)\.$/,
    );
    expect(await participantSnapshot(database)).toEqual(started);
  });
}, 30000);
