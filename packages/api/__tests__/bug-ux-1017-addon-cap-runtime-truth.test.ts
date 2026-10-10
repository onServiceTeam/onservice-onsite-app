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

it('Bug UX-1017 — add-on cap copy discloses prospective enforcement and grandfathered history', () => {
  expect(getSettingRuntimeControl('addon_price_max_cents')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(
      /future add-on creation.*price changes.*reactivation.*₱100,000.*Existing active add-ons remain customer-visible and bookable.*Catalog.*historical booking price snapshots never change/i,
    ),
  });
});
