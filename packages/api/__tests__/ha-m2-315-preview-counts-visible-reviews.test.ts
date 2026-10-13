// HA-M2-315 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): the confirm screen's
// provider card counts the provider's reviews the way the quote cards
// (HA-M2-60) and the provider profile do: visible reviews only, demo reviews
// excluded. It used to read providers.total_reviews, which no application
// code writes, so every real provider would have shown 0 reviews and "New on
// onService" on the confirm screen. Provider A has exactly 3 visible reviews
// (not new) plus a hidden one and a demo one, and a stale total_reviews of 0.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addReview, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const originalFixtureFlag = process.env.ENABLE_TEST_FIXTURES;
afterEach(() => {
  if (originalFixtureFlag === undefined) delete process.env.ENABLE_TEST_FIXTURES;
  else process.env.ENABLE_TEST_FIXTURES = originalFixtureFlag;
});

it('HA-M2-315: the confirm preview counts only visible reviews, and 3 is not new', async () => {
  // Production setting: demo content hidden (review.service's demo exclusion).
  process.env.ENABLE_TEST_FIXTURES = '0';
  await withRequestFlowDatabase(async database => {
    await database.query('UPDATE providers SET rating = 4.70, total_reviews = 0 WHERE id = $1', [providerA]);
    for (let i = 0; i < 3; i += 1) await addReview(database, providerA);
    await addReview(database, providerA, { visible: false });
    await addReview(database, providerA, { comment: '[demo] Seeded marketplace review.' });
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(quote.status).toBe(201);

    const preview = await flowHttp(customerA, 'customer').confirmPreview(bookingId, quote.body.data.id);

    expect(preview.status).toBe(200);
    expect(preview.body.data.provider).toMatchObject({ id: providerA, ratingAverage: 4.7, ratingCount: 3, isNew: false });
  });
}, 90000);
