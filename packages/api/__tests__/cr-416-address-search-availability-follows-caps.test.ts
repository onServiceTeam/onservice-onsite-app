// CR-416 (D24 Option A, 2026-10-18 review): GET /api/v1/config's
// addressSearchAvailable, and the admin status card's "available", follow the
// daily caps as well as the key, the switch and the pause. They read false
// when the platform cap is 0, when both per-user caps are 0, and once today's
// platform total (Manila day) has reached the cap, so the app does not offer
// search that would answer 429 or 503 on every try. One per-user cap at 0
// leaves the flag true, because the other kind of call still works. The
// caps ride in the same single bulk settings query as every other config
// value (MED-N107).
const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => {
  const { FakeRedis } = jest.requireActual('./helpers/fake-redis');
  return { redis: new FakeRedis() };
});
jest.mock('../src/services/service-area.service', () => ({ checkCoverage: jest.fn(), getActiveServiceAreas: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { redis } from '../src/config/redis.config';
import { getClientConfig } from '../src/services/settings.service';
import { getAddressSearchStatus } from '../src/services/geo/address-search.service';
import { addressSearchKeys, manilaDay } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import { FAKE_GOOGLE_KEY, installDbMock } from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;

async function availability(settings: Record<string, string>, platformTotalToday?: number): Promise<{ config: unknown; status: unknown }> {
  fakeRedis.clear();
  dbQueryMock.mockReset();
  installDbMock(dbQueryMock, settings);
  if (platformTotalToday !== undefined) {
    await fakeRedis.set(addressSearchKeys.platformTotal(manilaDay()), String(platformTotalToday));
  }
  const config = (await getClientConfig()).addressSearchAvailable;
  fakeRedis.clear(); // drop the 60-second settings cache
  if (platformTotalToday !== undefined) {
    await fakeRedis.set(addressSearchKeys.platformTotal(manilaDay()), String(platformTotalToday));
  }
  const status = (await getAddressSearchStatus()).available;
  return { config, status };
}

beforeAll(() => {
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
});

afterAll(() => {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

it('Bug CR-416 — the app config and the admin status say address search is not available when the caps leave no call for today', async () => {
  const yes = { config: true, status: true };
  const no = { config: false, status: false };

  // Defaults (60, 30, 500) and nothing used yet.
  expect(await availability({})).toEqual(yes);
  // Under the platform cap.
  expect(await availability({ address_search_platform_daily_limit: '500' }, 499)).toEqual(yes);
  // Platform cap reached today.
  expect(await availability({ address_search_platform_daily_limit: '500' }, 500)).toEqual(no);
  // Platform cap 0.
  expect(await availability({ address_search_platform_daily_limit: '0' })).toEqual(no);
  // Both per-user caps 0.
  expect(await availability({
    address_search_user_daily_autocomplete_limit: '0', address_search_user_daily_lookup_limit: '0',
  })).toEqual(no);
  // One per-user cap 0: pin lookups still work.
  expect(await availability({ address_search_user_daily_autocomplete_limit: '0' })).toEqual(yes);

  // Still one bulk settings query for the whole config, carrying the caps.
  fakeRedis.clear();
  dbQueryMock.mockReset();
  installDbMock(dbQueryMock, {});
  await getClientConfig();
  const bulk = dbQueryMock.mock.calls.filter(([text]) => String(text).includes('key = ANY($1::text[])'));
  expect(bulk).toHaveLength(1);
  expect((bulk[0] as [string, [string[]]])[1][0]).toEqual(expect.arrayContaining([
    'address_search_enabled', 'address_search_user_daily_autocomplete_limit',
    'address_search_user_daily_lookup_limit', 'address_search_platform_daily_limit',
  ]));
});
