import express from 'express';
import request from 'supertest';

jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';
import emailRouter from '../src/routes/email-sign-in.routes';
import emailCodeRouter from '../src/routes/email-code.routes';
import { db } from '../src/models/db';
import { errorMiddleware } from '../src/middleware/error.middleware';

// D37 (2026-10-11) replaced this discovery contract. It used to describe the
// dormant 2026-10-09 email flow (which needed CAPTCHA keys); it now reports
// the two server switches the web app and the APK read at the sign-in screen:
// phone codes (PHONE_OTP_SIGN_IN_ENABLED, on unless '0') and email codes
// (EMAIL_CODE_SIGN_IN_ENABLED=1 plus a configured sender). The guarantees
// are unchanged: public, never cached, no database or network, re-evaluated
// on every request, identical for every caller.

const app = express();
app.use(express.json());
// Same order and mounts as the real server.
app.use('/api/v1/auth/email-code', emailCodeRouter);
app.use('/api/v1/auth/email', emailRouter);
app.use('/api/v1/auth', authRouter);
app.use(errorMiddleware);

const keys = ['EMAIL_CODE_SIGN_IN_ENABLED', 'EMAIL_SIGN_IN_ENABLED', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY',
  'EMAIL_FROM', 'PHONE_OTP_SIGN_IN_ENABLED', 'JWT_SECRET'] as const;
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const configured = {
  EMAIL_CODE_SIGN_IN_ENABLED: '1', EMAIL_AUTH_DELIVERY_ENABLED: '1',
  RESEND_API_KEY: 're_synthetic_discovery_only', EMAIL_FROM: 'fixture@example.invalid',
  JWT_SECRET: 'synthetic-discovery-secret',
};
const emailOff = { enabled: false, codeLength: 6, validForMs: 300000, resendCooldownMs: 30000 };
const emailOn = { ...emailOff, enabled: true };
const body = (phoneEnabled: boolean, email: typeof emailOff) => ({
  success: true, data: { phoneOtp: { supported: true, enabled: phoneEnabled }, emailCode: email },
});

beforeEach(() => {
  keys.forEach(key => delete process.env[key]);
  jest.clearAllMocks();
});
afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
  jest.restoreAllMocks();
});

it('discovery is public, email codes default off and phone codes default on, with no database or provider use', async () => {
  const network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'));
  for (const flag of [undefined, '0', 'false', 'true', ' 1 ']) {
    if (flag !== undefined) process.env.EMAIL_CODE_SIGN_IN_ENABLED = flag;
    const response = await request(app).get('/api/v1/auth/methods');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(body(true, emailOff));
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it('D37 - email codes are reported on only with the switch, a configured sender and a server key', async () => {
  const missing: [string, string | undefined][] = [
    ['EMAIL_CODE_SIGN_IN_ENABLED', undefined], ['EMAIL_CODE_SIGN_IN_ENABLED', 'true'],
    ['EMAIL_AUTH_DELIVERY_ENABLED', undefined], ['EMAIL_AUTH_DELIVERY_ENABLED', 'true'],
    ['RESEND_API_KEY', undefined], ['RESEND_API_KEY', 're_xxxxxxxxxxxx'], ['RESEND_API_KEY', 'invalid'],
    ['EMAIL_FROM', undefined], ['EMAIL_FROM', 'invalid'], ['JWT_SECRET', undefined],
  ];
  for (const [key, value] of missing) {
    Object.assign(process.env, configured);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    const response = await request(app).get('/api/v1/auth/methods');
    expect({ key, value, status: response.status, body: response.body })
      .toEqual({ key, value, status: 200, body: body(true, emailOff) });
  }
  Object.assign(process.env, configured);
  expect((await request(app).get('/api/v1/auth/methods')).body).toEqual(body(true, emailOn));
  // The dormant 2026-10-09 switch alone does not turn the new email codes on.
  keys.forEach(key => delete process.env[key]);
  Object.assign(process.env, configured, { EMAIL_SIGN_IN_ENABLED: '1' });
  delete process.env.EMAIL_CODE_SIGN_IN_ENABLED;
  expect((await request(app).get('/api/v1/auth/methods')).body).toEqual(body(true, emailOff));
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
});

it('D37 - phone codes are reported off only for PHONE_OTP_SIGN_IN_ENABLED=0', async () => {
  for (const [flag, enabled] of [[undefined, true], ['1', true], ['0', false], ['false', true], [' 0', true]] as const) {
    if (flag === undefined) delete process.env.PHONE_OTP_SIGN_IN_ENABLED; else process.env.PHONE_OTP_SIGN_IN_ENABLED = flag;
    const response = await request(app).get('/api/v1/auth/methods');
    expect({ flag, body: response.body }).toEqual({ flag, body: body(enabled, emailOff) });
  }
});

it('discovery re-evaluates the switches on every request without cache validators', async () => {
  Object.assign(process.env, configured);
  const first = await request(app).get('/api/v1/auth/methods');
  expect(first.status).toBe(200);
  expect(first.body).toEqual(body(true, emailOn));
  expect(first.headers['cache-control']).toBe('private, no-store');
  expect(first.headers.etag).toBeUndefined();
  expect(first.headers['last-modified']).toBeUndefined();
  expect(first.headers['set-cookie']).toBeUndefined();
  const repeated = await request(app).get('/api/v1/auth/methods').set('If-None-Match', '*');
  expect(repeated.status).toBe(200);
  expect(repeated.body).toEqual(body(true, emailOn));
  delete process.env.RESEND_API_KEY;
  process.env.PHONE_OTP_SIGN_IN_ENABLED = '0';
  const changed = await request(app).get('/api/v1/auth/methods').set('If-None-Match', '*');
  expect(changed.status).toBe(200);
  expect(changed.body).toEqual(body(false, emailOff));
  const head = await request(app).head('/api/v1/auth/methods');
  expect(head.status).toBe(200);
  expect(head.text).toBeUndefined();
  expect(head.headers['cache-control']).toBe('private, no-store');
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
});

it('caller identities and roles cannot change discovery or gain access to protected or credential routes', async () => {
  Object.assign(process.env, configured);
  const network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'));
  for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo']) {
    const response = await request(app).get('/api/v1/auth/methods')
      .query({ role, email: 'synthetic-unknown@example.invalid', phone: '+639000000001' })
      .set('Authorization', 'Bearer synthetic-invalid-token').set('Cookie', 'admin_session=synthetic-invalid');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(body(true, emailOn));
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  // The dormant 2026-10-09 routes stay switched off.
  expect((await request(app).post('/api/v1/auth/email/requests').send({ email: 'fixture@example.invalid' })).status).toBe(503);
  expect((await request(app).post('/api/v1/auth/methods').send({ role: 'admin' })).status).toBe(404);
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
