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

it('Bug UX-1013 — operator settings disclose prospective matching, fraud-signal, and cache effects without implying historical rewrites', () => {
  expect(getSettingRuntimeControl('marketing_channels')).toMatchObject({
    status: 'live', editable: true,
    summary: expect.stringMatching(/new campaign tracking records.*Existing campaign spend and attribution remain unchanged.*historical filters/i),
  });
  expect(getSettingRuntimeControl('matching_tier_bonus')).toMatchObject({
    summary: expect.stringMatching(/future provider candidate lists.*Existing bookings, assignments, prices, and provider commission/i),
  });
  expect(getSettingRuntimeControl('matching_min_rating')).toMatchObject({
    summary: expect.stringMatching(/future candidate lists.*completed-job reviews.*does not suspend.*existing assignment/i),
  });
  expect(getSettingRuntimeControl('matching_min_rating_reviews')).toMatchObject({
    summary: expect.stringMatching(/completed-job reviews.*Providers below.*remain eligible.*existing work/i),
  });
  expect(getSettingRuntimeControl('fraud_pattern_dispute_count_threshold')).toMatchObject({
    summary: expect.stringMatching(/Customer 360.*read-only fraud-pattern signal.*customer-filed disputes.*does not flag, suspend, refund, or resolve/i),
  });
  expect(getSettingRuntimeControl('fraud_pattern_window_days')).toMatchObject({
    summary: expect.stringMatching(/Customer 360.*read-only fraud-pattern signal.*lookback.*Existing disputes.*unchanged/i),
  });
  expect(getSettingRuntimeControl('fraud_pattern_favor_provider_rate')).toMatchObject({
    summary: expect.stringMatching(/resolved no-refund outcomes.*all resolved customer-filed disputes.*does not take enforcement or payment action/i),
  });
  expect(getSettingRuntimeControl('cache_ttl_categories')).toMatchObject({
    summary: expect.stringMatching(/next uncached public catalog.*Redis and browser-cache lifetime.*Already-cached responses.*original expiry.*mutations invalidate/i),
  });
  expect(getSettingRuntimeControl('cache_ttl_search_results')).toMatchObject({
    summary: expect.stringMatching(/next uncached public catalog search.*Already-cached search responses.*original expiry/i),
  });
});
