// CR-241 (D24 Option A, 2026-10-18): GET /api/v1/admin/geo/address-search/status
// is for admin and super_admin only and reports, for the status card on
// System Settings: whether the server key is set (never the key), whether the
// switch is on, any cool-down and when it ends, today's call counts (Manila
// day) and the last Google status word. Real router, real sign-in and role
// middleware, in-memory Redis.
import express from 'express';
import request from 'supertest';

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
import geoAdminRouter from '../src/routes/geo-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import {
  ADDRESS_SEARCH_COOLDOWN_KEY, ADDRESS_SEARCH_LAST_STATUS_KEY, addressSearchKeys, manilaDay,
} from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import {
  ADMIN_ID, CUSTOMER_A, FAKE_GOOGLE_KEY, JWT_TEST_SECRET, bearer, installDbMock,
} from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const savedSecret = process.env.JWT_SECRET;

const app = express();
app.use('/api/v1/admin/geo', geoAdminRouter);
app.use(errorMiddleware);

beforeAll(() => { process.env.JWT_SECRET = JWT_TEST_SECRET; });
afterAll(() => {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
});

it('Bug CR-241 — the admin status shows key set yes/no, the switch, the cool-down end, today\'s counts and the last Google word, and refuses customers', async () => {
  installDbMock(mockDbQuery);
  fakeRedis.clear();
  const path = '/api/v1/admin/geo/address-search/status';

  expect((await request(app).get(path)).status).toBe(401);
  expect((await request(app).get(path).set('Authorization', bearer(CUSTOMER_A))).status).toBe(403);

  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  const unset = await request(app).get(path).set('Authorization', bearer(ADMIN_ID));
  expect(unset.status).toBe(200);
  expect(unset.body.data).toMatchObject({ keyConfigured: false, enabled: true, available: false, cooldownUntil: null });

  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  const day = manilaDay();
  const until = new Date(Date.now() + 8 * 60_000).toISOString();
  await fakeRedis.set(ADDRESS_SEARCH_COOLDOWN_KEY, JSON.stringify({ until, status: 'REQUEST_DENIED' }), 'EX', 480);
  await fakeRedis.set(ADDRESS_SEARCH_LAST_STATUS_KEY, JSON.stringify({
    status: 'REQUEST_DENIED', operation: 'reverse', at: '2026-10-18T02:00:00.000Z',
  }));
  await fakeRedis.set(addressSearchKeys.platformOperation(day, 'autocomplete'), '7');
  await fakeRedis.set(addressSearchKeys.platformOperation(day, 'details'), '2');
  await fakeRedis.set(addressSearchKeys.platformOperation(day, 'reverse'), '1');
  await fakeRedis.set(addressSearchKeys.platformTotal(day), '10');

  const response = await request(app).get(path).set('Authorization', bearer(ADMIN_ID));

  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.data).toEqual({
    keyConfigured: true,
    enabled: true,
    available: false,
    cooldownUntil: until,
    cooldownStatus: 'REQUEST_DENIED',
    stateReadable: true,
    today: { date: day, autocomplete: 7, details: 2, reverse: 1, total: 10 },
    limits: { userDailyAutocomplete: 60, userDailyLookups: 30, platformDaily: 500, timeoutMs: 3000, cooldownMinutes: 10 },
    lastStatus: { status: 'REQUEST_DENIED', operation: 'reverse', at: '2026-10-18T02:00:00.000Z' },
  });
  expect(JSON.stringify(response.body)).not.toContain(FAKE_GOOGLE_KEY);
});
