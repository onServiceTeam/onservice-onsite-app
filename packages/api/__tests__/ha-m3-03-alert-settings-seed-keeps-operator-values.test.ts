// HA-M3-03 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 72): migration 186 seeds the three Milestone 3
// settings at 5 / 10 / 3 with the plan's metadata, matching the in-memory
// fallbacks in SETTING_DEFAULTS, and never overwrites a value an operator
// already holds: a row that exists before 186 runs keeps its value, and an
// edit made through the settings service survives 186 running again. The
// real migration file and the real updateSetting() run on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import { upsertPlatformSetting } from './helpers/request-engine-postgres';
import { applyMarketplaceMigration, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { SETTING_DEFAULTS, updateSetting } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-03: the alert settings seed 5, 10 and 3 and a seed never overwrites an operator value', async () => {
  await withMarketplaceDatabase(async database => {
    // An operator value already stored before 186 runs.
    await upsertPlatformSetting(database, 'ops_request_alert_red_minutes', '15');

    await applyMarketplaceMigration(database);

    expect((await database.query(`SELECT category, subcategory, key, value_type, value, default_value,
        min_value::float8 AS min_value, max_value::float8 AS max_value, unit, display_order, is_active
      FROM platform_settings WHERE key LIKE 'ops\\_%' ORDER BY key`)).rows).toEqual([
      {
        category: 'dispatch', subcategory: 'request_alerts', key: 'ops_coverage_min_responsive_providers',
        value_type: 'integer', value: '3', default_value: '3', min_value: 1, max_value: 50, unit: 'providers',
        display_order: 122, is_active: true,
      },
      {
        category: 'dispatch', subcategory: 'request_alerts', key: 'ops_request_alert_amber_minutes',
        value_type: 'integer', value: '5', default_value: '5', min_value: 1, max_value: 120, unit: 'minutes',
        display_order: 120, is_active: true,
      },
      // The operator's row is untouched.
      {
        category: 'fixture', subcategory: null, key: 'ops_request_alert_red_minutes', value_type: 'string',
        value: '15', default_value: '15', min_value: null, max_value: null, unit: null, display_order: 0, is_active: true,
      },
    ]);
    // Each seeded value is also the code's outage fallback (no drift).
    expect([
      SETTING_DEFAULTS.ops_request_alert_amber_minutes,
      SETTING_DEFAULTS.ops_request_alert_red_minutes,
      SETTING_DEFAULTS.ops_coverage_min_responsive_providers,
    ]).toEqual(['5', '10', '3']);

    // An operator edit through the settings service survives a re-run of 186.
    const current = await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM platform_settings WHERE key = 'ops_coverage_min_responsive_providers'",
    );
    await updateSetting('ops_coverage_min_responsive_providers', '4', {
      changedBy: operatorId,
      reason: 'Metro Cebu needs four responsive pros per trade.',
      expectedUpdatedAt: current.rows[0]!.updated_at.toISOString(),
    });
    await applyMarketplaceMigration(database);

    expect((await database.query(`SELECT key, value, default_value FROM platform_settings
      WHERE key IN ('ops_coverage_min_responsive_providers', 'ops_request_alert_red_minutes') ORDER BY key`)).rows)
      .toEqual([
        { key: 'ops_coverage_min_responsive_providers', value: '4', default_value: '3' },
        { key: 'ops_request_alert_red_minutes', value: '15', default_value: '15' },
      ]);
    expect((await database.query('SELECT setting_key, old_value, new_value, changed_by FROM platform_settings_audit')).rows)
      .toEqual([{ setting_key: 'ops_coverage_min_responsive_providers', old_value: '3', new_value: '4', changed_by: operatorId }]);
  }, { migration186: false });
}, 90000);
