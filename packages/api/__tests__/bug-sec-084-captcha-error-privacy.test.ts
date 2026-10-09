jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
import { verifyCaptchaToken } from '../src/services/security.service';
import { logger } from '../src/utils/logger';
import { withCaptchaProvider, captchaSecret, captchaProof } from './helpers/captcha-http';

it('Bug SEC-084 - CAPTCHA transport exceptions cannot echo a server secret or proof into diagnostics', async () => {
  jest.clearAllMocks();
  await withCaptchaProvider(response => response.end('{}'), async endpoint => {
    // Deliberate same-realm exception boundary. Native fetch JSON errors are
    // cross-realm in Jest and the original instanceof branch reports Unknown;
    // that case alone would not reproduce the raw-error disclosure branch.
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(new Error(`${captchaSecret} ${captchaProof}`));
    expect(await verifyCaptchaToken(captchaProof)).toBe(false);
    expect(endpoint.requests).toHaveLength(0);
  });
  expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toContain('privatecaptcha');
  expect(logger.error).toHaveBeenCalledWith('CAPTCHA verification failed', { error: 'transport_or_response_error' });
});

it('rejects malformed native HTTP JSON without logging its contents', async () => {
  jest.clearAllMocks();
  for (const privateValue of [captchaSecret, captchaProof]) {
    await withCaptchaProvider(response => response.end(privateValue), async endpoint => {
      expect(await verifyCaptchaToken(captchaProof)).toBe(false);
      expect(endpoint.requests).toHaveLength(1);
    });
  }
  const diagnostics = JSON.stringify(jest.mocked(logger.error).mock.calls);
  expect(diagnostics).not.toContain('privatecaptcha');
  expect(logger.error).toHaveBeenCalledWith('CAPTCHA verification failed', { error: 'transport_or_response_error' });
});
