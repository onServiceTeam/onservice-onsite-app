// HA-M2-31 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// an app older than 1.0.4 sends a quote with no earliest date. It gets 400
// with code APP_UPDATE_REQUIRED (checked before the body schema, so the app
// can tell the provider to update) and nothing is stored. Real HTTP with the
// exact body APK 1.0.3 sends, on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-31: a quote without earliestDate gets APP_UPDATE_REQUIRED', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId, {
      quotedPrice: 80000,
      description: 'Clean the unit and clear the drain line.',
      estimatedDurationMinutes: 90,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'APP_UPDATE_REQUIRED',
      message: 'Please update the onService app to send quotes.',
    });
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
  });
}, 90000);
