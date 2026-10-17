// CR-420 (D24 Option A, 2026-10-18 review): each daily counter is increased
// and given its two-day expiry in one Redis transaction (MULTI/EXEC), so a
// counter is never left without an expiry. Before, INCR and EXPIRE were two
// commands: if the EXPIRE failed or ran past the time limit after the INCR
// worked, the counter stayed in Redis for good. The fake Redis refuses the
// whole transaction when one of its commands is refused, as Redis does when
// it refuses a command at queue time (EXECABORT). Real router, sign-in and
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
import { ADDRESS_SEARCH_COUNTER_TTL_SECONDS, ADDRESS_SEARCH_REDIS_PREFIX } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, googleJson, installDbMock, postGeo, searchBody,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const fetchMock = jest.fn();
const realFetch = globalThis.fetch;
const savedSecret = process.env.JWT_SECRET;
const app = buildGeoApp(geoRouter, errorMiddleware);

const counterKeys = (): string[] => fakeRedis.keys().filter((key) => key.startsWith(`${ADDRESS_SEARCH_REDIS_PREFIX}:20`));

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

it('Bug CR-420 — a day counter is never left in Redis without its two-day expiry, even when the expiry step is refused', async () => {
  // The expiry step refused: the call is refused (503), and no counter is left behind.
  fakeRedis.clear();
  fakeRedis.failOn.add('expire');
  const refused = await postGeo(app, '/api/v1/geo/autocomplete', searchBody());
  expect(refused.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(counterKeys().map((key) => [key, fakeRedis.peekTtl(key)]).filter(([, ttl]) => ttl === -1)).toEqual([]);

  // A normal call: the user, platform and status-card counters all carry the expiry.
  fakeRedis.clear();
  fetchMock.mockResolvedValueOnce(googleJson({ suggestions: [] }));
  expect((await postGeo(app, '/api/v1/geo/autocomplete', searchBody())).status).toBe(200);
  const keys = counterKeys();
  expect(keys).toHaveLength(3);
  for (const key of keys) {
    expect({ key, ttl: fakeRedis.peekTtl(key) }).toEqual({ key, ttl: ADDRESS_SEARCH_COUNTER_TTL_SECONDS });
  }
});
