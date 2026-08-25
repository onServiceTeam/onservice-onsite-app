const PH_MOBILE_PATTERN = /^\+639\d{9}$/;
const OTP_PATTERN = /^\d{6}$/;

function configuredPhones(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.DEV_OTP_ALLOWED_PHONES ?? '')
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean),
  );
}

/**
 * Validate the intentionally narrow test-login contract before the API binds.
 * A developer code must never work in production and must never be a global
 * "log in as any phone" bypass on staging/development.
 */
export function assertDevOtpConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_DEV_OTP !== '1') return;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: production startup blocked — ALLOW_DEV_OTP is enabled. Disable test login before production boot.',
    );
  }

  if (!OTP_PATTERN.test(env.DEV_OTP_CODE ?? '')) {
    throw new Error(
      'FATAL: ALLOW_DEV_OTP requires an explicit six-digit DEV_OTP_CODE.',
    );
  }

  const phones = configuredPhones(env);
  if (phones.size === 0) {
    throw new Error(
      'FATAL: ALLOW_DEV_OTP requires DEV_OTP_ALLOWED_PHONES; a global phone-login bypass is forbidden.',
    );
  }

  const invalid = [...phones].filter((phone) => !PH_MOBILE_PATTERN.test(phone));
  if (invalid.length > 0) {
    throw new Error(
      'FATAL: DEV_OTP_ALLOWED_PHONES contains an invalid Philippine mobile number.',
    );
  }
}

export function isDevOtpPhoneAllowed(
  phone: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== 'production'
    && env.ALLOW_DEV_OTP === '1'
    && OTP_PATTERN.test(env.DEV_OTP_CODE ?? '')
    && configuredPhones(env).has(phone);
}

export function isDevOtpCodeAccepted(
  phone: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDevOtpPhoneAllowed(phone, env) && code === env.DEV_OTP_CODE;
}
