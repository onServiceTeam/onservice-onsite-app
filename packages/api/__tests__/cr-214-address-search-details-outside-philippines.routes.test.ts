// CR-214 (D24 Option A, 2026-10-18 review): a chosen suggestion that Google
// places outside the Philippines (a non-PH country part, or a location
// outside the Philippine bounds) cannot be a service address. Place details
// answers 404 "We could not find that address" and starts no pause, because
// Google answered normally. Real router, sign-in and validators; Google is a
// jest mock of fetch.
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
  CEBU_CITY_AREA, CEBU_CITY_DETAILS, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, googleJson, installDbMock,
  placeBody, postGeo,
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
    covered: true, area: CEBU_CITY_AREA, nearestArea: null, distanceKm: null,
  } as never);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-214 — a chosen place in another country, or outside the Philippine bounds, answers 404 and starts no pause', async () => {
  fakeRedis.clear();
  const japanParts = CEBU_CITY_DETAILS.addressComponents.map((component) => (component.types.includes('country')
    ? { longText: 'Japan', shortText: 'JP', types: ['country', 'political'] }
    : component));
  const answers = [
    // Inside the Philippine box, but Google says the country is Japan.
    { ...CEBU_CITY_DETAILS, addressComponents: japanParts },
    // Philippine country part, but a location in Tokyo.
    { ...CEBU_CITY_DETAILS, location: { latitude: 35.6762, longitude: 139.6503 } },
  ];

  for (const answer of answers) {
    fetchMock.mockResolvedValueOnce(googleJson(answer));
    const response = await postGeo(app, '/api/v1/geo/place', placeBody());
    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      message: 'We could not find that address. Please choose another suggestion or type your address.',
      statusCode: 404,
      code: 'address_not_found',
    });
  }
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();
  expect(serviceAreaService.checkCoverage).not.toHaveBeenCalled();
});
