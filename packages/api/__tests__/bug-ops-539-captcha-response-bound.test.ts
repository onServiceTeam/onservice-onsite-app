jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
import { setTimeout as delay } from 'node:timers/promises';
import { verifyCaptchaToken } from '../src/services/security.service';
import { withCaptchaProvider, captchaProof } from './helpers/captcha-http';

it('Bug OPS-539 - CAPTCHA validation closes stalled headers and bodies within its deadline', async () => {
  const outcomes: { phase: string; result: boolean | string; closed: number; sends: number }[] = [];
  for (const phase of ['headers', 'body']) {
    let pending: Promise<boolean> | undefined;
    await withCaptchaProvider(response => {
      if (phase === 'body') { response.writeHead(200); response.write('{'); }
    }, async endpoint => {
      pending = verifyCaptchaToken(captchaProof);
      const observer = new AbortController();
      const result = await Promise.race([pending, delay(12_000, 'observer_deadline', { signal: observer.signal })])
        .finally(() => observer.abort());
      for (let attempt = 0; attempt < 20 && endpoint.closedResponses() === 0; attempt++) await delay(10);
      outcomes.push({ phase, result, closed: endpoint.closedResponses(), sends: endpoint.requests.length });
    });
    await pending;
  }
  expect(outcomes).toEqual([
    { phase: 'headers', result: false, closed: 1, sends: 1 },
    { phase: 'body', result: false, closed: 1, sends: 1 },
  ]);
}, 30000);

it('counts actual streamed response bytes and preserves the exact accepted boundary', async () => {
  for (const [body, expected] of [
    ['{"success":true}'.padEnd(4096), true],
    ['{"success":true}'.padEnd(4097), false],
    [JSON.stringify({ success: true, data: 'é'.repeat(2100) }), false],
  ] as const) {
    await withCaptchaProvider(response => { response.writeHead(200); response.write(body); response.end(); }, async () => {
      expect(await verifyCaptchaToken(captchaProof)).toBe(expected);
    });
  }
});

it('closes oversized and rejected unfinished bodies without waiting for their end or retrying', async () => {
  const outcomes: { result: boolean | string; closed: number; sends: number }[] = [];
  for (const status of [200, 429]) {
    let pending: Promise<boolean> | undefined;
    await withCaptchaProvider(response => {
      response.writeHead(status);
      response.write(status === 200 ? '{"success":true}'.padEnd(4097) : '{"error":"');
    }, async endpoint => {
      pending = verifyCaptchaToken(captchaProof);
      const observer = new AbortController();
      const result = await Promise.race([pending, delay(1500, 'observer_deadline', { signal: observer.signal })])
        .finally(() => observer.abort());
      for (let attempt = 0; attempt < 20 && endpoint.closedResponses() === 0; attempt++) await delay(10);
      outcomes.push({ result, closed: endpoint.closedResponses(), sends: endpoint.requests.length });
    });
    await pending;
  }
  expect(outcomes).toEqual([{ result: false, closed: 1, sends: 1 }, { result: false, closed: 1, sends: 1 }]);
});
