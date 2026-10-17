// CR-422 (D24 Option A, 2026-10-18 review): the address search settings are
// read through getSetting(), which asks Redis first with no time limit of its
// own, and the shared Redis client queues commands while it reconnects. When
// Redis stops answering, an address search request is refused with 503
// within the settings time limit (2 seconds) instead of waiting for Redis,
// and it never falls back to the default settings (the default switch is
// "on", so an admin's "off" could otherwise come back during an outage).
// Real router, sign-in and validators; Google is a jest mock of fetch.
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
import { ADDRESS_SEARCH_POLICY_TIMEOUT_MS } from '../src/services/geo/address-search.service';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, googleJson, installDbMock, postGeo, searchBody,
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
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-422 — when Redis stops answering, address search is refused with 503 within the settings time limit and never reaches Google', async () => {
  fakeRedis.clear();
  fakeRedis.hangOn.add('get');
  fetchMock.mockResolvedValue(googleJson({ suggestions: [] }));
  expect(ADDRESS_SEARCH_POLICY_TIMEOUT_MS).toBe(2_000);

  const started = Date.now();
  const response = await postGeo(app, '/api/v1/geo/autocomplete', searchBody());
  const elapsed = Date.now() - started;

  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('address_search_unavailable');
  expect(elapsed).toBeGreaterThanOrEqual(1_900);
  expect(elapsed).toBeLessThan(8_000);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(logger.warn).toHaveBeenCalledWith('Address search: settings unavailable; call refused', { operation: 'autocomplete' });
}, 20_000);
