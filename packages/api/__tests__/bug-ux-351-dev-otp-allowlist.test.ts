import {
  assertDevOtpConfiguration,
  isDevOtpCodeAccepted,
  isDevOtpPhoneAllowed,
} from '../src/config/dev-otp';

it('Bug UX-351 — test OTP is fail-closed and restricted to explicitly allowlisted phones', () => {
  const safeStaging: NodeJS.ProcessEnv = {
    NODE_ENV: 'staging',
    ALLOW_DEV_OTP: '1',
    DEV_OTP_CODE: '472819',
    DEV_OTP_ALLOWED_PHONES: '+639000000101,+639000000102',
  };

  expect(() => assertDevOtpConfiguration(safeStaging)).not.toThrow();
  expect(isDevOtpPhoneAllowed('+639000000101', safeStaging)).toBe(true);
  expect(isDevOtpCodeAccepted('+639000000101', '472819', safeStaging)).toBe(true);
  expect(isDevOtpCodeAccepted('+639000000103', '472819', safeStaging)).toBe(false);
  expect(isDevOtpCodeAccepted('+639000000101', '000000', safeStaging)).toBe(false);

  expect(() => assertDevOtpConfiguration({
    NODE_ENV: 'staging',
    ALLOW_DEV_OTP: '1',
    DEV_OTP_CODE: '472819',
  })).toThrow(/DEV_OTP_ALLOWED_PHONES/);
  expect(() => assertDevOtpConfiguration({
    ...safeStaging,
    NODE_ENV: 'production',
  })).toThrow(/production startup blocked/);
});
