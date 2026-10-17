// CR-210 to CR-213 (D24 Option A, 2026-10-18): the exact requests the server
// sends to Google, checked on a mocked fetch (no call ever reaches Google).
// Places API (New) gets the key in the X-Goog-Api-Key header, never in the
// URL; autocomplete asks for Philippine results in English with the billing
// session token and a location bias; place details asks only for the four
// Essentials fields; Geocoding (which takes the key only in the URL) asks
// for the pin in English. No request may follow a redirect. Endpoints and
// field masks are compared with literal strings copied from Google's
// documentation, never with the module's own constants, so a typo in the code
// fails here instead of on the first live call.
const mockDbQuery = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => mockDbQuery(...args) } }));
jest.mock('../src/config/redis.config', () => {
  const { FakeRedis } = jest.requireActual('./helpers/fake-redis');
  return { redis: new FakeRedis() };
});
jest.mock('../src/services/service-area.service', () => ({
  checkCoverage: jest.fn(),
  getActiveServiceAreas: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { redis } from '../src/config/redis.config';
import * as serviceAreaService from '../src/services/service-area.service';
import { autocomplete, placeAddress, reverseLookup } from '../src/services/geo/address-search.service';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, CEBU_CITY_DETAILS, CUSTOMER_A, FAKE_GOOGLE_KEY, SESSION_TOKEN, googleJson, installDbMock,
  mandaueReverseAnswer,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const fetchMock = jest.fn();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fakeRedis.clear();
  installDbMock(mockDbQuery);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  jest.mocked(serviceAreaService.getActiveServiceAreas).mockResolvedValue([CEBU_CITY_AREA] as never);
  jest.mocked(serviceAreaService.checkCoverage).mockResolvedValue({
    covered: true, area: CEBU_CITY_AREA, nearestArea: null, distanceKm: null,
  } as never);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

function sentRequest(index = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
}

it('Bug CR-210 — autocomplete posts a Philippines-only English request with the session token, the key in a header and a bias around the pin', async () => {
  const prediction = (n: number) => ({
    placePrediction: {
      place: `places/ChIJsuggestion000${n}`,
      placeId: `ChIJsuggestion000${n}`,
      text: { text: `Gorordo Avenue ${n}, Cebu City, Cebu, Philippines`, matches: [{ endOffset: 7 }] },
      structuredFormat: { mainText: { text: `Gorordo Avenue ${n}` }, secondaryText: { text: 'Cebu City, Cebu, Philippines' } },
      types: ['route', 'geocode'],
      distanceMeters: 1200,
    },
  });
  fetchMock.mockResolvedValue(googleJson({
    suggestions: [
      prediction(1), prediction(2), { placePrediction: { placeId: 'bad id!', text: { text: 'x' } } },
      prediction(3), prediction(4), prediction(5), prediction(6),
      { queryPrediction: { text: { text: 'gorordo' } } },
    ],
  }));

  const result = await autocomplete({
    userId: CUSTOMER_A, query: 'Gorordo', sessionToken: SESSION_TOKEN, latitude: 10.3312, longitude: 123.9046,
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const { url, init } = sentRequest();
  expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
  expect(url).not.toContain(FAKE_GOOGLE_KEY);
  expect(init.method).toBe('POST');
  expect(init.redirect).toBe('error');
  expect(init.headers['X-Goog-Api-Key']).toBe(FAKE_GOOGLE_KEY);
  expect(init.headers['X-Goog-FieldMask']).toBe(
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
  );
  expect(JSON.parse(String(init.body))).toEqual({
    input: 'Gorordo',
    sessionToken: SESSION_TOKEN,
    includedRegionCodes: ['ph'],
    languageCode: 'en',
    locationBias: { circle: { center: { latitude: 10.3312, longitude: 123.9046 }, radius: 25000 } },
  });
  // Five at most, malformed ids and query predictions dropped, only our three fields.
  expect(result.suggestions).toHaveLength(5);
  expect(result.suggestions[0]).toEqual({
    placeId: 'ChIJsuggestion0001', mainText: 'Gorordo Avenue 1', secondaryText: 'Cebu City, Cebu, Philippines',
  });
  expect(result.suggestions.map((s) => s.placeId)).not.toContain('bad id!');
});

it('Bug CR-211 — autocomplete without a pin biases suggestions to the default active service area', async () => {
  fetchMock.mockResolvedValue(googleJson({ suggestions: [] }));

  await autocomplete({ userId: CUSTOMER_A, query: 'Lahug', sessionToken: SESSION_TOKEN });

  expect(JSON.parse(String(sentRequest().init.body)).locationBias).toEqual({
    circle: { center: { latitude: 10.3157, longitude: 123.8854 }, radius: 15000 },
  });
});

it('Bug CR-212 — place details sends the session token and only the Essentials field mask, with the key in a header and not the URL', async () => {
  fetchMock.mockResolvedValue(googleJson(CEBU_CITY_DETAILS));

  await placeAddress({ userId: CUSTOMER_A, placeId: 'ChIJcebuCityGorordo0001', sessionToken: SESSION_TOKEN });

  const { url, init } = sentRequest();
  expect(url).toBe(`https://places.googleapis.com/v1/places/ChIJcebuCityGorordo0001?sessionToken=${SESSION_TOKEN}&languageCode=en&regionCode=ph`);
  expect(url).not.toContain(FAKE_GOOGLE_KEY);
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('error');
  expect(init.headers['X-Goog-Api-Key']).toBe(FAKE_GOOGLE_KEY);
  expect(init.headers['X-Goog-FieldMask']).toBe('id,formattedAddress,location,addressComponents');
});

it('Bug CR-213 — reverse lookup asks Geocoding for the pin in English and refuses redirects', async () => {
  fetchMock.mockResolvedValue(googleJson(mandaueReverseAnswer()));

  await reverseLookup({ userId: CUSTOMER_A, latitude: 10.3333333, longitude: 123.9333333 });

  const { url, init } = sentRequest();
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe('https://maps.googleapis.com/maps/api/geocode/json');
  expect(parsed.searchParams.get('latlng')).toBe('10.3333333,123.9333333');
  expect(parsed.searchParams.get('language')).toBe('en');
  expect(parsed.searchParams.get('key')).toBe(FAKE_GOOGLE_KEY);
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('error');
});
