// CR-413 (D24 Option A, 2026-10-18 review): when Place Details answers 400
// INVALID_ARGUMENT (our field mask, session token or place ID was not
// accepted), that is our mistake, not a missing address. The server answers
// 503 "unavailable" instead of 404 "could not find that address", logs a
// warning with Google's status word (never the place ID or Google's message),
// records it for the admin status card, and starts no pause. Only 404
// NOT_FOUND means "no such place" (CR-222). Real router, sign-in and
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
import { logger } from '../src/utils/logger';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { ADDRESS_SEARCH_COOLDOWN_KEY, ADDRESS_SEARCH_LAST_STATUS_KEY } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  DETAILS_PLACE_ID, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, allLogText, buildGeoApp, googleJson, installDbMock, placeBody, postGeo,
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
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-413 — a Place Details 400 INVALID_ARGUMENT answers 503, is logged with Google\'s status word, and starts no pause', async () => {
  fakeRedis.clear();
  fetchMock.mockResolvedValueOnce(googleJson({
    error: { code: 400, message: `Invalid field mask or place id: ${DETAILS_PLACE_ID}`, status: 'INVALID_ARGUMENT' },
  }, 400));

  const response = await postGeo(app, '/api/v1/geo/place', placeBody());

  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('address_search_unavailable');
  expect(logger.warn).toHaveBeenCalledWith('Address search: Google call did not succeed', {
    operation: 'details', outcome: 'failed', googleStatus: 'INVALID_ARGUMENT', httpStatus: 400,
  });
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_LAST_STATUS_KEY)!)).toMatchObject({ status: 'INVALID_ARGUMENT', operation: 'details' });
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();
  expect(allLogText(logger)).not.toContain(DETAILS_PLACE_ID);
});
