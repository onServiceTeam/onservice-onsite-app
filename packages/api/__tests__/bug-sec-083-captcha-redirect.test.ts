jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
import { verifyCaptchaToken } from '../src/services/security.service';
import { openHttpEndpoint, withCaptchaProvider, captchaSecret, captchaProof } from './helpers/captcha-http';

it('Bug SEC-083 - CAPTCHA redirects cannot forward a server secret or proof to another origin', async () => {
  const receiver = await openHttpEndpoint(response => response.end('{"success":true}'));
  const results: boolean[] = [];
  try {
    for (const status of [301, 302, 303, 307, 308]) {
      await withCaptchaProvider(response => response.writeHead(status, { Location: `${receiver.origin}/redirect` }).end(), async endpoint => {
        results.push(await verifyCaptchaToken(captchaProof));
        expect(endpoint.requests).toHaveLength(1);
        expect(Object.fromEntries(new URLSearchParams(endpoint.requests[0]!.body))).toEqual({
          secret: captchaSecret, response: captchaProof,
        });
      });
    }
    expect({ results, forwarded: receiver.requests }).toEqual({ results: [false, false, false, false, false], forwarded: [] });
  } finally { await receiver.close(); }
});
