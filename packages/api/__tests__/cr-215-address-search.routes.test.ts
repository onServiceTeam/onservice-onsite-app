// CR-215 to CR-234 and CR-249 (D24 Option A, 2026-10-18): POST /api/v1/geo/*
// through the real router, the real sign-in middleware (signed test
// sessions, the canonical user lookup answered by a database stand-in), the
// real validators, the real settings reads (falling back to SETTING_DEFAULTS
// unless a test sets a value) and an in-memory Redis. The search text, pins
// and place IDs travel in a JSON body, never in the URL. Google is a jest
// mock of global fetch in every test; nothing reaches Google. The
// service-area resolver is mocked so each test controls whether a location is
// covered.
const mockDbQuery = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => mockDbQuery(...args) } }));
jest.mock('../src/config/redis.config', () => {
  const { FakeRedis } = jest.requireActual('./helpers/fake-redis');
  return { redis: new FakeRedis() };
});
jest.mock('../src/services/service-area.service', () => ({
  checkCoverage: jest.fn(),
  getActiveServiceAreas: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { redis } from '../src/config/redis.config';
import { logger } from '../src/utils/logger';
import * as serviceAreaService from '../src/services/service-area.service';
import geoRouter from '../src/routes/geo.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { ADDRESS_SEARCH_COOLDOWN_KEY, addressSearchKeys, manilaDay } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  CEBU_CITY_AREA, CEBU_CITY_DETAILS, CUSTOMER_A, CUSTOMER_B, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, PIN, SESSION_TOKEN,
  allLogText, buildGeoApp, googleJson, hangingFetch, installDbMock, mandaueReverseAnswer, pinBody, placeBody,
  postGeo, searchBody,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const fetchMock = jest.fn();
const realFetch = globalThis.fetch;
const savedSecret = process.env.JWT_SECRET;

const app = buildGeoApp(geoRouter, errorMiddleware);

const search = (body: unknown = searchBody(), userId: string | null = CUSTOMER_A) => postGeo(app, '/api/v1/geo/autocomplete', body, userId);
const details = (body: unknown = placeBody(), userId: string | null = CUSTOMER_A) => postGeo(app, '/api/v1/geo/place', body, userId);
const reverse = (body: unknown = pinBody(), userId: string | null = CUSTOMER_A) => postGeo(app, '/api/v1/geo/reverse', body, userId);

beforeAll(() => {
  process.env.JWT_SECRET = JWT_TEST_SECRET;
});

beforeEach(() => {
  fakeRedis.clear();
  installDbMock(mockDbQuery);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  jest.mocked(logger.info).mockClear();
  jest.mocked(logger.warn).mockClear();
  jest.mocked(logger.error).mockClear();
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

it('Bug CR-215 — every address search route answers 401 without sign-in and never calls Google', async () => {
  for (const call of [search(searchBody(), null), details(placeBody(), null), reverse(pinBody(), null)]) {
    const response = await call;
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-216 — autocomplete refuses search text under 2 or over 120 characters, and a missing session token, before calling Google', async () => {
  expect((await search(searchBody('a'))).status).toBe(400);
  expect((await search(searchBody('x'.repeat(121)))).status).toBe(400);
  expect((await search({ q: 'Lahug' })).status).toBe(400);
  expect((await search({ q: 'Lahug', sessionToken: 'short' })).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-217 — coordinates outside the Philippines, half a coordinate pair, or text for a number are refused before calling Google', async () => {
  expect((await reverse(pinBody(35.6762, 139.6503))).status).toBe(400); // Tokyo
  expect((await reverse(pinBody(10.3, 'abc'))).status).toBe(400);
  expect((await reverse({ lat: 10.3 })).status).toBe(400);
  expect((await search({ ...searchBody(), lat: 10.3 })).status).toBe(400);
  const refused = await reverse(pinBody(35.6762, 139.6503));
  expect(JSON.stringify(refused.body)).not.toContain('35.6762');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-218 — a place ID in the wrong format is refused before calling Google', async () => {
  expect((await details(placeBody('short'))).status).toBe(400);
  expect((await details(placeBody('ChIJ$$bad/id000'))).status).toBe(400);
  expect((await details({ placeId: 'ChIJcebuCityGorordo0001' })).status).toBe(400); // no session token
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-219 — a chosen suggestion comes back as our address shape with its service-area coverage from the shared resolver', async () => {
  fetchMock.mockResolvedValue(googleJson(CEBU_CITY_DETAILS));

  const response = await details();

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    success: true,
    data: {
      found: true,
      placeId: 'ChIJcebuCityGorordo0001',
      address: {
        fullAddress: '123 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City',
        province: 'Cebu', region: 'Central Visayas', zipCode: '6000',
      },
      formattedAddress: '123 Gorordo Ave, Cebu City, 6000 Cebu, Philippines',
      location: { latitude: 10.3312, longitude: 123.9046 },
      coverage: {
        covered: true, serviceAreaId: CEBU_CITY_AREA.id, serviceAreaName: 'Cebu City',
        nearestServiceAreaName: null, distanceKm: null,
      },
    },
  });
  expect(serviceAreaService.checkCoverage).toHaveBeenCalledWith(10.3312, 123.9046);
  expect(JSON.stringify(response.body)).not.toContain('googleMapsUri');
  expect(response.headers['cache-control']).toBe('private, no-store');
});

it('Bug CR-220 — a map pin outside every service area comes back with covered false, the nearest area, and the pin as the location', async () => {
  fetchMock.mockResolvedValue(googleJson(mandaueReverseAnswer()));
  jest.mocked(serviceAreaService.checkCoverage).mockResolvedValue({
    covered: false, area: null, nearestArea: CEBU_CITY_AREA, distanceKm: 18.4,
  } as never);

  const response = await reverse();

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    found: true,
    address: { fullAddress: '45 A. C. Cortes Avenue', barangay: 'Ibabao-Estancia', city: 'Mandaue City' },
    location: { latitude: PIN.lat, longitude: PIN.lng },
    coverage: { covered: false, serviceAreaId: null, nearestServiceAreaName: 'Cebu City', distanceKm: 18.4 },
  });
  expect(serviceAreaService.checkCoverage).toHaveBeenCalledWith(PIN.lat, PIN.lng);
});

it('Bug CR-221 — a pin Google cannot name (ZERO_RESULTS) answers 200 with found false and still reports coverage', async () => {
  fetchMock.mockResolvedValue(googleJson({ status: 'ZERO_RESULTS', results: [] }));

  const response = await reverse();

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({
    found: false, placeId: null, address: null, formattedAddress: null,
    location: { latitude: PIN.lat, longitude: PIN.lng },
    coverage: {
      covered: true, serviceAreaId: CEBU_CITY_AREA.id, serviceAreaName: 'Cebu City',
      nearestServiceAreaName: null, distanceKm: null,
    },
  });
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();
});

it('Bug CR-222 — an unknown place ID answers 404 with a plain message and starts no cool-down', async () => {
  fetchMock.mockResolvedValue(googleJson({
    error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' },
  }, 404));

  const response = await details();

  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('address_not_found');
  expect(response.body.error.message).not.toMatch(/entity/i);
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();
});

it('Bug CR-223 — over the per-user daily autocomplete cap the server answers 429 without calling Google, and other users are unaffected', async () => {
  installDbMock(mockDbQuery, { address_search_user_daily_autocomplete_limit: '2' });
  fetchMock.mockImplementation(async () => googleJson({ suggestions: [] }));

  expect((await search()).status).toBe(200);
  expect((await search()).status).toBe(200);
  const third = await search();
  expect(third.status).toBe(429);
  expect(third.body.error.code).toBe('address_search_user_limit');
  expect(fetchMock).toHaveBeenCalledTimes(2);

  expect((await search(searchBody(), CUSTOMER_B)).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('Bug CR-224 — over the platform-wide daily cap every user gets 429 without calling Google, and the refused call is not counted', async () => {
  installDbMock(mockDbQuery, { address_search_platform_daily_limit: '2' });
  fetchMock.mockImplementation(async () => googleJson(mandaueReverseAnswer()));

  expect((await reverse(pinBody(), CUSTOMER_A)).status).toBe(200);
  expect((await reverse(pinBody(), CUSTOMER_A)).status).toBe(200);
  const refused = await reverse(pinBody(), CUSTOMER_B);

  expect(refused.status).toBe(429);
  expect(refused.body.error.code).toBe('address_search_daily_limit');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const day = manilaDay();
  expect(fakeRedis.peek(addressSearchKeys.platformTotal(day))).toBe('2');
  expect(fakeRedis.peek(addressSearchKeys.user(day, CUSTOMER_B, 'lookup'))).toBe('0');
});

it('Bug CR-225 — Geocoding REQUEST_DENIED (billing off) answers 503, starts the cool-down, and the next call does not reach Google', async () => {
  fetchMock.mockResolvedValue(googleJson({
    status: 'REQUEST_DENIED',
    error_message: 'You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable',
    results: [],
  }));

  const denied = await reverse();

  expect(denied.status).toBe(503);
  expect(denied.body.error).toEqual({
    message: 'Address search is unavailable right now. Please type your address.',
    statusCode: 503,
    code: 'address_search_unavailable',
  });
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'REQUEST_DENIED' });
  expect(await fakeRedis.ttl(ADDRESS_SEARCH_COOLDOWN_KEY)).toBe(600);

  const next = await search();
  expect(next.status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('Bug CR-226 — Places 403 PERMISSION_DENIED answers 503, logs the status word only, and starts the cool-down', async () => {
  fetchMock.mockResolvedValue(googleJson({
    error: {
      code: 403,
      message: 'This API method requires billing to be enabled. Please enable billing on project #123456789.',
      status: 'PERMISSION_DENIED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'BILLING_DISABLED' }],
    },
  }, 403));

  const response = await details();

  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toMatch(/billing|project/i);
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'PERMISSION_DENIED' });
  expect(logger.warn).toHaveBeenCalledWith('Address search: Google call did not succeed', {
    operation: 'details', outcome: 'refused', googleStatus: 'PERMISSION_DENIED',
    googleReason: 'BILLING_DISABLED', httpStatus: 403,
  });
  expect(allLogText(logger)).not.toMatch(/enable billing|123456789/i);

  expect((await details()).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('Bug CR-227 — a Google call that never answers is abandoned at the time limit, answers 503 and starts the cool-down', async () => {
  installDbMock(mockDbQuery, { address_search_timeout_ms: '1000' });
  const hanging = hangingFetch();
  globalThis.fetch = hanging as unknown as typeof fetch;

  const started = Date.now();
  const response = await search();

  expect(response.status).toBe(503);
  expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'TIMEOUT' });
  expect((await search()).status).toBe(503);
  expect(hanging).toHaveBeenCalledTimes(1);
}, 20_000);

it('Bug CR-228 — once the cool-down has ended, calls reach Google again', async () => {
  fetchMock.mockResolvedValueOnce(googleJson({ status: 'OVER_QUERY_LIMIT', results: [] }));
  expect((await reverse()).status).toBe(503);
  expect((await reverse()).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60_000);
  try {
    fetchMock.mockResolvedValueOnce(googleJson(mandaueReverseAnswer()));
    expect((await reverse()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});

it('Bug CR-229 — the server key never appears in a response body or a log line, in success or failure', async () => {
  fetchMock
    .mockResolvedValueOnce(googleJson({ suggestions: [] }))
    .mockResolvedValueOnce(googleJson(CEBU_CITY_DETAILS))
    .mockResolvedValueOnce(googleJson(mandaueReverseAnswer()))
    .mockRejectedValueOnce(new TypeError(`fetch failed for https://maps.googleapis.com/maps/api/geocode/json?key=${FAKE_GOOGLE_KEY}`));
  const bodies: string[] = [];
  for (const call of [() => search(), () => details(), () => reverse(), () => reverse()]) {
    const response = await call();
    bodies.push(JSON.stringify(response.body), JSON.stringify(response.headers));
  }
  expect(bodies.join('\n')).not.toContain(FAKE_GOOGLE_KEY);
  expect(allLogText(logger)).not.toContain(FAKE_GOOGLE_KEY);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  // The network failure did log, by kind only.
  expect(logger.warn).toHaveBeenCalledWith('Address search: Google call did not succeed', {
    operation: 'reverse', outcome: 'network', googleStatus: 'NETWORK_ERROR',
  });
});

it('Bug CR-230 — what the customer typed and their coordinates never appear in a log line', async () => {
  fetchMock
    .mockResolvedValueOnce(googleJson({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, 429));
  await search();
  fakeRedis.clear();
  fetchMock.mockResolvedValueOnce(googleJson({ status: 'UNKNOWN_ERROR' }));
  await reverse();

  expect(jest.mocked(logger.warn).mock.calls.length).toBeGreaterThanOrEqual(2);
  const logs = allLogText(logger);
  expect(logs).not.toContain('Gorordo');
  expect(logs).not.toContain('10.333');
  expect(logs).not.toContain('123.933');
  expect(logs).not.toContain(SESSION_TOKEN);
});

it('Bug CR-231 — with the admin switch off every route answers 503 without calling Google', async () => {
  installDbMock(mockDbQuery, { address_search_enabled: 'false' });

  for (const call of [() => search(), () => details(), () => reverse()]) {
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('address_search_unavailable');
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-232 — with no server key, or a template placeholder, every route answers 503 without calling Google', async () => {
  for (const value of [undefined, '', 'CHANGE_ME_GOOGLE_MAPS_SERVER_KEY_PLACEHOLDER', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX']) {
    if (value === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY; else process.env.GOOGLE_MAPS_SERVER_KEY = value;
    expect((await search()).status).toBe(503);
    expect((await reverse()).status).toBe(503);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-233 — when Redis cannot answer the caps cannot be counted, so the call is refused with 503 before Google', async () => {
  fakeRedis.failing = true;

  const response = await search();

  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Bug CR-234 — a Google server error answers 503 but starts no cool-down (it is not a refusal)', async () => {
  fetchMock.mockResolvedValueOnce(googleJson({ error: { code: 500, status: 'INTERNAL' } }, 500));

  expect((await search()).status).toBe(503);
  expect(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)).toBeNull();

  fetchMock.mockResolvedValueOnce(googleJson({ suggestions: [] }));
  expect((await search()).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('Bug CR-249 — a rejected key (Places 400 API_KEY_INVALID) and Geocoding OVER_DAILY_LIMIT both count as refusals and start the cool-down', async () => {
  fetchMock.mockResolvedValueOnce(googleJson({
    error: {
      code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
    },
  }, 400));
  expect((await search()).status).toBe(503);
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'INVALID_ARGUMENT' });
  expect(logger.warn).toHaveBeenCalledWith('Address search: Google call did not succeed', {
    operation: 'autocomplete', outcome: 'refused', googleStatus: 'INVALID_ARGUMENT',
    googleReason: 'API_KEY_INVALID', httpStatus: 400,
  });

  fakeRedis.clear();
  fetchMock.mockResolvedValueOnce(googleJson({ status: 'OVER_DAILY_LIMIT', results: [] }));
  expect((await reverse()).status).toBe(503);
  expect(JSON.parse(fakeRedis.peek(ADDRESS_SEARCH_COOLDOWN_KEY)!)).toMatchObject({ status: 'OVER_DAILY_LIMIT' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
