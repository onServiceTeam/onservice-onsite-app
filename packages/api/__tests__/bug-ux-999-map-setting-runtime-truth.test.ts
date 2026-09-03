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

it('Bug UX-999 — map settings describe their real Dispatch consumer and browser-visible effect', () => {
  expect(getSettingRuntimeControl('map_tile_url')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/Dispatch Console.*next load.*already-open admin sessions.*reload/i),
  });
  expect(getSettingRuntimeControl('map_tile_attribution')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/Dispatch Console.*provider attribution.*licence/i),
  });
  expect(getSettingRuntimeControl('map_tile_api_key')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/publishable browser token.*admin domain.*not store a server secret/i),
  });
});
