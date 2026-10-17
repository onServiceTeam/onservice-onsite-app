// CR-243 (D24 Option A, 2026-10-18): the real migration 189 file seeds the six
// address search controls under dispatch / address_search with the same
// values as SETTING_DEFAULTS and the same bounds as getAddressSearchPolicy();
// they show in System Settings as live, editable controls; an admin save is
// held to the bounds; and neither a value already stored before 189 runs nor
// an admin edit is overwritten when 189 runs again. Runs on the guarded
// PostgreSQL fixture (fails in CI, never skips, when that database is
// missing).
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import { readMigration, upsertPlatformSetting, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import {
  ADDRESS_SEARCH_INTEGER_BOUNDS, SETTING_DEFAULTS, formatSetting, getAddressSearchPolicy, getAllSettings, updateSetting,
} from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MIGRATION = '189_address_search_settings.sql';

type Seed = [key: string, valueType: string, value: string, min: number | null, max: number | null, unit: string | null, order: number];
const SEEDS: Seed[] = [
  ['address_search_enabled', 'boolean', 'true', null, null, null, 130],
  ['address_search_user_daily_autocomplete_limit', 'integer', '60', 0, 1000, 'searches', 131],
  ['address_search_user_daily_lookup_limit', 'integer', '30', 0, 500, 'lookups', 132],
  ['address_search_platform_daily_limit', 'integer', '500', 0, 100000, 'calls', 133],
  ['address_search_timeout_ms', 'integer', '3000', 1000, 10000, 'milliseconds', 134],
  ['address_search_cooldown_minutes', 'integer', '10', 1, 1440, 'minutes', 135],
];

it('Bug CR-243 — migration 189 seeds the six address search controls as editable live settings and never overwrites an operator value', async () => {
  await withRequestEngineDatabase(async database => {
    // A value already stored before 189 runs is kept.
    await upsertPlatformSetting(database, 'address_search_platform_daily_limit', '200');

    await database.query(readMigration(MIGRATION));

    const rows = (await database.query(`SELECT category, subcategory, key, value_type, value, default_value,
        min_value::float8 AS min_value, max_value::float8 AS max_value, unit, display_order, is_active
      FROM platform_settings WHERE key LIKE 'address\\_search\\_%' ORDER BY display_order, key`)).rows;
    const PRESET = 'address_search_platform_daily_limit';
    expect(rows).toHaveLength(6);
    expect(rows.filter(row => row.key !== PRESET)).toEqual(SEEDS.filter(([key]) => key !== PRESET).map(
      ([key, valueType, value, min, max, unit, order]) => ({
        category: 'dispatch', subcategory: 'address_search', key, value_type: valueType, value, default_value: value,
        min_value: min, max_value: max, unit, display_order: order, is_active: true,
      }),
    ));
    // The preset row is untouched (category, value and all).
    expect(rows.find(row => row.key === PRESET)).toEqual({
      category: 'fixture', subcategory: null, key: PRESET, value_type: 'string', value: '200', default_value: '200',
      min_value: null, max_value: null, unit: null, display_order: 0, is_active: true,
    });

    // The seeded values are the code's outage fallbacks, and the bounds match.
    for (const [key, valueType, value, min, max] of SEEDS) {
      expect(SETTING_DEFAULTS[key]).toBe(value);
      if (valueType === 'integer') {
        expect(ADDRESS_SEARCH_INTEGER_BOUNDS[key as keyof typeof ADDRESS_SEARCH_INTEGER_BOUNDS])
          .toEqual({ min, max, fallback: Number(value) });
      }
    }

    // System Settings lists them as live, editable controls.
    const listed = (await getAllSettings()).filter(row => row.key.startsWith('address_search_')).map(formatSetting);
    expect(listed).toHaveLength(6);
    for (const setting of listed) {
      expect(setting).toMatchObject({ runtimeStatus: 'live', editable: true });
      expect(setting.runtimeSummary).toMatch(/Within 60 seconds/);
    }

    // An admin save is held to the bounds, and a valid save is used.
    const version = async (key: string): Promise<string> => (await database.query<{ updated_at: Date }>(
      'SELECT updated_at FROM platform_settings WHERE key = $1', [key])).rows[0]!.updated_at.toISOString();
    await expect(updateSetting('address_search_user_daily_lookup_limit', '501', {
      changedBy: operatorId, reason: 'Testing the upper bound of lookups.',
      expectedUpdatedAt: await version('address_search_user_daily_lookup_limit'),
    })).rejects.toMatchObject({ statusCode: 400 });
    await updateSetting('address_search_user_daily_lookup_limit', '12', {
      changedBy: operatorId, reason: 'Pilot: fewer address lookups per tester.',
      expectedUpdatedAt: await version('address_search_user_daily_lookup_limit'),
    });
    expect((await getAddressSearchPolicy()).userDailyLookupLimit).toBe(12);

    // Running 189 again keeps both the operator value and the admin edit.
    await database.query(readMigration(MIGRATION));
    expect((await database.query(`SELECT key, value FROM platform_settings
      WHERE key IN ('address_search_platform_daily_limit', 'address_search_user_daily_lookup_limit') ORDER BY key`)).rows)
      .toEqual([
        { key: 'address_search_platform_daily_limit', value: '200' },
        { key: 'address_search_user_daily_lookup_limit', value: '12' },
      ]);
  });
}, 120000);
