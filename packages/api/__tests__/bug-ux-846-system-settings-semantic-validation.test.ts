jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

import { validateSettingValue, type SettingRow } from '../src/services/settings.service';

function setting(key: string, valueType = 'string'): SettingRow {
  return {
    id: key, category: 'test', subcategory: null, key, label: key, description: null,
    value_type: valueType, value: '', default_value: '', min_value: null, max_value: null,
    allowed_values: null, display_order: 1, unit: null, is_sensitive: false, is_active: true,
    requires_restart: false, updated_by: null, updated_at: new Date(), created_at: new Date(),
  };
}

it('Bug UX-846 — System Settings rejects malformed structured values before they reach runtime consumers', () => {
  const invalidCases: Array<[SettingRow, string]> = [
    [setting('marketing_channels', 'json'), '{not-json'],
    [setting('marketing_channels', 'json'), '["email","email"]'],
    [setting('matching_tier_bonus', 'json'), '{"elite":999}'],
    [setting('suki_tiers', 'json'), '{"new":{"minBookings":5,"pointsPerPeso":1,"discount":0}}'],
    [setting('brand_color_primary'), 'blue'],
    [setting('allowed_image_mime_types'), 'image/jpeg,image/svg+xml'],
    [setting('map_tile_url'), 'http://tiles.example/{z}/{x}/{y}.png'],
    [setting('map_tile_url'), 'https://tiles.example/static.png'],
    [setting('map_tile_attribution'), '<script>alert(1)</script>'],
  ];

  for (const [row, value] of invalidCases) {
    expect(() => validateSettingValue(row, value)).toThrow();
  }
});
