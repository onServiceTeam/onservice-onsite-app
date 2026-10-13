// HA-M2-08 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// migrations 183 and 184 seed the thirteen D38 settings at the values in the
// plan, matching the in-memory fallbacks in SETTING_DEFAULTS, and never
// overwrite a value an operator already holds: a row that exists before 183
// runs keeps its value, and an edit made through the settings service
// survives 184 running again. The real migration files and the real
// updateSetting() run on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import {
  applyRequestEngineMigration, upsertPlatformSetting, withRequestEngineDatabase,
} from './helpers/request-engine-postgres';
import { SETTING_DEFAULTS, updateSetting } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Seed = [key: string, valueType: string, value: string, min: number | null, max: number | null, unit: string | null, order: number];

// merged.md section 1 (183, provider / requests; 184, security / uploads).
const REQUEST_SEEDS: Seed[] = [
  ['request_max_open_quotes', 'integer', '1', 1, 20, 'quotes', 20],
  ['request_max_rounds', 'integer', '3', 1, 10, 'rounds', 21],
  ['request_max_invites', 'integer', '30', 1, 200, 'providers', 22],
  ['request_show_declined_amount', 'boolean', 'false', null, null, null, 23],
  ['request_provider_poll_seconds', 'integer', '30', 15, 120, 'seconds', 24],
  ['request_customer_still_looking_minutes', 'integer', '30', 10, 240, 'minutes', 25],
  ['request_slot_lead_minutes', 'integer', '60', 15, 240, 'minutes', 26],
];
const MEDIA_SEEDS: Seed[] = [
  // Ceiling 6, not the plan draft's 10: 6 photos + 1 video + 1 voice note = the
  // 8 mediaIds a job request accepts (D38 "up to 6 photos").
  ['job_media_max_photos', 'integer', '6', 0, 6, 'photos', 430],
  ['job_media_photo_max_bytes', 'integer', '10485760', 1048576, 15728640, 'bytes', 431],
  ['job_media_video_max_seconds', 'integer', '30', 5, 60, 'seconds', 432],
  ['job_media_video_max_bytes', 'integer', '83886080', 10485760, 157286400, 'bytes', 433],
  ['job_media_voice_max_seconds', 'integer', '60', 10, 120, 'seconds', 434],
  ['job_media_voice_max_bytes', 'integer', '2097152', 262144, 10485760, 'bytes', 435],
];

function expectedRow(category: string, subcategory: string, [key, valueType, value, min, max, unit, order]: Seed) {
  return {
    category, subcategory, key, value_type: valueType, value, default_value: value,
    min_value: min, max_value: max, unit, display_order: order, is_active: true, fallback: SETTING_DEFAULTS[key],
  };
}

it('HA-M2-08: the D38 settings seed their defaults and a seed never overwrites an operator value', async () => {
  await withRequestEngineDatabase(async database => {
    // An operator value already stored before 183 runs.
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');

    await applyRequestEngineMigration(database, 183);
    await applyRequestEngineMigration(database, 184);

    const seeded = await database.query(`SELECT category, subcategory, key, value_type, value, default_value,
        min_value::float8 AS min_value, max_value::float8 AS max_value, unit, display_order, is_active
      FROM platform_settings
      WHERE key LIKE 'request\\_%' AND key <> 'request_first_booking' OR key LIKE 'job\\_media\\_%'
      ORDER BY display_order, key`);
    const rows = seeded.rows.map(row => ({ ...row, fallback: SETTING_DEFAULTS[row.key as string] }));
    expect(rows).toEqual([
      // The operator's row is untouched (category, value and all).
      {
        category: 'fixture', subcategory: null, key: 'request_max_open_quotes', value_type: 'string',
        value: '5', default_value: '5', min_value: null, max_value: null, unit: null, display_order: 0,
        is_active: true, fallback: '1',
      },
      ...REQUEST_SEEDS.slice(1).map(seed => expectedRow('provider', 'requests', seed)),
      ...MEDIA_SEEDS.map(seed => expectedRow('security', 'uploads', seed)),
    ]);
    // Every seeded value is also the code's outage fallback (no drift).
    for (const [key, , value] of [...REQUEST_SEEDS, ...MEDIA_SEEDS]) expect(SETTING_DEFAULTS[key]).toBe(value);

    // An operator edit through the settings service survives a re-run of 184.
    const current = await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM platform_settings WHERE key = 'job_media_max_photos'",
    );
    await updateSetting('job_media_max_photos', '4', {
      changedBy: operatorId,
      reason: 'Pilot: cap request photos at four.',
      expectedUpdatedAt: current.rows[0]!.updated_at.toISOString(),
    });
    await applyRequestEngineMigration(database, 184);

    expect((await database.query(`SELECT key, value, default_value FROM platform_settings
      WHERE key IN ('job_media_max_photos', 'request_max_open_quotes') ORDER BY key`)).rows).toEqual([
      { key: 'job_media_max_photos', value: '4', default_value: '6' },
      { key: 'request_max_open_quotes', value: '5', default_value: '5' },
    ]);
    expect((await database.query(`SELECT setting_key, old_value, new_value, changed_by
      FROM platform_settings_audit`)).rows).toEqual([
      { setting_key: 'job_media_max_photos', old_value: '6', new_value: '4', changed_by: operatorId },
    ]);
  }, { through: 182 });
}, 90000);
