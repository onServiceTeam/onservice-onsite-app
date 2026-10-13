// HA-M2-60 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// customer's quote cards say "New on onService" for a provider with fewer
// than 3 visible reviews and not for one with 3, and give the exact amount a
// quote is above the customer's budget (85,000 against a 70,000 top: 15,000
// above); a quote inside the budget says so. Compare mode so both providers
// quote. Real HTTP on the guarded PostgreSQL fixture.
//
// Review fix: ratingCount used to come from providers.total_reviews, which no
// application code writes (review.service maintains only providers.rating),
// so every real provider would have shown 0 reviews and the "New" badge. The
// cards now count real review rows the way the provider profile does:
// visible reviews only, demo reviews excluded. The stale column is set to
// misleading values here (A 0, B 9) to prove it is not read. Provider A has
// exactly 3 visible reviews (the boundary: not new) plus a hidden one and a
// demo one; provider B has 2 visible reviews plus a hidden one.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, upsertPlatformSetting, addReview,
  customerA, providerA, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const originalFixtureFlag = process.env.ENABLE_TEST_FIXTURES;
afterEach(() => {
  if (originalFixtureFlag === undefined) delete process.env.ENABLE_TEST_FIXTURES;
  else process.env.ENABLE_TEST_FIXTURES = originalFixtureFlag;
});

it('HA-M2-60: quote cards show isNew under 3 reviews and the exact above-budget amount', async () => {
  // Production setting: demo content hidden (review.service's demo exclusion).
  process.env.ENABLE_TEST_FIXTURES = '0';
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    await database.query(`UPDATE providers SET rating = CASE id WHEN $1::uuid THEN 4.80 ELSE 5.00 END,
        total_reviews = CASE id WHEN $1::uuid THEN 0 ELSE 9 END, total_jobs = CASE id WHEN $1::uuid THEN 7 ELSE 2 END
      WHERE id IN ($1, $2)`, [providerA, providerB]);
    for (let i = 0; i < 3; i += 1) await addReview(database, providerA);
    await addReview(database, providerA, { visible: false });
    await addReview(database, providerA, { comment: '[demo] Seeded marketplace review.' });
    for (let i = 0; i < 2; i += 1) await addReview(database, providerB);
    await addReview(database, providerB, { visible: false });
    const bookingId = await insertQuoteRequest(database, { budgetMin: 50000, budgetMax: 70000 });
    await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ quotedPrice: 85000 }));
    await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody({ quotedPrice: 60000 }));

    const response = await flowHttp(customerA, 'customer').quotes(bookingId);

    expect(response.status).toBe(200);
    const byProvider = Object.fromEntries((response.body.data as Array<{ providerId: string }>).map(q => [q.providerId, q]));
    expect(byProvider[providerA]).toMatchObject({
      budget: { kind: 'above', aboveBy: 15000 },
      provider: { ratingAverage: 4.8, ratingCount: 3, isNew: false, jobsCompleted: 7, name: 'Synthetic Aircon Team A' },
    });
    expect(byProvider[providerB]).toMatchObject({
      budget: { kind: 'within', aboveBy: 0 },
      provider: { ratingAverage: 5, ratingCount: 2, isNew: true, jobsCompleted: 2 },
    });
  });
}, 90000);
