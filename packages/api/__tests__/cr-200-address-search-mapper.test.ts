// CR-200 to CR-206 (D24 Option A, Google address search, 2026-10-18): Google
// address parts become our address shape (createAddressSchema fields: the
// street line, barangay, city or municipality, province, region, postal
// code). The fixtures are realistic Philippine shapes written from Google's
// type list and public examples; they are UNVERIFIED against live answers
// because billing was off on 2026-10-18. Every mapped value is a prefill the
// customer can edit.
import {
  chooseReverseResult,
  mapAddressComponents,
  type AddressComponent,
} from '../src/services/geo/address-search.service';
import {
  CEBU_CITY_DETAILS, CEBU_POI_DETAILS, CONSOLACION_GEOCODE_PARTS, MANDAUE_GEOCODE_PARTS, mandaueReverseAnswer,
} from './helpers/address-search-harness';

function fromPlaces(parts: { longText: string; shortText?: string; types: string[] }[]): AddressComponent[] {
  return parts.map((part) => ({ longText: part.longText, shortText: part.shortText ?? part.longText, types: part.types }));
}

function fromGeocoding(parts: { long_name: string; short_name: string; types: string[] }[]): AddressComponent[] {
  return parts.map((part) => ({ longText: part.long_name, shortText: part.short_name, types: part.types }));
}

it('Bug CR-200 — a Cebu City street address with the barangay as sublocality_level_1 maps to street, barangay, city, province and postal code', () => {
  expect(mapAddressComponents(fromPlaces(CEBU_CITY_DETAILS.addressComponents))).toEqual({
    fullAddress: '123 Gorordo Avenue',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    region: 'Central Visayas',
    zipCode: '6000',
    countryCode: 'PH',
  });
});

it('Bug CR-201 — a Mandaue City address with the barangay as neighborhood maps the neighborhood to the barangay', () => {
  expect(mapAddressComponents(fromGeocoding(MANDAUE_GEOCODE_PARTS))).toEqual({
    fullAddress: '45 A. C. Cortes Avenue',
    barangay: 'Ibabao-Estancia',
    city: 'Mandaue City',
    province: 'Cebu',
    region: 'Central Visayas',
    zipCode: '6014',
    countryCode: 'PH',
  });
});

it('Bug CR-202 — a municipality with no locality takes the city from administrative_area_level_3 and the barangay from level 5', () => {
  expect(mapAddressComponents(fromGeocoding(CONSOLACION_GEOCODE_PARTS))).toEqual({
    fullAddress: 'Cebu North Road',
    barangay: 'Tayud',
    city: 'Consolacion',
    province: 'Cebu',
    region: 'Central Visayas',
    zipCode: '6001',
    countryCode: 'PH',
  });
});

it('Bug CR-203 — a point of interest leads the street line with its name and prefers sublocality_level_1 over neighborhood for the barangay', () => {
  expect(mapAddressComponents(fromPlaces(CEBU_POI_DETAILS.addressComponents))).toMatchObject({
    fullAddress: 'Ayala Center Cebu, Archbishop Reyes Avenue',
    barangay: 'Luz',
    city: 'Cebu City',
    province: 'Cebu',
  });
});

it('Bug CR-204 — a part named "Barangay ..." wins as the barangay, without the prefix, and a part equal to the city is never the barangay', () => {
  const parts = fromGeocoding([
    { long_name: 'Unit 12B', short_name: 'Unit 12B', types: ['subpremise'] },
    { long_name: 'Avida Towers Riala', short_name: 'Avida Towers Riala', types: ['premise'] },
    { long_name: 'Cebu City', short_name: 'Cebu City', types: ['sublocality_level_1', 'political'] },
    { long_name: 'Villa Verde Subdivision', short_name: 'Villa Verde', types: ['neighborhood', 'political'] },
    { long_name: 'Barangay Apas', short_name: 'Apas', types: ['sublocality_level_2', 'political'] },
    { long_name: 'Cebu City', short_name: 'Cebu City', types: ['locality', 'political'] },
    { long_name: 'Cebu', short_name: 'Cebu', types: ['administrative_area_level_2', 'political'] },
    { long_name: 'Philippines', short_name: 'PH', types: ['country', 'political'] },
  ]);
  expect(mapAddressComponents(parts)).toMatchObject({
    fullAddress: 'Unit 12B, Avida Towers Riala',
    barangay: 'Apas',
    city: 'Cebu City',
    province: 'Cebu',
  });
  // Without the labelled part, the sublocality named like the city is
  // skipped, and so is the subdivision (CR-207), so the barangay stays empty
  // for the customer to fill in.
  const unlabelled = parts.filter((part) => part.longText !== 'Barangay Apas');
  expect(mapAddressComponents(unlabelled).barangay).toBeNull();
});

it('Bug CR-205 — a Metro Manila address with no administrative_area_level_2 uses "Metro Manila" as the province', () => {
  const parts = fromGeocoding([
    { long_name: '6750', short_name: '6750', types: ['street_number'] },
    { long_name: 'Ayala Avenue', short_name: 'Ayala Ave', types: ['route'] },
    { long_name: 'San Lorenzo', short_name: 'San Lorenzo', types: ['sublocality_level_1', 'political'] },
    { long_name: 'Makati', short_name: 'Makati', types: ['locality', 'political'] },
    { long_name: 'Metro Manila', short_name: 'Metro Manila', types: ['administrative_area_level_1', 'political'] },
    { long_name: 'Philippines', short_name: 'PH', types: ['country', 'political'] },
    { long_name: '1223', short_name: '1223', types: ['postal_code'] },
  ]);
  expect(mapAddressComponents(parts)).toEqual({
    fullAddress: '6750 Ayala Avenue',
    barangay: 'San Lorenzo',
    city: 'Makati',
    province: 'Metro Manila',
    region: 'Metro Manila',
    zipCode: '1223',
    countryCode: 'PH',
  });
});

it('Bug CR-206 — a reverse lookup picks the street-level result over a plus code and fills the missing barangay from a broader result', () => {
  const answer = mandaueReverseAnswer() as { results: Parameters<typeof chooseReverseResult>[0] };
  const choice = chooseReverseResult(answer.results);
  expect(choice).toEqual({
    address: {
      fullAddress: '45 A. C. Cortes Avenue',
      barangay: 'Ibabao-Estancia',
      city: 'Mandaue City',
      province: 'Cebu',
      region: 'Central Visayas',
      zipCode: '6014',
      countryCode: 'PH',
    },
    formattedAddress: '45 A.C. Cortes Ave, Mandaue City, 6014 Cebu, Philippines',
    placeId: 'ChIJmandaueCortes0004',
  });
});
