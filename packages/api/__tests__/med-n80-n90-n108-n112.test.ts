// MED-N80 / N90 / N108 / N112 fixes — auth + booking routes hardening +
// settings drift + pricing timezone.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...a: unknown[]) => dbQueryMock(...a) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
  },
}));

const ROUTES_BOOKING = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);
const PRICING_SVC = readFileSync(
  resolve(__dirname, '../src/services/pricing.service.ts'),
  'utf8',
);
const SETTINGS_SVC = readFileSync(
  resolve(__dirname, '../src/services/settings.service.ts'),
  'utf8',
);
const SERVER = readFileSync(
  resolve(__dirname, '../src/server.ts'),
  'utf8',
);
const MIG_113 = readFileSync(
  resolve(__dirname, '../migrations/113_n80_users_email_lower_idx.sql'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('MED-N80 — users(LOWER(email)) functional index migration', () => {
  it('MED-N80 — migration 113 creates users_email_lower_idx', () => {
    expect(MIG_113).toMatch(/CREATE INDEX IF NOT EXISTS users_email_lower_idx/);
    expect(MIG_113).toMatch(/ON users \(LOWER\(email\)\)/);
  });
  it('MED-N80 — partial index excludes NULL emails (anonymized rows)', () => {
    expect(MIG_113).toMatch(/WHERE email IS NOT NULL/);
  });
});

describe('MED-N90 — booking match endpoint no longer returns matching config', () => {
  it('MED-N90 — match response no longer includes `config: matchingService.getMatchConfig()`', () => {
    // The post-fix res.json includes only bookingId + providers.
    expect(ROUTES_BOOKING).not.toMatch(/config: matchingService\.getMatchConfig\(\)/);
  });
  it('MED-N90 — fix comment present at the match handler', () => {
    expect(ROUTES_BOOKING).toMatch(/MED-N90 fix — internal matching algorithm config/);
  });
});

describe('MED-N108 — checkSettingsDriftAtBoot detects drift between in-memory + DB', () => {
  it('MED-N108 — exported function present', () => {
    expect(SETTINGS_SVC).toMatch(/export async function checkSettingsDriftAtBoot\(/);
  });

  it('MED-N108 — reports defaultsOnly when DB lacks a key declared in SETTING_DEFAULTS', async () => {
    // Mock DB to return only a subset of keys.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ key: 'commission_rate_new' }, { key: 'service_fee_rate' }],
      rowCount: 2,
    });
    const { checkSettingsDriftAtBoot } = await import('../src/services/settings.service');
    const out = await checkSettingsDriftAtBoot();
    // SETTING_DEFAULTS declares many keys (commission_rate_founding,
    // commission_rate_verified, commission_rate_pro, etc.) that the
    // mock DB doesn't return.
    expect(out.defaultsOnly.length).toBeGreaterThan(0);
    expect(out.defaultsOnly).toContain('commission_rate_founding');
  });

  it('MED-N108 — reports dbOnly when DB has keys SETTING_DEFAULTS doesn\'t mirror', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { key: 'commission_rate_new' },
        { key: 'some_brand_new_key_added_in_future_migration' },
      ],
      rowCount: 2,
    });
    const { checkSettingsDriftAtBoot } = await import('../src/services/settings.service');
    const out = await checkSettingsDriftAtBoot();
    expect(out.dbOnly).toContain('some_brand_new_key_added_in_future_migration');
  });

  it('MED-N108 — DB unreachable does NOT throw (boot continues)', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { checkSettingsDriftAtBoot } = await import('../src/services/settings.service');
    const out = await checkSettingsDriftAtBoot();
    expect(out).toEqual({ defaultsOnly: [], dbOnly: [], matched: 0 });
  });

  it('MED-N108 — server.ts wires the boot-time check', () => {
    expect(SERVER).toMatch(/settingsService\s*\.checkSettingsDriftAtBoot\(\)/);
  });
});

describe('MED-N112 — pricing.calculatePricing uses Intl.DateTimeFormat parts (no toLocaleString round-trip)', () => {
  it('MED-N112 — Intl.DateTimeFormat replaces the toLocaleString round-trip', () => {
    expect(PRICING_SVC).toMatch(/new Intl\.DateTimeFormat\('en-US', \{\s*\n\s*timeZone: platformConfig\.timezone/);
    expect(PRICING_SVC).toMatch(/partsFmt\.formatToParts\(scheduledDate\)/);
  });
  it('MED-N112 — old toLocaleString round-trip pattern is gone', () => {
    expect(PRICING_SVC).not.toMatch(/new Date\(scheduledDate\.toLocaleString\('en-US', \{ timeZone: platformConfig\.timezone \}\)\)/);
  });
  it('MED-N112 — extracts hour, minute, weekday, year/month/day from parts', () => {
    expect(PRICING_SVC).toMatch(/partsByType\.get\('hour'\)/);
    expect(PRICING_SVC).toMatch(/partsByType\.get\('minute'\)/);
    expect(PRICING_SVC).toMatch(/partsByType\.get\('weekday'\)/);
    expect(PRICING_SVC).toMatch(/partsByType\.get\('year'\)/);
  });
  it('MED-N112 — handles Intl midnight \'24\' edge case', () => {
    expect(PRICING_SVC).toMatch(/scheduledHour === 24 \? 0 : scheduledHour/);
  });
});
