import type { ServerResponse } from 'node:http';
import { openSmsEndpoint as openHttpEndpoint } from './sms-http';

export { openHttpEndpoint };
export const captchaSecret = 'privatecaptchasecret731906';
export const captchaProof = 'privatecaptchaproof048291';
const nativeFetch = globalThis.fetch;

// Only redirect the fixed Siteverify origin to an owned loopback fixture.
// Native HTTP serialization, redirects, streams, parsing and cancellation run.
export async function withCaptchaProvider<T>(
  reply: (response: ServerResponse) => void,
  run: (endpoint: Awaited<ReturnType<typeof openHttpEndpoint>>) => Promise<T>,
): Promise<T> {
  const endpoint = await openHttpEndpoint(reply);
  const previousSecret = process.env.CAPTCHA_SECRET_KEY;
  const previousAlias = process.env.TURNSTILE_SECRET_KEY;
  process.env.CAPTCHA_SECRET_KEY = captchaSecret;
  delete process.env.TURNSTILE_SECRET_KEY;
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    if (url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') throw new Error('Unexpected CAPTCHA destination');
    return nativeFetch(`${endpoint.origin}/siteverify`, init);
  });
  try { return await run(endpoint); }
  finally {
    fetchSpy.mockRestore();
    if (previousSecret === undefined) delete process.env.CAPTCHA_SECRET_KEY;
    else process.env.CAPTCHA_SECRET_KEY = previousSecret;
    if (previousAlias === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previousAlias;
    await endpoint.close();
  }
}
