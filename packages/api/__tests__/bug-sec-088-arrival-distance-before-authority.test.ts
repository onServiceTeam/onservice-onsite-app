import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  snapshot, providerUserA, providerUserB, providerB, customerA, bookingB, operatorId,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Synthetic service point in Cebu City and a caller about 500 m north of it.
// Both are inside the Philippine bounds the status validator enforces.
const serviceLatitude = 10.3157;
const serviceLongitude = 123.8854;
const farLatitude = 10.3202;
const nearLatitude = 10.3159;

async function placeBookingB(database: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await database.query('UPDATE bookings SET latitude=$2, longitude=$3 WHERE id=$1',
    [bookingB, serviceLatitude, serviceLongitude]);
}

it('Bug SEC-088 - an unassigned caller learns nothing about the service location from the arrival check', async () => {
  await withParticipantRefundDatabase(async database => {
    await placeBookingB(database);
    const location = { latitude: farLatitude, longitude: serviceLongitude };
    const outsiders = async () => [
      await participantHttp(providerUserA, 'provider')(bookingB, 'provider_arrived', location),
      await participantHttp(customerA, 'customer')(bookingB, 'provider_arrived', location),
    ];
    const expectNothingDisclosed = async (before: unknown) => {
      const [provider, customer] = await outsiders();
      expect({ responses: [provider!.status, customer!.status], state: await participantSnapshot(database) })
        .toEqual({ responses: [403, 403], state: before });
      expect(provider!.body.error.message).toBe('You are not assigned to this booking.');
      expect(customer!.body.error.message).toBe('You can only manage your own bookings.');
      for (const text of [provider!.text, customer!.text]) {
        expect(text).not.toMatch(/distance|meters?\b|\d+\s*m\b/i);
      }
    };

    // A paid booking that no provider has accepted yet.
    await expectNothingDisclosed(await participantSnapshot(database));

    // The realistic case: another provider is assigned and on the way, so
    // arrival is a valid next step and the guard runs its ownership lookup.
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='provider_en_route' WHERE id=$1",
        [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    await expectNothingDisclosed(await participantSnapshot(database));
  });
}, 30000);

it('the assigned provider still gets the arrival radius result and its exact messages', async () => {
  await withParticipantRefundDatabase(async database => {
    await placeBookingB(database);
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='provider_en_route' WHERE id=$1",
        [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);
    const patch = participantHttp(providerUserB, 'provider');

    const missing = await patch(bookingB, 'provider_arrived');
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe('Current provider location is required to mark arrival.');

    const far = await patch(bookingB, 'provider_arrived', { latitude: farLatitude, longitude: serviceLongitude });
    expect(far.status).toBe(409);
    expect(far.body.error.message).toMatch(
      /^You must be within 200 meters of the job location to mark arrival\. Current distance: \d+ meters\.$/,
    );
    expect(await participantSnapshot(database)).toEqual(before);

    const near = await patch(bookingB, 'provider_arrived', { latitude: nearLatitude, longitude: serviceLongitude });
    expect(near.status).toBe(200);
    expect(near.body.data).toMatchObject({ id: bookingB, status: 'provider_arrived' });
    expect(await snapshot(database)).toEqual({ wallets: before.wallets, ledger: before.ledger });
  });
}, 30000);

it('admin roles still face the arrival location and radius checks', async () => {
  for (const role of ['admin', 'super_admin']) {
    await withParticipantRefundDatabase(async database => {
      await placeBookingB(database);
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, operatorId]);
      await database.query("UPDATE bookings SET status='provider_en_route' WHERE id=$1", [bookingB]);
      const before = await participantSnapshot(database);
      const patch = participantHttp(operatorId, role);

      const missing = await patch(bookingB, 'provider_arrived');
      expect(missing.status).toBe(400);
      expect(missing.body.error.message).toBe('Current provider location is required to mark arrival.');

      const far = await patch(bookingB, 'provider_arrived', { latitude: farLatitude, longitude: serviceLongitude });
      expect(far.status).toBe(409);
      expect(far.body.error.message).toMatch(/Current distance: \d+ meters\.$/);
      expect(await participantSnapshot(database)).toEqual(before);
    });
  }
}, 60000);

it('a booking without service coordinates still refuses the assigned provider arrival', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='provider_en_route' WHERE id=$1",
        [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);
    const response = await participantHttp(providerUserB, 'provider')(
      bookingB, 'provider_arrived', { latitude: nearLatitude, longitude: serviceLongitude },
    );
    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Booking does not have service coordinates. Arrival cannot be verified.');
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 30000);
