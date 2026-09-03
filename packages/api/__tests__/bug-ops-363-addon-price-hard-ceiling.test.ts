jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { ADDON_PRICE_HARD_MAX_CENTAVOS } from '../src/config/catalog.config';
import * as settingsService from '../src/services/settings.service';
import {
  getAddonPriceMaxCentsLive,
} from '../src/validators/admin-catalog.validators';

it('Bug OPS-363 — add-on settings and authoring share one ₱100,000 absolute ceiling', async () => {
  jest.spyOn(settingsService, 'getSettingNumber').mockResolvedValue(50_000_000);

  await expect(getAddonPriceMaxCentsLive()).resolves.toBe(ADDON_PRICE_HARD_MAX_CENTAVOS);

  const row: settingsService.SettingRow = {
    id: 'setting-addon-cap',
    category: 'pricing',
    subcategory: null,
    key: 'addon_price_max_cents',
    label: 'Add-on price maximum',
    description: null,
    value_type: 'currency',
    value: '5000000',
    default_value: '5000000',
    min_value: '0',
    max_value: '50000000',
    allowed_values: null,
    display_order: 1,
    unit: 'centavos',
    is_sensitive: false,
    is_active: true,
    requires_restart: false,
    updated_by: null,
    updated_at: new Date('2026-09-02T00:00:00.000Z'),
    created_at: new Date('2026-09-02T00:00:00.000Z'),
  };

  expect(() => settingsService.validateSettingValue(
    row,
    String(ADDON_PRICE_HARD_MAX_CENTAVOS + 1),
  )).toThrow(/platform hard ceiling.*10000000 centavos/i);
  expect(settingsService.formatSetting(row).maxValue).toBe(ADDON_PRICE_HARD_MAX_CENTAVOS);
});
