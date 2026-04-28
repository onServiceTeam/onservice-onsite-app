import { logger } from './logger';

export interface HCaptchaResult {
  success: boolean;
  errorCodes?: string[];
}

interface HCaptchaApiResponse {
  success?: boolean;
  'error-codes'?: string[];
}

/**
 * Verify an hCaptcha response token via hcaptcha.com/siteverify.
 *
 * Behaviour:
 *  - Production with no HCAPTCHA_SECRET → fail closed (errorCode: missing-secret).
 *  - Non-production with no HCAPTCHA_SECRET → bypass (success:true) so dev /
 *    test environments do not require an hCaptcha account.
 *  - Empty token → fail closed (errorCode: missing-token).
 *  - Network error → fail closed (errorCode: network-error).
 */
export async function verifyHCaptchaToken(
  token: string,
  remoteIp?: string,
): Promise<HCaptchaResult> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('HCAPTCHA_SECRET missing in production');
      return { success: false, errorCodes: ['missing-secret'] };
    }
    return { success: true };
  }
  if (!token) {
    return { success: false, errorCodes: ['missing-token'] };
  }
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set('remoteip', remoteIp);
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = (await res.json()) as HCaptchaApiResponse;
    return {
      success: data.success === true,
      errorCodes: data['error-codes'],
    };
  } catch (err) {
    logger.warn('hCaptcha verify failed', { err: String(err) });
    return { success: false, errorCodes: ['network-error'] };
  }
}
