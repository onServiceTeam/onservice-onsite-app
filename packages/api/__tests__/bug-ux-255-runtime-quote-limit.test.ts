// Bug UX-255: quote admission must enforce the live admin limit, read at
// submit time, not a value baked into code.
//
// D38 Milestone 2 (package P2) rewrite. The limit is now
// request_max_open_quotes and it counts LIVE quotes (submitted and not
// expired); the old max_quotes_per_booking counted every quote ever sent and
// is retired (HA-M2-12). With the setting at 2, a third provider is refused
// with "maximum of 2 quotes" and nothing of theirs is stored. Before this
// rewrite the test mocked every SQL call in a fixed order; it now runs quote
// admission over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, addProvider,
  providerUserA, providerUserB, providerC, providerUserC,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug UX-255 — quote admission enforces the live maximum-per-booking setting', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '2');
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);
    expect((await flowHttp(providerUserA, 'provider').quote(bookingId)).status).toBe(201);
    expect((await flowHttp(providerUserB, 'provider').quote(bookingId)).status).toBe(201);

    const third = await flowHttp(providerUserC, 'provider').quote(bookingId);

    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('REQUEST_TAKEN');
    expect(third.body.error.message).toMatch(/maximum of 2 quotes/);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1 AND provider_id = $2`,
      [bookingId, providerC])).rows[0].n).toBe(0);
  });
}, 90000);
