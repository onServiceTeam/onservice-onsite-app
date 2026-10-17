// CR-415 (D24 Option A, 2026-10-18 review): an admin who sets a daily cap to
// 0 switches that part of address search off. The server then answers 503
// "Address search is unavailable right now" without counting the call or
// reaching Google, instead of 429 "You have reached today's address search
// limit", which would tell customers they used up something they never used.
// A per-user cap at 0 leaves the other kind of call working. Real router,
// sign-in and validators; Google is a jest mock of fetch.
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
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, googleJson, installDbMock, mandaueReverseAnswer,
  pinBody, postGeo, searchBody,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const fetchMock = jest.fn();
const realFetch = globalThis.fetch;
const savedSecret = process.env.JWT_SECRET;
const app = buildGeoApp(geoRouter, errorMiddleware);
const UNAVAILABLE = {
  message: 'Address search is unavailable right now. Please type your address.',
  statusCode: 503,
  code: 'address_search_unavailable',
};

beforeAll(() => {
  process.env.JWT_SECRET = JWT_TEST_SECRET;
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
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

it('Bug CR-415 — a daily cap set to 0 answers 503 "unavailable" without counting or calling Google, not "limit reached"', async () => {
  // Suggestions cap 0: suggestions are off, pin lookups still work.
  fakeRedis.clear();
  installDbMock(mockDbQuery, { address_search_user_daily_autocomplete_limit: '0' });
  fetchMock.mockResolvedValueOnce(googleJson(mandaueReverseAnswer()));

  const suggestions = await postGeo(app, '/api/v1/geo/autocomplete', searchBody());
  expect(suggestions.status).toBe(503);
  expect(suggestions.body.error).toEqual(UNAVAILABLE);
  expect(fakeRedis.keys().filter((key) => key.startsWith('geo:'))).toEqual([]);
  expect((await postGeo(app, '/api/v1/geo/reverse', pinBody())).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Platform cap 0: every call is off.
  fakeRedis.clear();
  fetchMock.mockClear();
  installDbMock(mockDbQuery, { address_search_platform_daily_limit: '0' });
  for (const response of [
    await postGeo(app, '/api/v1/geo/autocomplete', searchBody()),
    await postGeo(app, '/api/v1/geo/reverse', pinBody()),
  ]) {
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual(UNAVAILABLE);
  }
  expect(fakeRedis.keys().filter((key) => key.startsWith('geo:'))).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
