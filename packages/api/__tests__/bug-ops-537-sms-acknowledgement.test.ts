import http, { type ServerResponse } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import request from 'supertest';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/security.service', () => ({
  checkOtpLockout: jest.fn().mockResolvedValue({ locked: false, captchaRequired: false }),
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
}));

import { sendSms, sendOtpSms } from '../src/services/sms.service';
import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { recordLoginAttempt } from '../src/services/security.service';
import { sessionIntegrationIt as integrationIt, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';
import { platformConfig } from '../src/config/platform.config';

// Only the fixed provider destination is replaced. Native fetch and actual
// HTTP serialization/parsing execute; no real phone, key or SMS is used.
const nativeFetch = globalThis.fetch;
const originalKey = process.env.SEMAPHORE_API_KEY;
const originalSender = process.env.SEMAPHORE_SENDER_NAME;
const originalMode = process.env.NODE_ENV;
const originalBypass = process.env.ALLOW_DEV_OTP;
const phone = '+639170000000';
const receipt = { message_id: 123, recipient: phone.slice(1), status: 'Pending' };
let server: http.Server;
let reply: (response: ServerResponse) => void;
let requests: { method?: string; body: string }[];
let fetchSpy: jest.SpyInstance;
const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRouter);
app.use(errorMiddleware);

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.SEMAPHORE_API_KEY = 'synthetic-sms-key';
  process.env.SEMAPHORE_SENDER_NAME = 'onService';
  requests = [];
  reply = response => response.end(JSON.stringify([receipt]));
  server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, body });
      response.setHeader('Content-Type', 'application/json');
      reply(response);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned SMS test listener');
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    if (url !== 'https://api.semaphore.co/api/v4/messages') throw new Error('Unexpected SMS destination');
    return nativeFetch(`http://127.0.0.1:${address.port}/messages`, init);
  });
});

afterEach(async () => {
  fetchSpy.mockRestore();
  if (originalKey === undefined) delete process.env.SEMAPHORE_API_KEY;
  else process.env.SEMAPHORE_API_KEY = originalKey;
  if (originalSender === undefined) delete process.env.SEMAPHORE_SENDER_NAME;
  else process.env.SEMAPHORE_SENDER_NAME = originalSender;
  if (originalMode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalMode;
  if (originalBypass === undefined) delete process.env.ALLOW_DEV_OTP;
  else process.env.ALLOW_DEV_OTP = originalBypass;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

it('Bug OPS-537 - an HTTP 200 alone cannot acknowledge a rejected or unmatched phone-code submission', async () => {
  const bodies: unknown[] = [
    [], {}, null, { error: 'synthetic rejection' },
    [{ ...receipt, status: 'Failed' }], [{ ...receipt, status: 'Refunded' }],
    [{ ...receipt, status: 'unknown' }], [{ ...receipt, status: '' }],
    [{ ...receipt, status: null }], [{ message_id: 123 }],
    [{ ...receipt, recipient: '639170000001' }], [{ ...receipt, recipient: null }],
    [{ ...receipt, message_id: 0 }], [{ ...receipt, message_id: -1 }],
    [{ ...receipt, message_id: 1.5 }], [{ ...receipt, message_id: '123' }],
    [{ ...receipt, message_id: Number.MAX_SAFE_INTEGER + 1 }],
    [receipt, { ...receipt, message_id: 456 }],
  ];
  const outcomes: boolean[] = [];
  for (const body of bodies) {
    reply = response => response.end(JSON.stringify(body));
    outcomes.push(await sendOtpSms(phone, '048291', 5));
  }
  expect(outcomes).toEqual(bodies.map(() => false));
  expect(requests).toHaveLength(bodies.length);
  expect(fetchSpy).toHaveBeenCalledTimes(bodies.length);
});

it('acknowledges one matching queued, pending or sent receipt without claiming handset delivery', async () => {
  for (const status of ['Queued', 'Pending', 'Sent', 'queued', 'pending', 'sent']) {
    reply = response => response.end(JSON.stringify([{ ...receipt, status }]));
    expect(await sendOtpSms(phone, '048291', 5)).toBe(true);
  }
  expect(requests).toHaveLength(6);
  for (const request of requests) {
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toEqual({
      apikey: 'synthetic-sms-key', number: phone.slice(1), sendername: 'onService',
      message: 'Your onService verification code is: 048291. Valid for 5 minutes. Do not share this code.',
    });
  }
});

it('retains HTTP, malformed JSON and lost-response failure without an automatic retry', async () => {
  for (const [status, body] of [[429, 'limited'], [500, JSON.stringify([receipt])], [200, 'not json']] as const) {
    reply = response => response.writeHead(status).end(body);
    expect(await sendSms(phone, 'Synthetic status check')).toBe(false);
  }
  reply = response => response.destroy();
  expect(await sendSms(phone, 'Synthetic status check')).toBe(false);
  expect(requests).toHaveLength(4);
  expect(fetchSpy).toHaveBeenCalledTimes(4);
});

// The real auth route/service/OTP SQL/hash/session code and native HTTP sender
// run. Abuse middleware/policy/audit calls are explicit fixture boundaries,
// not live CAPTCHA, inbox, handset or whole-schema acceptance.
integrationIt('the production-mode caller reports a rejected SMS without a successful-send audit or new credentials', async () => {
  await withSessionDatabase(async database => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_OTP = '0';
    expect(platformConfig.rateLimitsRelaxed).toBe(false);
    await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
      is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()); DELETE FROM refresh_tokens;`);
    const account = (await database.query('SELECT * FROM users')).rows;
    reply = response => response.end(JSON.stringify([{ ...receipt, status: 'Failed' }]));
    const denied = await request(app).post('/api/v1/auth/send-otp').send({ phone });
    expect(denied.status).toBe(502);
    expect(denied.body.success).toBe(false);
    expect(recordLoginAttempt).toHaveBeenCalledTimes(1);
    expect(recordLoginAttempt).toHaveBeenLastCalledWith(expect.objectContaining({ success: false }));
    expect(requests).toHaveLength(1);
    expect((await database.query('SELECT * FROM users')).rows).toEqual(account);
    expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
    // Existing policy retains the hashed challenge on uncertain delivery.
    // This correction neither erases it nor bypasses the resend cooldown.
    expect((await database.query('SELECT code,code_hash,is_used FROM otp_codes')).rows)
      .toEqual([{ code: null, code_hash: expect.stringMatching(/^scrypt:/), is_used: false }]);
    expect((await request(app).post('/api/v1/auth/send-otp').send({ phone })).status).toBe(429);
    expect(requests).toHaveLength(1);
  });
}, 30000);

integrationIt('an accepted receipt preserves customer, provider and staff OTP sign-in and replay rejection', async () => {
  for (const role of ['customer', 'provider', 'provider_staff']) {
    await withSessionDatabase(async database => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEV_OTP = '0';
      await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
        is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()); DELETE FROM refresh_tokens;`);
      expect((await request(app).post('/api/v1/auth/send-otp').send({ phone })).status).toBe(200);
      const message = String(JSON.parse(requests.at(-1)!.body).message);
      const code = /code is: (\d{6})/.exec(message)?.[1];
      expect(code).toMatch(/^\d{6}$/);
      const login = await request(app).post('/api/v1/auth/verify-otp').send({ phone, code });
      expect(login.status).toBe(200);
      expect(login.body.data.user).toMatchObject({ id: sessionOwner, role });
      expect((await database.query('SELECT user_id FROM refresh_tokens')).rows).toEqual([{ user_id: sessionOwner }]);
      expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
      expect((await request(app).post('/api/v1/auth/verify-otp').send({ phone, code })).status).toBe(400);
      expect((await database.query('SELECT user_id FROM refresh_tokens')).rows).toEqual([{ user_id: sessionOwner }]);
    }, role);
    process.env.NODE_ENV = 'test';
  }
  expect(requests).toHaveLength(3);
}, 30000);
