// HA-M2-321 (customer human audit 2026-10-13, D38 Milestone 2, critique L8;
// W3-A overflow number for an item the P2 build report left untested): the
// provider's commission preview for an open quote request uses the shared
// request eligibility rule (providerEligibleForRequestSql), the same rule as
// quote admission, the Requests list and the fan-out. Before D38 the preview
// had its own copy that let a provider with no map location see any request
// in their category. Now that provider gets the "not found" answer, while an
// eligible provider on the same request gets a commission rate. Real service
// and SQL (migrations 125 and 162 among the fixture's real files) on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, addProvider, insertQuoteRequest, providerA, providerC, providerUserC,
} from './helpers/request-flow-postgres';
import { getBookingCommissionPreview } from '../src/services/booking-financial-terms.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-321: the commission preview refuses a provider the shared request eligibility rule excludes', async () => {
  await withRequestFlowDatabase(async database => {
    // Provider C offers the request's category with a wide radius but has no map location.
    await addProvider(database, { providerId: providerC, userId: providerUserC, latitude: null, longitude: null, radiusKm: 500 });
    const bookingId = await insertQuoteRequest(database);

    await expect(getBookingCommissionPreview(providerC, bookingId))
      .rejects.toMatchObject({ statusCode: 404, message: 'Booking not found.' });
    await expect(getBookingCommissionPreview(providerA, bookingId)).resolves.toMatchObject({
      commissionRate: expect.any(Number), isFixedForBooking: false,
    });
  });
}, 90000);
