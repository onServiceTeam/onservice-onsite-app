const dbQueryMock = jest.fn();
const getSettingIntegerMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: {
    rateLimitsRelaxed: false,
    otpLockoutThresholds: [{ failures: 3, lockoutMinutes: 5 }],
    ipOtpLockoutThreshold: 20,
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => getSettingIntegerMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { checkOtpLockout } from '../src/services/security.service';

it('Bug UX-253 — OTP CAPTCHA escalation consumes the live admin threshold', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '2' }] })
    .mockResolvedValueOnce({ rows: [{ count: '0' }] });
  getSettingIntegerMock.mockResolvedValueOnce(2);

  const result = await checkOtpLockout('+639171234567', '203.0.113.7');

  expect(getSettingIntegerMock).toHaveBeenCalledWith('captcha_threshold');
  expect(result).toEqual({ locked: false, captchaRequired: true });
});
