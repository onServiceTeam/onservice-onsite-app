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

it('Bug UX-989 — unresolved no-show refund policy cannot remain an editable live setting', () => {
  expect(getSettingRuntimeControl('noshow_auto_resolve_window_minutes')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/automatic full refund.*E59.*E18/i),
  });
});
