import http, { type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '../src/utils/logger';
import { sendEmailVerificationCode } from '../src/services/email-code-delivery.service';

// Only the external provider boundary is redirected. Real fetch, request
// serialization, HTTP responses, cancellation and body reading execute on an
// ephemeral loopback listener. No real recipient or email account is used.
const nativeFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const receiptId = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
const syntheticKey = 're_synthetic_email_contract_key';
type RecordedRequest = { headers: IncomingHttpHeaders; body: string; method?: string; url?: string };
let requests: RecordedRequest[];
let reply: (res: ServerResponse, request: RecordedRequest) => void;
let server: http.Server;
let baseUrl: string;
let fetchSpy: jest.SpyInstance;

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: randomUUID(),
    email: 'tester+tag@example.test',
    code: '048291',
    purpose: 'sign_in' as const,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    ...overrides,
  };
}

beforeEach(async () => {
  requests = [];
  jest.clearAllMocks();
  process.env.EMAIL_AUTH_DELIVERY_ENABLED = '1';
  process.env.RESEND_API_KEY = syntheticKey;
  process.env.EMAIL_FROM = 'signin@example.test';
  reply = res => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: receiptId }));
  };
  // Each case owns its origin as well as its listener. Reusing one origin
  // after closeAllConnections raced fetch's pooled keep-alive socket, turning
  // the next otherwise valid submission into an actual ECONNRESET.
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const record = { headers: req.headers, body, method: req.method, url: req.url };
      requests.push(record);
      reply(res, record);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned HTTP listener');
  baseUrl = `http://127.0.0.1:${address.port}`;
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    // Fail before any network access if production code chooses another URL.
    if (input !== 'https://api.resend.com/emails') {
      throw new Error('Unexpected email provider destination');
    }
    return nativeFetch(`${baseUrl}/emails`, init);
  });
});

afterEach(async () => {
  fetchSpy.mockRestore();
  for (const key of ['EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY', 'EMAIL_FROM', 'NODE_ENV']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe('Email verification delivery provider contract', () => {
  it('Feature EMAIL-01 - submits one private code and returns provider acceptance, not inbox delivery', async () => {
    const input = challenge();
    expect(await sendEmailVerificationCode(input)).toEqual({ status: 'accepted', messageId: receiptId });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/emails');
    expect(request.headers.authorization).toBe(`Bearer ${syntheticKey}`);
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['idempotency-key']).toBe(`onservice-email-code/${input.deliveryId}`);
    const body = JSON.parse(request.body);
    expect(body).toEqual({
      from: 'onService PH <signin@example.test>',
      to: [input.email],
      subject: 'Your onService sign-in code',
      text: expect.stringContaining(input.code),
    });
    expect(body.text).toContain('Do not share this code');
    expect(body.text).toContain('Philippine time');
    expect(body.subject).not.toContain(input.code);
    expect(body).not.toHaveProperty('cc');
    expect(body).not.toHaveProperty('bcc');
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(input.code);
  });

  it('Feature EMAIL-02 - does not report delivery or contact the provider without explicit usable configuration', async () => {
    for (const mode of ['production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      for (const config of [
        { EMAIL_AUTH_DELIVERY_ENABLED: '0', RESEND_API_KEY: syntheticKey, EMAIL_FROM: 'signin@example.test' },
        { EMAIL_AUTH_DELIVERY_ENABLED: '1', RESEND_API_KEY: '', EMAIL_FROM: 'signin@example.test' },
        { EMAIL_AUTH_DELIVERY_ENABLED: '1', RESEND_API_KEY: 're_xxxxxxxxxxxx', EMAIL_FROM: 'signin@example.test' },
        { EMAIL_AUTH_DELIVERY_ENABLED: '1', RESEND_API_KEY: syntheticKey, EMAIL_FROM: '' },
        { EMAIL_AUTH_DELIVERY_ENABLED: '1', RESEND_API_KEY: syntheticKey, EMAIL_FROM: 'a@example.test,b@example.test' },
      ]) {
        Object.assign(process.env, config);
        expect(await sendEmailVerificationCode(challenge())).toEqual({ status: 'unavailable' });
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it('Feature EMAIL-03 - rejects invalid recipients, expired codes and unsafe caller fields before sending', async () => {
    for (const fields of [
      { email: 'a@example.test,b@example.test' }, { email: 'a@example.test\r\nBcc: b@example.test' },
      { email: 'Name <a@example.test>' }, { email: 'x'.repeat(255) + '@example.test' },
      { code: '12345' }, { code: '<123456>' }, { code: '123456\n' },
      { deliveryId: '../another-key' }, { deliveryId: '' }, { purpose: 'admin_recovery' },
      { expiresAt: new Date(Date.now() - 1) }, { expiresAt: new Date(Date.now() + 61 * 60_000) },
      { expiresAt: new Date('invalid') },
    ]) {
      await expect(sendEmailVerificationCode(challenge(fields))).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it('Feature EMAIL-04 - retries an unchanged challenge with identical body and idempotency key', async () => {
    const stored = new Map<string, { body: string; id: string }>();
    reply = (res, request) => {
      const key = String(request.headers['idempotency-key']);
      const old = stored.get(key);
      if (old && old.body !== request.body) {
        res.writeHead(409).end(JSON.stringify({ message: 'payload changed' }));
        return;
      }
      if (!old) stored.set(key, { body: request.body, id: randomUUID() });
      res.writeHead(200).end(JSON.stringify({ id: stored.get(key)!.id }));
    };
    const input = challenge();
    const first = await sendEmailVerificationCode(input);
    const second = await sendEmailVerificationCode(input);
    expect(second).toEqual(first);
    expect(first.status).toBe('accepted');
    expect(requests).toHaveLength(2);
    expect(requests[0]!.body).toBe(requests[1]!.body);
    expect(stored.size).toBe(1);
    const conflicting = await sendEmailVerificationCode({ ...input, code: '999999' });
    expect(conflicting).toEqual({ status: 'rejected', providerStatus: 409 });
    expect(stored.size).toBe(1);
    expect(requests).toHaveLength(3);
  });

  it('Feature EMAIL-05 - gives linking codes an explicit warning and preserves recipient aliases', async () => {
    const input = challenge({ purpose: 'link_email', email: 'First.Last+account@example.test' });
    expect((await sendEmailVerificationCode(input)).status).toBe('accepted');
    const body = JSON.parse(requests[0]!.body);
    expect(body.to).toEqual(['First.Last+account@example.test']);
    expect(body.subject).toBe('Confirm your onService sign-in email');
    expect(body.text).toContain('add this email as a sign-in method');
    expect(body.text).toContain('If you did not request this');
    expect(body.text).toContain(input.code);
  });

  it('Feature EMAIL-06 - surfaces provider rejection without logging response text or trying again', async () => {
    const input = challenge();
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      reply = res => res.writeHead(status).end(JSON.stringify({
        message: `sensitive echo ${input.email} ${input.code} ${syntheticKey}`,
      }));
      expect(await sendEmailVerificationCode(input)).toEqual({ status: 'rejected', providerStatus: status });
    }
    expect(requests).toHaveLength(7);
    const logged = JSON.stringify([
      (logger.info as jest.Mock).mock.calls, (logger.warn as jest.Mock).mock.calls, (logger.error as jest.Mock).mock.calls,
    ]);
    for (const value of [input.email, input.code, syntheticKey, 'sensitive echo']) expect(logged).not.toContain(value);
  });

  it('Feature EMAIL-07 - treats server failures and malformed successful receipts as unknown, not success', async () => {
    for (const response of [
      { status: 500, text: '{"id":"' + receiptId + '"}' },
      { status: 503, text: 'try later' }, { status: 200, text: '{}' },
      { status: 200, text: '{"id":"not-an-email-id"}' }, { status: 200, text: 'not json' },
      { status: 204, text: '' }, { status: 200, text: 'x'.repeat(8192) },
    ]) {
      reply = res => res.writeHead(response.status).end(response.text);
      expect(await sendEmailVerificationCode(challenge())).toEqual({ status: 'unknown' });
    }
    expect(requests).toHaveLength(7);
  });

  it('Feature EMAIL-08 - stops redirects before credentials or the code can reach another path', async () => {
    reply = res => res.writeHead(307, { Location: `${baseUrl}/untrusted` }).end();
    expect(await sendEmailVerificationCode(challenge())).toEqual({ status: 'unknown' });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('/emails');
  });

  it('Feature EMAIL-09 - preserves uncertainty after a request is accepted but the connection is lost', async () => {
    reply = res => res.destroy();
    expect(await sendEmailVerificationCode(challenge())).toEqual({ status: 'unknown' });
    expect(requests).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Feature EMAIL-10 - bounds the whole response including a stalled body without an automatic resend', async () => {
    let closed: Promise<unknown[]> | undefined;
    reply = res => {
      closed = once(res, 'close');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"id":"'); // Headers arrive, but the provider never finishes.
    };
    const started = Date.now();
    expect(await sendEmailVerificationCode(challenge())).toEqual({ status: 'unknown' });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(requests).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(closed).toBeDefined();
    await closed;
  }, 20_000);

  it('Feature EMAIL-11 - expires a send waiting for response headers and does not resend', async () => {
    let closed: Promise<unknown[]> | undefined;
    reply = res => { closed = once(res, 'close'); };
    expect(await sendEmailVerificationCode(challenge({
      expiresAt: new Date(Date.now() + 1000),
    }))).toEqual({ status: 'unknown' });
    expect(requests).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(closed).toBeDefined();
    await closed;
  });
});
