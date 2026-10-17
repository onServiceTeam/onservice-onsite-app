// CR-412 (D24 Option A, 2026-10-18 review): Ken's daily caps fail closed even
// when Redis still answers reads but refuses writes, as a Redis at its memory
// limit with the noeviction policy does (GET works, INCR fails). The cool-down
// read succeeds, the counters cannot be written, so the call is refused with
// 503 and never reaches Google uncounted. (CR-233 covers Redis refusing
// everything, which stops the call earlier, at the cool-down read.) Real
// router, sign-in and validators; Google is a jest mock of fetch.
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
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, googleJson, installDbMock, pinBody, postGeo, searchBody,
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

it('Bug CR-412 — when Redis answers reads but refuses the counter write, the call is refused with 503 and never reaches Google uncounted', async () => {
  fakeRedis.clear();
  fakeRedis.failOn.add('incr');
  fetchMock.mockResolvedValue(googleJson({ suggestions: [] }));

  const search = await postGeo(app, '/api/v1/geo/autocomplete', searchBody());
  const reverse = await postGeo(app, '/api/v1/geo/reverse', pinBody());

  for (const response of [search, reverse]) {
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('address_search_unavailable');
  }
  expect(fetchMock).not.toHaveBeenCalled();
  // The cool-down read did work: the refusal came from the counter step.
  expect(fakeRedis.calls).toContain('get');
  expect(logger.warn).toHaveBeenCalledWith('Address search: usage counters unavailable; call refused', { operation: 'autocomplete' });
  expect(logger.warn).toHaveBeenCalledWith('Address search: usage counters unavailable; call refused', { operation: 'reverse' });
});
