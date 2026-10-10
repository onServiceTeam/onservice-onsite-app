const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

import { formatSetting, getSettingAuditHistory, type SettingRow } from '../src/services/settings.service';

it('Bug UX-845 — sensitive settings redact current, default, and audit-history values', async () => {
  const row: SettingRow = {
    id: 'setting-1', category: 'dispatch', subcategory: 'map', key: 'map_tile_api_key',
    label: 'Map key', description: null, value_type: 'string', value: 'live-secret',
    default_value: 'default-secret', min_value: null, max_value: null, allowed_values: null,
    display_order: 1, unit: null, is_sensitive: true, is_active: true,
    requires_restart: false, updated_by: 'admin-1', updated_at: new Date(), created_at: new Date(),
  };

  expect(formatSetting(row)).toMatchObject({ value: '••••••', defaultValue: '••••••' });

  dbQueryMock.mockResolvedValueOnce({ rows: [] });
  await getSettingAuditHistory('map_tile_api_key');
  const sql = dbQueryMock.mock.calls[0]![0] as string;
  expect(sql).toContain("CASE WHEN ps.is_sensitive THEN '[REDACTED]' ELSE sa.old_value END");
  expect(sql).toContain("CASE WHEN ps.is_sensitive THEN '[REDACTED]' ELSE sa.new_value END");
  expect(sql).toContain('JOIN platform_settings ps ON ps.id = sa.setting_id');
});
