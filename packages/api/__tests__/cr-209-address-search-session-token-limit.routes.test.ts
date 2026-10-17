// CR-209 (D24 Option A, 2026-10-18 review): Google's Places API (New)
// reference says a session token "Must be a URL and filename safe base64
// string with at most 36 ASCII characters in length. Otherwise an
// INVALID_ARGUMENT error is returned." A longer token is refused by our
// validator with 400 before it is counted or sent to Google; a 36-character
// version 4 UUID (what the app sends) is accepted. Real router, sign-in and
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
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, CEBU_CITY_DETAILS, DETAILS_PLACE_ID, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, SESSION_TOKEN, TYPED,
  buildGeoApp, googleJson, installDbMock, postGeo,
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

it('Bug CR-209 — a session token over Google\'s 36-character limit is refused with 400 before it is counted or sent to Google', async () => {
  fakeRedis.clear();
  const tooLong = `${SESSION_TOKEN}a`; // 37 characters
  expect(SESSION_TOKEN).toHaveLength(36);

  const search = await postGeo(app, '/api/v1/geo/autocomplete', { q: TYPED, sessionToken: tooLong });
  const place = await postGeo(app, '/api/v1/geo/place', { placeId: DETAILS_PLACE_ID, sessionToken: tooLong });

  for (const response of [search, place]) {
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: 'sessionToken', message: 'Session token must be 16 to 36 letters, digits, dashes or underscores.' },
    ]);
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(fakeRedis.keys()).toEqual([]);

  // The app's own token, a 36-character version 4 UUID, is accepted.
  fetchMock.mockResolvedValueOnce(googleJson({ suggestions: [] })).mockResolvedValueOnce(googleJson(CEBU_CITY_DETAILS));
  expect((await postGeo(app, '/api/v1/geo/autocomplete', { q: TYPED, sessionToken: SESSION_TOKEN })).status).toBe(200);
  expect((await postGeo(app, '/api/v1/geo/place', { placeId: DETAILS_PLACE_ID, sessionToken: SESSION_TOKEN })).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
