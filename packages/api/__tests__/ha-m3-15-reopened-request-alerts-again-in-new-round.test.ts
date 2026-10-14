// HA-M3-15 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 80): Ken's main case. A request alerted in round 1 gets
// a quote, the customer declines it through the real decline route and the
// engine reopens the request in round 2. The next sweep resolves the round-1
// alert as 'reopened'; once round 2 has waited 6 minutes with no quote the
// sweep raises a fresh amber alert for round 2, measured from the new round
// clock. The database clock cannot be moved, so round 2's clock is moved back
// 6 minutes (the state the table holds 6 minutes later). Real HTTP and real
// SQL on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  customerA, flowHttp, insertQuoteRequest, invitesOf, providerB, providerUserA, waitUntil,
} from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-15: a declined and reopened request alerts again in its new round', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '7 minutes' });
    await sweepMarketplaceAlerts();
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);
    const declined = await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, { reason: 'too_expensive' });
    expect(declined.body.data).toMatchObject({ round: 2, reopened: true });
    // The reopen fan-out runs after the decline commits; let it finish.
    await waitUntil(async () => (await invitesOf(database, bookingId))
      .some(invite => invite.provider_id === providerB && invite.round === 2), 'the round 2 fan-out');

    await sweepMarketplaceAlerts();
    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.request_round, alert.resolution]))
      .toEqual([['request_waiting_amber', 1, 'reopened']]);

    await database.query(`UPDATE bookings SET request_round_opened_at = request_round_opened_at - INTERVAL '6 minutes'
      WHERE id = $1`, [bookingId]);
    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.request_round, alert.open, alert.resolution]))
      .toEqual([
        ['request_waiting_amber', 1, false, 'reopened'],
        ['request_waiting_amber', 2, true, null],
      ]);
    expect((await database.query(`SELECT a.anchor_at = b.request_round_opened_at AS anchored FROM marketplace_alerts a
      JOIN bookings b ON b.id = a.booking_id WHERE a.booking_id = $1 AND a.request_round = 2`, [bookingId])).rows)
      .toEqual([{ anchored: true }]);
  });
}, 90000);
