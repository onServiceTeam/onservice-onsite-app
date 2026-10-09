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

it('Bug UX-1007 — security settings disclose their exact challenge, worker, block, and re-evaluation effects', () => {
  expect(getSettingRuntimeControl('captcha_threshold')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/next OTP-send request.*same phone over 24 hours.*source IP over one hour.*does not add a challenge.*Turnstile keys/i),
  });
  expect(getSettingRuntimeControl('suspicious_ip_threshold')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/Every five minutes.*failed OTP and admin sign-in.*prior hour.*24 hours.*minimum is 10.*manual unblock can be re-evaluated/i),
  });
});
