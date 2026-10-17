// CR-414 (D24 Option A, 2026-10-18 review): the geo router answers its own
// errors, so an expected refusal of a place lookup (401 not signed in, 404 no
// such place, 429 over a cap, 503 switched off) is never written to the log
// by the shared error handler (errorMiddleware logs the request path and the
// error message), and no log line holds the place ID, the session token or
// what the customer typed. The test app mounts errorMiddleware after the
// router, as server.ts does. Real router, sign-in and validators; Google is a
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
import { logger } from '../src/utils/logger';
import * as serviceAreaService from '../src/services/service-area.service';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, DETAILS_PLACE_ID, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, SESSION_TOKEN, TYPED, allLogText, buildGeoApp,
  googleJson, installDbMock, placeBody, postGeo, searchBody,
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
  jest.mocked(serviceAreaService.getActiveServiceAreas).mockResolvedValue([CEBU_CITY_AREA] as never);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-414 — refused place lookups (401, 404, 429, 503) are never logged by the shared error handler and no log line holds the place ID or the search', async () => {
  fakeRedis.clear();
  installDbMock(mockDbQuery, { address_search_user_daily_lookup_limit: '1' });

  // 401: not signed in.
  expect((await postGeo(app, '/api/v1/geo/place', placeBody(), null)).status).toBe(401);
  // 404: Google has no such place (this call uses the one lookup allowed today).
  fetchMock.mockResolvedValueOnce(googleJson({ error: { code: 404, message: `Not found: ${DETAILS_PLACE_ID}`, status: 'NOT_FOUND' } }, 404));
  expect((await postGeo(app, '/api/v1/geo/place', placeBody())).status).toBe(404);
  // 429: over the per-user lookup cap.
  expect((await postGeo(app, '/api/v1/geo/place', placeBody())).status).toBe(429);
  // 503: switched off.
  installDbMock(mockDbQuery, { address_search_enabled: 'false' });
  fakeRedis.clear(); // drop the 60-second settings cache
  expect((await postGeo(app, '/api/v1/geo/place', placeBody())).status).toBe(503);
  expect((await postGeo(app, '/api/v1/geo/autocomplete', searchBody())).status).toBe(503);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const messages = [
    ...jest.mocked(logger.warn).mock.calls, ...jest.mocked(logger.error).mock.calls,
  ].map((call) => call[0]);
  expect(messages).not.toContain('Request rejected');
  expect(messages).not.toContain('Request error');
  const logs = allLogText(logger);
  for (const secret of [DETAILS_PLACE_ID, SESSION_TOKEN, TYPED, 'Gorordo']) {
    expect(logs).not.toContain(secret);
  }
});
