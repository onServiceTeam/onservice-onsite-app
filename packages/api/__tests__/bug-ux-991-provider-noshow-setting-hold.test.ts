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

it('Bug UX-991 — unresolved customer no-show timing cannot remain an editable live setting', () => {
  expect(getSettingRuntimeControl('provider_noshow_minutes')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/provider-late alerts.*customer no-show money decision.*E60/i),
  });
});
