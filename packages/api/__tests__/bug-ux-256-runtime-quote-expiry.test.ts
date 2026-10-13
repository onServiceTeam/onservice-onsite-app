// Bug UX-256: a submitted quote must expire after the live admin duration
// (quote_expiry_hours) read at submit time.
//
// D38 Milestone 2 (package P2) rewrite. The expiry is now worked out on the
// database clock and capped at the end of the provider's slot minus the
// lead time (critique M2, covered by HA-M2-292). With a slot three days out
// the cap does not apply, so the quote must expire exactly 36 hours after it
// was stored when the setting is 36. Before this rewrite the test mocked the
// SQL calls and the JavaScript clock; it now runs quote admission on the
// guarded PostgreSQL fixture and compares the stored timestamps.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, quoteBody, platformDate,
  providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug UX-256 — a submitted quote expires using the live admin duration', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'quote_expiry_hours', '36');
    const bookingId = await insertQuoteRequest(database);

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ earliestDate: platformDate(3) }));

    expect(response.status).toBe(201);
    const stored = (await database.query(`SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::float8 AS lifetime_seconds
      FROM booking_quotes WHERE id = $1`, [response.body.data.id])).rows[0];
    // created_at is the transaction start and expires_at is read from the
    // clock a moment later, so allow a few seconds of difference.
    expect(stored.lifetime_seconds).toBeGreaterThanOrEqual(36 * 3600);
    expect(stored.lifetime_seconds).toBeLessThan(36 * 3600 + 5);
  });
}, 90000);
