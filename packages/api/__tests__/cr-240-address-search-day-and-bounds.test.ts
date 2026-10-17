// CR-240 and CR-242 (D24 Option A, 2026-10-18): the daily caps count per
// Asia/Manila calendar day (they restart at Manila midnight, 16:00 UTC), and
// an address search setting stored outside its migration 189 bounds falls
// back to the seeded default instead of being used.
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
import * as serviceAreaService from '../src/services/service-area.service';
import { autocomplete } from '../src/services/geo/address-search.service';
import { addressSearchKeys, manilaDay } from '../src/services/geo/address-search-state';
import { getAddressSearchPolicy } from '../src/services/settings.service';
import type { FakeRedis } from './helpers/fake-redis';
import { CUSTOMER_A, FAKE_GOOGLE_KEY, SESSION_TOKEN, googleJson, installDbMock } from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fakeRedis.clear();
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  jest.mocked(serviceAreaService.getActiveServiceAreas).mockResolvedValue([] as never);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

it('Bug CR-240 — a user at the daily cap at 11:59 PM Manila time can search again at 12:01 AM Manila time', async () => {
  installDbMock(mockDbQuery, { address_search_user_daily_autocomplete_limit: '1' });
  const fetchMock = jest.fn(async () => googleJson({ suggestions: [] }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const search = () => autocomplete({ userId: CUSTOMER_A, query: 'Lahug', sessionToken: SESSION_TOKEN });

  const beforeMidnight = new Date('2026-10-18T15:59:00.000Z'); // 11:59 PM, Oct 18, Manila
  const afterMidnight = new Date('2026-10-18T16:01:00.000Z'); // 12:01 AM, Oct 19, Manila
  expect(manilaDay(beforeMidnight)).toBe('2026-10-18');
  expect(manilaDay(afterMidnight)).toBe('2026-10-19');

  jest.useFakeTimers({
    now: beforeMidnight,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance'],
  });
  try {
    await search();
    await expect(search()).rejects.toMatchObject({ statusCode: 429, code: 'address_search_user_limit' });
    expect(fakeRedis.peek(addressSearchKeys.user('2026-10-18', CUSTOMER_A, 'autocomplete'))).toBe('1');

    jest.setSystemTime(afterMidnight);
    await expect(search()).resolves.toEqual({ suggestions: [] });
    expect(fakeRedis.peek(addressSearchKeys.user('2026-10-19', CUSTOMER_A, 'autocomplete'))).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

it('Bug CR-242 — address search settings stored outside their bounds fall back to the seeded defaults', async () => {
  installDbMock(mockDbQuery, {
    address_search_enabled: 'true',
    address_search_user_daily_autocomplete_limit: '-1',
    address_search_user_daily_lookup_limit: '501',
    address_search_platform_daily_limit: 'lots',
    address_search_timeout_ms: '50',
    address_search_cooldown_minutes: '0',
  });

  await expect(getAddressSearchPolicy()).resolves.toEqual({
    enabled: true,
    userDailyAutocompleteLimit: 60,
    userDailyLookupLimit: 30,
    platformDailyLimit: 500,
    timeoutMs: 3000,
    cooldownMinutes: 10,
  });

  installDbMock(mockDbQuery, {
    address_search_enabled: 'false',
    address_search_user_daily_autocomplete_limit: '0',
    address_search_user_daily_lookup_limit: '500',
    address_search_platform_daily_limit: '100000',
    address_search_timeout_ms: '10000',
    address_search_cooldown_minutes: '1440',
  });
  fakeRedis.clear(); // drop the 60-second settings cache

  await expect(getAddressSearchPolicy()).resolves.toEqual({
    enabled: false,
    userDailyAutocompleteLimit: 0,
    userDailyLookupLimit: 500,
    platformDailyLimit: 100000,
    timeoutMs: 10000,
    cooldownMinutes: 1440,
  });
});
