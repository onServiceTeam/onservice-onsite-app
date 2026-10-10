const mockGetSettingInteger = jest.fn();
const mockRateLimitOptions: Array<{ limit?: () => number }> = [];

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: (options: { limit?: () => number }) => {
    mockRateLimitOptions.push(options);
    return (_req: unknown, _res: unknown, next: () => void): void => next();
  },
  ipKeyGenerator: (ip: string): string => `ip:${ip}`,
}));
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: class RedisStoreMock {},
}));

jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => mockGetSettingInteger(...args),
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { call: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  __getUploadCachedForTest,
  refreshUploadRateLimits,
} from '../src/middleware/rate-limit.middleware';

it('Bug UX-1006 — the upload limiter refreshes both operator-owned quota values together', async () => {
  mockGetSettingInteger.mockImplementation(async (key: string) => {
    if (key === 'upload_rate_limit_window_ms') return 120_000;
    if (key === 'upload_rate_limit_max_requests') return 12;
    throw new Error(`Unexpected setting: ${key}`);
  });

  await refreshUploadRateLimits();

  expect(mockGetSettingInteger).toHaveBeenCalledWith('upload_rate_limit_window_ms');
  expect(mockGetSettingInteger).toHaveBeenCalledWith('upload_rate_limit_max_requests');
  expect(__getUploadCachedForTest()).toEqual({ windowMs: 120_000, max: 12 });
  expect(mockRateLimitOptions.at(-1)?.limit?.()).toBe(12);
});
