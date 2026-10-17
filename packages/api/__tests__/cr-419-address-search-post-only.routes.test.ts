// CR-419 (D24 Option A, 2026-10-18 review): address search takes its details
// only in a POST JSON body. A web server access log records the whole request
// line, so what a customer types, their pin and the place ID must never be in
// a URL. The old GET form (?q=, ?lat=&lng=, /place/<id>) is not served: a
// signed-in GET answers 404 and never reaches Google, and values sent in the
// query string of a POST are not read. Real router, sign-in and validators;
// Google is a jest mock of fetch.
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

import request from 'supertest';
import { redis } from '../src/config/redis.config';
import * as serviceAreaService from '../src/services/service-area.service';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, CUSTOMER_A, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, SESSION_TOKEN, bearer, buildGeoApp, installDbMock,
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

it('Bug CR-419 — address search is POST-only: the old GET form with the search in the URL is not served and never reaches Google', async () => {
  fakeRedis.clear();
  const signedIn = bearer(CUSTOMER_A);

  for (const path of [
    `/api/v1/geo/autocomplete?q=Gorordo&sessionToken=${SESSION_TOKEN}`,
    `/api/v1/geo/place/ChIJcebuCityGorordo0001?sessionToken=${SESSION_TOKEN}`,
    '/api/v1/geo/reverse?lat=10.3312&lng=123.9046',
  ]) {
    expect((await request(app).get(path).set('Authorization', signedIn)).status).toBe(404);
  }

  // A POST with the values in the query string instead of the body is refused.
  const queryOnly = await request(app)
    .post(`/api/v1/geo/reverse?lat=10.3312&lng=123.9046`)
    .set('Authorization', signedIn)
    .send({});
  expect(queryOnly.status).toBe(400);

  expect(fetchMock).not.toHaveBeenCalled();
});
