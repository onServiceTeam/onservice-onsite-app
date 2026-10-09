import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/auth.service', () => ({
  ...jest.requireActual('../src/services/auth.service'),
  sendOtp: jest.fn(),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(),
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/security.service', () => ({
  ...jest.requireActual('../src/services/security.service'),
  checkOtpLockout: jest.fn(),
  recordLoginAttempt: jest.fn(),
  logSecurityEvent: jest.fn(),
}));

import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { platformConfig } from '../src/config/platform.config';
import * as authService from '../src/services/auth.service';
import * as securityService from '../src/services/security.service';
import { sendOtpSms } from '../src/services/sms.service';
import { sessionIntegrationIt as integrationIt, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';
import { withCaptchaProvider } from './helpers/captcha-http';

// Actual Express route, Zod middleware, CAPTCHA verifier and error response.
// Policy/auditing and outbound Siteverify/SMS are fixture boundaries. The last
// guarded case also executes real OTP SQL/hash/consume/session issuance. This
// does not solve a challenge or send a live SMS.
const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRouter);
app.use(errorMiddleware);
const phone = '+639171234567';
const endpoint = '/api/v1/auth/send-otp';
const originalFetch = globalThis.fetch;
const originalSecret = process.env.CAPTCHA_SECRET_KEY;
const originalAlias = process.env.TURNSTILE_SECRET_KEY;
const fetchMock = jest.fn<typeof globalThis.fetch>();

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  expect(platformConfig.rateLimitsRelaxed).toBe(false);
  process.env.CAPTCHA_SECRET_KEY = 'synthetic-siteverify-secret';
  delete process.env.TURNSTILE_SECRET_KEY;
  globalThis.fetch = fetchMock;
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
  jest.mocked(securityService.checkOtpLockout).mockResolvedValue({ locked: false, captchaRequired: true });
  jest.mocked(securityService.recordLoginAttempt).mockResolvedValue(undefined);
  jest.mocked(securityService.logSecurityEvent).mockResolvedValue(undefined);
  jest.mocked(authService.sendOtp).mockResolvedValue({ message: 'Verification code sent.' });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.CAPTCHA_SECRET_KEY;
  else process.env.CAPTCHA_SECRET_KEY = originalSecret;
  if (originalAlias === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalAlias;
});

it('Bug SEC-080 — a solved CAPTCHA survives OTP validation and reaches server verification', async () => {
  const first = await request(app).post(endpoint).send({ phone });
  expect(first.status).toBe(428);
  expect(first.body.error.captchaRequired).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(authService.sendOtp).not.toHaveBeenCalled();

  const token = 'opaque-synthetic-siteverify-token';
  const response = await request(app).post(endpoint).send({ phone, captchaToken: token, deviceFingerprint: 'test-device-fingerprint' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, data: { message: 'Verification code sent.' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  expect(options?.method).toBe('POST');
  expect(options?.body).toBeInstanceOf(URLSearchParams);
  expect((options!.body as URLSearchParams).get('response')).toBe(token);
  expect((options!.body as URLSearchParams).get('secret')).toBe('synthetic-siteverify-secret');
  expect(authService.sendOtp).toHaveBeenCalledTimes(1);
  expect(authService.sendOtp).toHaveBeenCalledWith(phone);
  expect(securityService.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
    phone, success: true, attemptType: 'otp_send', deviceFingerprint: 'test-device-fingerprint',
  }));
});

it('rejects a failed or replayed provider validation without sending a code', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })));
  const response = await request(app).post(endpoint).send({ phone, captchaToken: 'replayed-token' });
  expect(response.status).toBe(403);
  expect(response.body.error.message).toBe('CAPTCHA verification failed.');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(authService.sendOtp).not.toHaveBeenCalled();
  expect(securityService.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'captcha_failed' }));
  expect(securityService.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});

it('keeps account lockout authoritative even when a token is supplied', async () => {
  jest.mocked(securityService.checkOtpLockout).mockResolvedValue({ locked: true, captchaRequired: true });
  const response = await request(app).post(endpoint).send({ phone, captchaToken: 'not-a-lockout-bypass' });
  expect(response.status).toBe(429);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(authService.sendOtp).not.toHaveBeenCalled();
});

it('fails closed when the server secret is missing', async () => {
  delete process.env.CAPTCHA_SECRET_KEY;
  const response = await request(app).post(endpoint).send({ phone, captchaToken: 'synthetic-token' });
  expect(response.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(authService.sendOtp).not.toHaveBeenCalled();
});

it('fails closed when Siteverify is unavailable', async () => {
  fetchMock.mockRejectedValue(new Error('Synthetic provider outage'));
  const response = await request(app).post(endpoint).send({ phone, captchaToken: 'synthetic-token' });
  expect(response.status).toBe(403);
  expect(authService.sendOtp).not.toHaveBeenCalled();
});

it('rejects malformed and oversized tokens before policy, provider or SMS work', async () => {
  for (const captchaToken of ['', null, 42, {}, ['token'], 'x'.repeat(2049)]) {
    const response = await request(app).post(endpoint).send({ phone, captchaToken });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'captchaToken' })]));
  }
  expect(securityService.checkOtpLockout).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(authService.sendOtp).not.toHaveBeenCalled();
});

it('accepts the documented maximum token length without changing its bytes', async () => {
  const token = 'x'.repeat(2048);
  const response = await request(app).post(endpoint).send({ phone, captchaToken: token });
  expect(response.status).toBe(200);
  expect((fetchMock.mock.calls[0]![1]!.body as URLSearchParams).get('response')).toBe(token);
});

it('preserves normal phone sign-in without a token below the CAPTCHA threshold', async () => {
  jest.mocked(securityService.checkOtpLockout).mockResolvedValue({ locked: false, captchaRequired: false });
  const response = await request(app).post(endpoint).send({ phone });
  expect(response.status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(authService.sendOtp).toHaveBeenCalledTimes(1);
});

it('rejects a real Siteverify error response before any phone-code delivery', async () => {
  await withCaptchaProvider(response => response.writeHead(503).end('{"success":true}'), async endpoint => {
    const response = await request(app).post('/api/v1/auth/send-otp').send({ phone, captchaToken: 'synthetic-token' });
    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('CAPTCHA verification failed.');
    expect(authService.sendOtp).not.toHaveBeenCalled();
    expect(sendOtpSms).not.toHaveBeenCalled();
    expect(securityService.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(endpoint.requests).toHaveLength(1);
  });
});

integrationIt('persists and consumes one hashed OTP after CAPTCHA acceptance through the actual login route', async () => {
  const priorBypass = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    await withSessionDatabase(async database => {
      const syntheticPhone = '+639170000000';
      await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
        is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()); DELETE FROM refresh_tokens;`);
      const actualAuth = jest.requireActual<typeof authService>('../src/services/auth.service');
      jest.mocked(authService.sendOtp).mockImplementation(actualAuth.sendOtp);
      expect((await request(app).post(endpoint).send({ phone: syntheticPhone })).status).toBe(428);
      expect((await database.query('SELECT * FROM otp_codes')).rows).toEqual([]);
      expect(sendOtpSms).not.toHaveBeenCalled();

      const sent = await request(app).post(endpoint).send({ phone: syntheticPhone, captchaToken: 'synthetic-challenge-result' });
      expect(sent.status).toBe(200);
      const rows = (await database.query('SELECT code,code_hash,is_used FROM otp_codes')).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ code: null, code_hash: expect.stringMatching(/^scrypt:/), is_used: false });
      expect(sendOtpSms).toHaveBeenCalledTimes(1);
      const code = jest.mocked(sendOtpSms).mock.calls[0]![1];
      const login = await request(app).post('/api/v1/auth/verify-otp').send({ phone: syntheticPhone, code });
      expect(login.status).toBe(200);
      expect(login.body.data.user).toEqual(expect.objectContaining({ id: sessionOwner, role: 'customer' }));
      expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
      expect((await database.query('SELECT user_id FROM refresh_tokens')).rows).toEqual([{ user_id: sessionOwner }]);
      const replay = await request(app).post('/api/v1/auth/verify-otp').send({ phone: syntheticPhone, code });
      expect(replay.status).toBe(400);
      expect((await database.query('SELECT user_id FROM refresh_tokens')).rows).toEqual([{ user_id: sessionOwner }]);
    });
  } finally {
    if (priorBypass === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = priorBypass;
  }
}, 30000);
