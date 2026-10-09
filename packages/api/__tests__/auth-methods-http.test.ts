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
import { db } from '../src/models/db';
import { errorMiddleware } from '../src/middleware/error.middleware';

const app = express();
app.use(express.json());
// Same order and mounts as the real server, including the default-off email router.
app.use('/api/v1/auth/email', emailRouter);
app.use('/api/v1/auth', authRouter);
app.use(errorMiddleware);

const keys = ['EMAIL_SIGN_IN_ENABLED', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY',
  'EMAIL_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'CAPTCHA_SECRET_KEY'] as const;
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const configured = {
  EMAIL_SIGN_IN_ENABLED: '1', EMAIL_AUTH_DELIVERY_ENABLED: '1',
  RESEND_API_KEY: 're_synthetic_discovery_only', EMAIL_FROM: 'fixture@example.invalid',
  TURNSTILE_SITE_KEY: 'synthetic-public-site-key', TURNSTILE_SECRET_KEY: 'synthetic-private-secret',
};
const disabled = { success: true, data: { phoneOtp: { supported: true }, emailCode: { enabled: false } } };
const enabled = { success: true, data: { phoneOtp: { supported: true },
  emailCode: { enabled: true, captchaSiteKey: configured.TURNSTILE_SITE_KEY } } };

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

it('discovery remains public and default-off without querying accounts or contacting a provider', async () => {
  const network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'));
  for (const flag of [undefined, '0', 'false', 'true', ' 1 ']) {
    if (flag !== undefined) process.env.EMAIL_SIGN_IN_ENABLED = flag;
    const response = await request(app).get('/api/v1/auth/methods');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(disabled);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it('email discovery requires the existing sender guard and both public and private CAPTCHA configuration', async () => {
  const missing: [string, string | undefined][] = [
    ['EMAIL_SIGN_IN_ENABLED', undefined], ['EMAIL_AUTH_DELIVERY_ENABLED', undefined],
    ['EMAIL_AUTH_DELIVERY_ENABLED', 'true'], ['RESEND_API_KEY', undefined],
    ['RESEND_API_KEY', 're_xxxxxxxxxxxx'], ['RESEND_API_KEY', 'invalid'],
    ['EMAIL_FROM', undefined], ['EMAIL_FROM', 'invalid'],
    ['TURNSTILE_SITE_KEY', undefined], ['TURNSTILE_SITE_KEY', '   '],
    ['TURNSTILE_SECRET_KEY', undefined], ['TURNSTILE_SECRET_KEY', '   '],
  ];
  for (const [key, value] of missing) {
    Object.assign(process.env, configured);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    const response = await request(app).get('/api/v1/auth/methods');
    expect({ key, status: response.status, body: response.body }).toEqual({ key, status: 200, body: disabled });
  }
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
});

it('configured discovery returns only the public key and re-evaluates configuration without cache validators', async () => {
  Object.assign(process.env, configured);
  const first = await request(app).get('/api/v1/auth/methods');
  expect(first.status).toBe(200);
  expect(first.body).toEqual(enabled);
  expect(first.headers['cache-control']).toBe('private, no-store');
  expect(first.headers.etag).toBeUndefined();
  expect(first.headers['last-modified']).toBeUndefined();
  expect(first.headers['set-cookie']).toBeUndefined();
  // Discovery is a current configuration snapshot, not a cache-revalidation API.
  const repeated = await request(app).get('/api/v1/auth/methods').set('If-None-Match', '*');
  expect(repeated.status).toBe(200);
  expect(repeated.body).toEqual(enabled);
  delete process.env.RESEND_API_KEY;
  const changed = await request(app).get('/api/v1/auth/methods').set('If-None-Match', '*');
  expect(changed.status).toBe(200);
  expect(changed.body).toEqual(disabled);
  const head = await request(app).head('/api/v1/auth/methods');
  expect(head.status).toBe(200);
  expect(head.text).toBeUndefined();
  expect(head.headers['cache-control']).toBe('private, no-store');
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
});

it('legacy CAPTCHA secret selection matches the request route without exposing either secret', async () => {
  Object.assign(process.env, configured);
  delete process.env.TURNSTILE_SECRET_KEY;
  process.env.CAPTCHA_SECRET_KEY = 'synthetic-legacy-private-secret';
  expect((await request(app).get('/api/v1/auth/methods')).body).toEqual(enabled);
  process.env.TURNSTILE_SECRET_KEY = configured.TURNSTILE_SECRET_KEY;
  process.env.CAPTCHA_SECRET_KEY = ' '; // Existing request route selects this truthy alias first.
  expect((await request(app).get('/api/v1/auth/methods')).body).toEqual(disabled);
  delete process.env.CAPTCHA_SECRET_KEY;
  expect((await request(app).get('/api/v1/auth/methods')).body).toEqual(enabled);
});

it('caller identities and roles cannot change discovery or gain access to protected or credential routes', async () => {
  Object.assign(process.env, configured);
  const network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected provider request'));
  for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo']) {
    const response = await request(app).get('/api/v1/auth/methods')
      .query({ role, email: 'synthetic-unknown@example.invalid', phone: '+639000000001' })
      .set('Authorization', 'Bearer synthetic-invalid-token').set('Cookie', 'admin_session=synthetic-invalid');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(enabled);
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  const requiresProof = await request(app).post('/api/v1/auth/email/requests').send({ email: 'fixture@example.invalid' });
  expect(requiresProof.status).toBe(428);
  expect(requiresProof.body.error.captchaRequired).toBe(true);
  delete process.env.EMAIL_SIGN_IN_ENABLED;
  expect((await request(app).post('/api/v1/auth/email/requests').send({ email: 'fixture@example.invalid' })).status).toBe(503);
  expect((await request(app).post('/api/v1/auth/methods').send({ role: 'admin' })).status).toBe(404);
  expect(db.query).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
