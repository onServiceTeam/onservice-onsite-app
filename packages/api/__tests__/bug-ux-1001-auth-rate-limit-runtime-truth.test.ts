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

it('Bug UX-1001 — authentication rate-limit controls disclose their shared endpoints, IP scope, and refresh timing', () => {
  expect(getSettingRuntimeControl('auth_rate_limit_window_ms')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/Within 60 seconds.*OTP send\/verify.*admin sign-in.*2FA verification.*one IP address.*session refresh is not charged/i),
  });
  expect(getSettingRuntimeControl('auth_rate_limit_max_requests')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/combined request cap.*one IP address.*Lowering it.*current window expires/i),
  });
});
