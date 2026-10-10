jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
import { verifyCaptchaToken } from '../src/services/security.service';
import { withCaptchaProvider, captchaProof } from './helpers/captcha-http';

it('Bug SEC-085 - an error HTTP response cannot grant CAPTCHA success from its body', async () => {
  const results: boolean[] = [];
  for (const status of [400, 403, 429, 500, 503]) {
    await withCaptchaProvider(response => response.writeHead(status).end('{"success":true}'), async endpoint => {
      results.push(await verifyCaptchaToken(captchaProof));
      expect(endpoint.requests).toHaveLength(1);
    });
  }
  expect(results).toEqual([false, false, false, false, false]);
});

it('accepts only a literal successful object in a successful HTTP response', async () => {
  for (const [body, expected] of [
    ['{"success":true,"hostname":"app.example.test"}', true],
    ['{"success":false,"error-codes":["timeout-or-duplicate"]}', false],
    ['{"success":"true"}', false], ['{"success":1}', false], ['{}', false], ['null', false], ['[]', false],
  ] as const) {
    await withCaptchaProvider(response => response.end(body), async endpoint => {
      expect(await verifyCaptchaToken(captchaProof)).toBe(expected);
      expect(endpoint.requests).toHaveLength(1);
    });
  }
});
