// HA-M3-01 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 70 with the merged.md rename to a per-round key): the
// real migration 186 lets a request hold one alert per kind per round. The
// same request, kind and round is refused by marketplace_alerts_once_per_round;
// the same kind in a new round (a reopened request) and another kind in the
// same round are accepted. Real SQL on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-01: one alert per request, kind and round; a new round may alert again', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const raise = (kind: string, round: number) => database.query(`INSERT INTO marketplace_alerts
        (booking_id, kind, request_round, anchor_at, threshold_minutes)
      VALUES ($1, $2, $3, NOW(), CASE WHEN $2 LIKE 'request_waiting%' THEN 5 END)`, [bookingId, kind, round]);

    await raise('request_waiting_amber', 1);
    await expect(raise('request_waiting_amber', 1))
      .rejects.toMatchObject({ code: '23505', constraint: 'marketplace_alerts_once_per_round' });
    await raise('request_waiting_amber', 2);
    await raise('request_waiting_red', 1);

    expect((await database.query(`SELECT kind, request_round FROM marketplace_alerts
      WHERE booking_id = $1 ORDER BY request_round, kind`, [bookingId])).rows).toEqual([
      { kind: 'request_waiting_amber', request_round: 1 },
      { kind: 'request_waiting_red', request_round: 1 },
      { kind: 'request_waiting_amber', request_round: 2 },
    ]);
  });
}, 90000);
