// HA-M2-12 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// the old max_quotes_per_booking setting is reported to admins as not
// connected and refuses every edit, so request_max_open_quotes is the only
// open-quote limit an operator can change. Real platform_settings rows
// (050's max_quotes_per_booking row, rewritten by migration 183) and the real
// settings service on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import {
  bulkUpdateSettings, formatSetting, getAllSettings, getSettingRuntimeControl, updateSetting,
} from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-12: max_quotes_per_booking is not connected and read-only, while request_max_open_quotes is live', async () => {
  await withRequestEngineDatabase(async database => {
    const stored = async () => (await database.query(`SELECT value, description, updated_at FROM platform_settings
      WHERE key = 'max_quotes_per_booking'`)).rows[0];
    const before = await stored();
    const context = {
      changedBy: operatorId,
      reason: 'Try to allow three quotes again.',
      expectedUpdatedAt: (before.updated_at as Date).toISOString(),
    };

    await expect(updateSetting('max_quotes_per_booking', '3', context)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Setting "max_quotes_per_booking" is read-only: Superseded by request_max_open_quotes (D38).',
    });
    await expect(bulkUpdateSettings(
      [{ key: 'max_quotes_per_booking', value: '3', expectedUpdatedAt: context.expectedUpdatedAt }],
      { changedBy: operatorId, reason: context.reason },
    )).rejects.toMatchObject({ statusCode: 409 });

    expect(await stored()).toEqual(before);
    expect((await database.query('SELECT count(*)::int AS n FROM platform_settings_audit')).rows).toEqual([{ n: 0 }]);

    // What the admin Settings page receives for each row.
    const rows = await getAllSettings();
    const retired = formatSetting(rows.find(row => row.key === 'max_quotes_per_booking')!);
    expect(retired).toMatchObject({
      value: '5',
      description: 'Retired by D38: the live limit is request_max_open_quotes. Kept for history; not read by quote admission.',
      runtimeStatus: 'not_connected',
      runtimeSummary: 'Superseded by request_max_open_quotes (D38).',
      editable: false,
    });
    expect(formatSetting(rows.find(row => row.key === 'request_max_open_quotes')!)).toMatchObject({
      value: '1', runtimeStatus: 'live', editable: true,
    });
    expect(getSettingRuntimeControl('max_quotes_per_booking')).toEqual({
      status: 'not_connected',
      label: 'Not connected',
      summary: 'Superseded by request_max_open_quotes (D38).',
      editable: false,
    });
  });
}, 90000);
