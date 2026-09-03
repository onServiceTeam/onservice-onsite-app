jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSettingRuntimeControl } from '../src/services/settings.service';

it('Bug UX-987 — unresolved Suki money policy cannot remain an editable live setting', () => {
  expect(getSettingRuntimeControl('suki_tiers')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/E25 and E44/i),
  });
  expect(getSettingRuntimeControl('suki_points_to_peso_rate')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/peso-to-centavo mismatch/i),
  });
});
