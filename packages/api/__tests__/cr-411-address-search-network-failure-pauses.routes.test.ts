// CR-411 (D24 Option A, 2026-10-18 review): a call that cannot reach Google
// at all (a network failure, such as a DNS or connection error) answers 503
// and starts the pause like a refusal, so the server does not keep trying
// while the network is down. The next call does not reach Google. Real
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
import * as serviceAreaService from '../src/services/service-area.service';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { ADDRESS_SEARCH_COOLDOWN_KEY } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, buildGeoApp, installDbMock, pinBody, postGeo, searchBody,
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

it('Bug CR-411 — a network failure reaching Google answers 503, starts the pause, and the next call does not reach Google', async () => {
  fakeRedis.clear();
  fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

  const failed = await postGeo(app, '/api/v1/geo/autocomplete', searchBody());

  expect(failed.status).toBe(503);
  expect(failed.body.error.code).toBe('address_search_unavailable');
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'NETWORK_ERROR' });
  expect(await fakeRedis.ttl(ADDRESS_SEARCH_COOLDOWN_KEY)).toBe(600);

  const next = await postGeo(app, '/api/v1/geo/reverse', pinBody());
  expect(next.status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
