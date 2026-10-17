// CR-410 (D24 Option A, 2026-10-18 review): a map pin that Google names as
// an address in another country (a pin near a sea border can do this) is not
// prefilled. Reverse lookup answers 200 with found false and the customer's
// own pin as the location, and starts no pause. Real router, sign-in and
// validators; Google is a jest mock of fetch.
const mockDbQuery = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => mockDbQuery(...args) } }));
jest.mock('../src/config/redis.config', () => {
  const { FakeRedis } = jest.requireActual('./helpers/fake-redis');
  return { redis: new FakeRedis() };
});
jest.mock('../src/services/service-area.service', () => ({ checkCoverage: jest.fn(), getActiveServiceAreas: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { redis } from '../src/config/redis.config';
import * as serviceAreaService from '../src/services/service-area.service';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { ADDRESS_SEARCH_COOLDOWN_KEY } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, PIN, buildGeoApp, googleJson, installDbMock, mandaueReverseAnswer,
  pinBody, postGeo,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const fetchMock = jest.fn();
const realFetch = globalThis.fetch;
const savedSecret = process.env.JWT_SECRET;
const app = buildGeoApp(geoRouter, errorMiddleware);

beforeAll(() => {
  process.env.JWT_SECRET = JWT_TEST_SECRET;
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  installDbMock(mockDbQuery);
  jest.mocked(serviceAreaService.getActiveServiceAreas).mockResolvedValue([CEBU_CITY_AREA] as never);
  jest.mocked(serviceAreaService.checkCoverage).mockResolvedValue({
    covered: false, area: null, nearestArea: CEBU_CITY_AREA, distanceKm: 31.2,
  } as never);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-410 — a pin Google names in another country answers 200 with found false, keeps the pin, and starts no pause', async () => {
  fakeRedis.clear();
  const answer = mandaueReverseAnswer() as { status: string; results: { address_components: { long_name: string; short_name: string; types: string[] }[] }[] };
  for (const result of answer.results) {
    result.address_components = result.address_components.map((component) => (component.types.includes('country')
      ? { long_name: 'Malaysia', short_name: 'MY', types: ['country', 'political'] }
      : component));
    if (!result.address_components.some((component) => component.types.includes('country'))) {
      result.address_components.push({ long_name: 'Malaysia', short_name: 'MY', types: ['country', 'political'] });
    }
  }
  fetchMock.mockResolvedValueOnce(googleJson(answer));

  const response = await postGeo(app, '/api/v1/geo/reverse', pinBody());

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({
    found: false, placeId: null, address: null, formattedAddress: null,
    location: { latitude: PIN.lat, longitude: PIN.lng },
    coverage: {
      covered: false, serviceAreaId: null, serviceAreaName: null, nearestServiceAreaName: 'Cebu City', distanceKm: 31.2,
    },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();
});
