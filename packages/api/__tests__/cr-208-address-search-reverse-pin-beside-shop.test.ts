// CR-208 (D24 Option A, 2026-10-18 review): for a map pin, Google's reverse
// lookup can list a nearby shop first, with its own barangay (the next one
// over). The street result is chosen over the shop, the shop's name never
// becomes the customer's street line, and a missing barangay is filled only
// from the areas that contain the pin (results typed "political"), not from
// a nearby place. Fixture: a realistic Cebu City shape, UNVERIFIED against
// live Google answers.
import { chooseReverseResult } from '../src/services/geo/address-search.service';
import { homeBesideShopReverseAnswer } from './helpers/address-search-harness';

type Results = Parameters<typeof chooseReverseResult>[0];

it('Bug CR-208 — a home pin beside a shop is prefilled with the street and the barangay that contains the pin, never the shop', () => {
  const results = (homeBesideShopReverseAnswer() as { results: Results }).results;

  expect(chooseReverseResult(results)).toEqual({
    address: {
      fullAddress: 'Gorordo Avenue',
      barangay: 'Lahug',
      city: 'Cebu City',
      province: 'Cebu',
      region: 'Central Visayas',
      zipCode: '6000',
      countryCode: 'PH',
    },
    formattedAddress: 'Gorordo Ave, Cebu City, Cebu, Philippines',
    placeId: 'ChIJgorordoAvenueRoute0007',
  });

  // With only the shop at street level, its name still stays out of the street line.
  const shopOnly = chooseReverseResult([results[0]!, results[2]!]);
  expect(shopOnly?.address.fullAddress).toBe('Gorordo Avenue');
  expect(JSON.stringify(shopOnly?.address)).not.toContain('Jollibee');
});
