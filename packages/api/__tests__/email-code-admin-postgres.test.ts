import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Pool } from 'pg';

// D37 (Ken, 2026-10-11): with ADMIN_SECOND_FACTOR=email the admin console's
// second step is a code sent to the admin's own email (same five-minute and
// same-code-resend rules) instead of the authenticator app. Real PostgreSQL,
// real admin routes, password check, token issuer and session cookies; the
// email provider is an owned loopback server and the security log is a spy.

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined), logSecurityEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/email-domain-check.service', () => ({ checkDomainAcceptsMail: jest.fn().mockResolvedValue('accepts_mail') }));

import authRouter from '../src/routes/auth.routes';
import emailCodeRouter from '../src/routes/email-code.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import * as securityService from '../src/services/security.service';
import {
  passwordIntegrationIt as it, passwordOwner, passwordEmail, oldPassword, originalHash, seedPasswordOwner, withPasswordDatabase,
} from './helpers/admin-password-postgres';

const app = express();
app.use(express.json()); app.use(cookieParser());
app.use('/auth/email-code', emailCodeRouter);
app.use('/auth', authRouter);
app.use(errorMiddleware);
const secret = 'synthetic-admin-email-code-secret';
const envKeys = ['JWT_SECRET', 'ADMIN_SECOND_FACTOR', 'ADMIN_DISABLE_2FA', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY', 'EMAIL_FROM',
  'EMAIL_CODE_SIGN_IN_ENABLED'];
const originalEnv = { ...process.env };
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, { JWT_SECRET: secret, ADMIN_SECOND_FACTOR: 'email', EMAIL_AUTH_DELIVERY_ENABLED: '1',
    RESEND_API_KEY: 're_synthetic_admin_code_key', EMAIL_FROM: 'no-reply@example.invalid' });
  delete process.env.ADMIN_DISABLE_2FA;
});
afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});

type Sent = { key: string; payload: { to: string[]; subject: string; text: string } };
async function withProvider(run: (sent: Sent[]) => Promise<void>): Promise<void> {
  const sent: Sent[] = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      sent.push({ key: String(req.headers['idempotency-key']), payload: JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: `cccccccc-cccc-4ccc-8ccc-${String(sent.length).padStart(12, '0')}` }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string') throw new Error('Missing owned provider fixture');
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (input !== 'https://api.resend.com/emails') throw new Error('Unexpected external destination');
    return nativeFetch(`http://127.0.0.1:${bound.port}/`, init);
  });
  try { await run(sent); }
  finally {
    fetchSpy.mockRestore(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
async function withAdmin(run: (database: Pool) => Promise<void>, role = 'admin'): Promise<void> {
  await withPasswordDatabase(async database => {
    await database.query(fs.readFileSync(path.resolve(__dirname, '../migrations/180_email_code_sign_in.sql'), 'utf8'));
    await seedPasswordOwner(database, originalHash(), role);
    await run(database);
  });
}
const login = () => request(app).post('/auth/admin/login').send({ email: passwordEmail, password: oldPassword });
const verify = (preAuthToken: string, code: string) => request(app).post('/auth/admin/email-code/verify').send({ preAuthToken, code });
const resend = (preAuthToken: string) => request(app).post('/auth/admin/email-code/resend').send({ preAuthToken });
const codeIn = (row: Sent): string => /\n\n(\d{6})\n\n/.exec(row.payload.text)![1]!;

it('D37 - admin sign-in: password, then the code emailed to the admin, then the session cookies', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    await withAdmin(async database => {
      await withProvider(async sent => {
        const first = await login();
        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ requiresEmailCode: true, emailHint: expect.any(String), resendInMs: 30000,
          user: { id: passwordOwner, role } });
        expect(first.body.data.emailHint).not.toBe(passwordEmail);
        expect(first.body.data.expiresInMs).toBeGreaterThan(290000);
        expect(first.body.data).not.toHaveProperty('requires2FA');
        expect(first.headers['set-cookie']).toBeUndefined();
        expect(jwt.verify(first.body.data.preAuthToken, secret)).toMatchObject({ userId: passwordOwner, role, type: 'pre_auth_email' });
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload).toMatchObject({ to: [passwordEmail], subject: 'Your onService PH admin sign-in code' });
        expect((await database.query(`SELECT purpose, user_id, session_version FROM email_code_challenges`)).rows)
          .toEqual([{ purpose: 'admin_sign_in', user_id: passwordOwner, session_version: 1 }]);

        const done = await verify(first.body.data.preAuthToken, codeIn(sent[0]!));
        expect(done.status).toBe(200);
        expect(done.body.data).toMatchObject({ user: { id: passwordOwner, role }, mustRotatePassword: true });
        expect(done.body.data).not.toHaveProperty('accessToken');
        const cookies = ([] as string[]).concat(done.headers['set-cookie'] as unknown as string[]);
        expect(cookies).toEqual(expect.arrayContaining([
          expect.stringMatching(/^admin_session=.*; HttpOnly/), expect.stringMatching(/^admin_refresh=.*; HttpOnly/),
          expect.stringMatching(/^admin_csrf=/)]));
        expect((await database.query('SELECT count(*)::int AS n FROM refresh_tokens')).rows).toEqual([{ n: 1 }]);
        expect(securityService.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
          eventType: 'admin_login_2fa_verified', metadata: { verificationMethod: 'email_code' } }));
        expect(securityService.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
          phone: passwordEmail, attemptType: 'admin_login', success: true }));
      });
    }, role);
  }
}, 60000);

it('D37 - a wrong admin code is counted against the account and gives no session', async () => {
  await withAdmin(async database => {
    await withProvider(async sent => {
      const first = await login();
      const right = codeIn(sent[0]!);
      const wrong = await verify(first.body.data.preAuthToken, right === '000000' ? '111111' : '000000');
      expect(wrong.status).toBe(400);
      expect(wrong.body.error).toMatchObject({ code: 'email_code_incorrect', remainingAttempts: 4 });
      expect(securityService.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
        phone: passwordEmail, attemptType: 'admin_login', success: false }));
      expect(securityService.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'admin_2fa_failed', metadata: { reason: 'invalid_email_code' } }));
      expect(wrong.headers['set-cookie']).toBeUndefined();
      expect((await database.query('SELECT count(*)::int AS n FROM refresh_tokens')).rows).toEqual([{ n: 0 }]);
    });
  });
}, 60000);

it('D37 - the admin resend sends the same code inside the window and a new one after it', async () => {
  await withAdmin(async database => {
    await withProvider(async sent => {
      const first = await login();
      await database.query(`UPDATE email_code_challenges SET last_sent_at = last_sent_at - INTERVAL '31 seconds'`);
      const again = await resend(first.body.data.preAuthToken);
      expect(again.status).toBe(200);
      expect(again.body.data.resent).toBe(true);
      expect(codeIn(sent[1]!)).toBe(codeIn(sent[0]!));

      await database.query(`UPDATE email_code_challenges SET created_at = clock_timestamp() - INTERVAL '300001 milliseconds',
        last_sent_at = clock_timestamp() - INTERVAL '300001 milliseconds', expires_at = clock_timestamp() - INTERVAL '1 millisecond'`);
      const expired = await verify(first.body.data.preAuthToken, codeIn(sent[0]!));
      expect(expired.status).toBe(400);
      expect(expired.body.error.code).toBe('email_code_expired');
      const fresh = await resend(first.body.data.preAuthToken);
      expect(fresh.status).toBe(200);
      expect(fresh.body.data.resent).toBe(false);
      const done = await verify(first.body.data.preAuthToken, codeIn(sent[2]!));
      expect(done.status).toBe(200);
    });
  });
}, 60000);

it('D37 - the email step refuses other token types and a revoked account generation', async () => {
  await withAdmin(async database => {
    await withProvider(async sent => {
      const first = await login();
      const totpToken = jwt.sign({ userId: passwordOwner, role: 'admin', sessionVersion: 1, type: 'pre_auth_2fa' }, secret,
        { algorithm: 'HS256', expiresIn: 300 });
      expect((await verify(totpToken, codeIn(sent[0]!))).status).toBe(401);
      await database.query('UPDATE users SET session_version = 2 WHERE id = $1', [passwordOwner]);
      const revoked = await verify(first.body.data.preAuthToken, codeIn(sent[0]!));
      expect(revoked.status).toBe(401);
      expect((await database.query('SELECT count(*)::int AS n FROM refresh_tokens')).rows).toEqual([{ n: 0 }]);
    });
  });
}, 60000);

it('D37 - without the switch, or without a configured sender, the authenticator step stays in force', async () => {
  for (const change of [() => { delete process.env.ADMIN_SECOND_FACTOR; }, () => { delete process.env.RESEND_API_KEY; }]) {
    change();
    await withAdmin(async () => {
      await withProvider(async sent => {
        const response = await login();
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ requires2FA: true });
        expect(response.body.data).not.toHaveProperty('requiresEmailCode');
        expect(sent).toHaveLength(0);
      });
    });
    Object.assign(process.env, { ADMIN_SECOND_FACTOR: 'email', RESEND_API_KEY: 're_synthetic_admin_code_key' });
  }
}, 60000);

// ---- review fixes (2026-10-12) ---------------------------------------------

it('D37 - the authenticator is offered as the other way in when the admin has one', async () => {
  await withAdmin(async () => {
    await withProvider(async () => {
      const first = await login();
      expect(first.body.data.requiresEmailCode).toBe(true);
      // The fixture admin has an authenticator set up (totp_enabled TRUE).
      expect(jwt.verify(first.body.data.totpPreAuthToken, secret)).toMatchObject({ userId: passwordOwner, type: 'pre_auth_2fa' });
    });
  });
}, 60000);

it('D37 - when the email cannot be sent, admin sign-in falls back to the authenticator step', async () => {
  await withAdmin(async () => {
    const sent: string[] = [];
    const server = http.createServer((req, res) => { sent.push(String(req.headers['idempotency-key'])); res.statusCode = 422; res.end('{}'); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const bound = server.address() as { port: number };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input !== 'https://api.resend.com/emails') throw new Error('Unexpected external destination');
      return nativeFetch(`http://127.0.0.1:${bound.port}/`, init);
    });
    try {
      const response = await login();
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ requires2FA: true });
      expect(response.body.data).not.toHaveProperty('requiresEmailCode');
      expect(sent).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}, 60000);

it('D37 - signing in again moments later continues with the code already sent', async () => {
  await withAdmin(async () => {
    await withProvider(async sent => {
      const first = await login();
      const second = await login();
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ requiresEmailCode: true, codeAlreadySent: true });
      expect(second.body.data.resendInMs).toBeGreaterThan(0);
      expect(sent).toHaveLength(1);
      const done = await verify(second.body.data.preAuthToken, codeIn(sent[0]!));
      expect(done.status).toBe(200);
      expect(first.body.data.preAuthToken).not.toBe('');
    });
  });
}, 60000);

it('D37 - after switching back to the authenticator, a pending emailed code no longer works', async () => {
  await withAdmin(async database => {
    await withProvider(async sent => {
      const first = await login();
      process.env.ADMIN_SECOND_FACTOR = 'totp';
      const refused = await verify(first.body.data.preAuthToken, codeIn(sent[0]!));
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('admin_email_code_disabled');
      expect((await database.query('SELECT count(*)::int AS n FROM refresh_tokens')).rows).toEqual([{ n: 0 }]);
    });
  });
}, 60000);

it('D37 - customer-side code requests for an admin address cannot use up the admin allowance', async () => {
  process.env.EMAIL_CODE_SIGN_IN_ENABLED = '1';
  await withAdmin(async database => {
    await withProvider(async () => {
      for (let i = 0; i < 6; i += 1) {
        await request(app).post('/auth/email-code/request').send({ email: passwordEmail });
        await database.query(`UPDATE email_code_challenges SET state = 'expired', finished_at = clock_timestamp()
          WHERE state = 'pending'`);
      }
      const response = await login();
      expect(response.status).toBe(200);
      expect(response.body.data.requiresEmailCode).toBe(true);
      expect(response.body.data.codeAlreadySent).toBe(false);
    });
  });
}, 60000);
