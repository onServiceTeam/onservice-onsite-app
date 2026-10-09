jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

import { getSettingRuntimeControl } from '../src/services/settings.service';

it('Bug UX-844 — branding controls disclose that mobile and admin releases are required', () => {
  for (const key of ['brand_color_primary', 'brand_color_secondary', 'brand_color_accent']) {
    expect(getSettingRuntimeControl(key)).toMatchObject({
      status: 'release_coupled',
      label: 'Release required',
      editable: true,
    });
  }
});
