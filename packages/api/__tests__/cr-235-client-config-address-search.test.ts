// CR-235 to CR-239 (D24 Option A, 2026-10-18): GET /api/v1/config tells the
// apps whether to show Google address search. addressSearchAvailable is true
// only when the server key is set, the admin switch address_search_enabled is
// on, and no cool-down is running; a Redis outage reads as "not available".
// The switch rides in the same single bulk settings query as every other
// config value (MED-N107), so the config still makes exactly two database
// statements.
const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => {
  const { FakeRedis } = jest.requireActual('./helpers/fake-redis');
  return { redis: new FakeRedis() };
});
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { redis } from '../src/config/redis.config';
import { getClientConfig } from '../src/services/settings.service';
import { ADDRESS_SEARCH_COOLDOWN_KEY } from '../src/services/geo/address-search-state';
import type { FakeRedis } from './helpers/fake-redis';
import { FAKE_GOOGLE_KEY } from './helpers/address-search-harness';

const fakeRedis = redis as unknown as FakeRedis;

function settingsRows(values: Record<string, string>): void {
  dbQueryMock.mockImplementation(async (_text: string, params?: unknown[]) => {
    const keys = Array.isArray(params?.[0]) ? params![0] as string[] : [];
    const rows = keys.filter((key) => key in values).map((key) => ({ key, value: values[key] }));
    return { rows, rowCount: rows.length };
  });
}

beforeEach(() => {
  fakeRedis.clear();
  dbQueryMock.mockReset();
  settingsRows({});
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

afterAll(() => {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

it('Bug CR-235 — addressSearchAvailable is false when the server has no Google key, and Redis is not asked', async () => {
  settingsRows({ address_search_enabled: 'true' });

  const config = await getClientConfig();

  expect(config.addressSearchAvailable).toBe(false);
  expect(fakeRedis.calls).toEqual([]);
});

it('Bug CR-236 — addressSearchAvailable is true with a key, the switch on and no cool-down, still in one bulk settings query', async () => {
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  settingsRows({ address_search_enabled: 'true' });

  const config = await getClientConfig();

  expect(config.addressSearchAvailable).toBe(true);
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  const bulk = dbQueryMock.mock.calls[1] as [string, [string[]]];
  expect(bulk[0]).toContain('key = ANY($1::text[])');
  expect(bulk[1][0]).toContain('address_search_enabled');
  expect(JSON.stringify(config)).not.toContain(FAKE_GOOGLE_KEY);
});

it('Bug CR-237 — addressSearchAvailable is false while a cool-down is running', async () => {
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  await fakeRedis.set(ADDRESS_SEARCH_COOLDOWN_KEY, JSON.stringify({
    until: new Date(Date.now() + 5 * 60_000).toISOString(), status: 'REQUEST_DENIED',
  }), 'EX', 300);

  expect((await getClientConfig()).addressSearchAvailable).toBe(false);
});

it('Bug CR-238 — addressSearchAvailable is false when an admin turns address_search_enabled off, even with a key', async () => {
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  settingsRows({ address_search_enabled: 'false' });

  expect((await getClientConfig()).addressSearchAvailable).toBe(false);
});

it('Bug CR-239 — addressSearchAvailable is false when Redis cannot answer, and the rest of the config still loads', async () => {
  process.env.GOOGLE_MAPS_SERVER_KEY = FAKE_GOOGLE_KEY;
  fakeRedis.failing = true;

  const config = await getClientConfig();

  expect(config.addressSearchAvailable).toBe(false);
  expect(config.currency).toBe('PHP');
  expect(config.requestFirstBooking).toBe(true);
});
