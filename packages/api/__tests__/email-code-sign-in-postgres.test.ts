import http, { type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Pool } from 'pg';
import express from 'express';
import request from 'supertest';

// D37 (Ken, 2026-10-11): email codes replace phone codes while SMS is paused.
// Real PostgreSQL (migration 180 on the focused session fixture), the real
// routes, services, SQL and token issuer. Only the outbound email provider
// (an owned loopback HTTP server), the per-IP request limiter and the MX
// lookup are substituted. Wrong-guess accounting uses a real login_attempts
// table with the production columns.

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const domainStatus = jest.fn<Promise<'accepts_mail' | 'no_mail' | 'unknown'>, [string]>();
jest.mock('../src/services/email-domain-check.service', () => ({
  checkDomainAcceptsMail: (domain: string) => domainStatus(domain),
}));

import emailCodeRouter from '../src/routes/email-code.routes';
import { authMiddleware, type AuthenticatedRequest } from '../src/middleware/auth.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { deriveEmailCode, recipientHash } from '../src/services/email-code-auth.service';
import jwt from 'jsonwebtoken';
import { sessionOwner, sessionIntegrationIt, withSessionDatabase } from './helpers/account-session-postgres';

const sqlIt = sessionIntegrationIt;
const existingEmail = 'synthetic-session@example.invalid';
const newEmail = 'New.Customer+home@example.invalid';
const app = express();
app.use(express.json());
app.use('/api/v1/auth/email-code', emailCodeRouter);
app.get('/owned-identity', authMiddleware, (req: AuthenticatedRequest, res) => res.json(req.user));
app.use(errorMiddleware);
const base = '/api/v1/auth/email-code';
const ask = (email: string) => request(app).post(`${base}/request`).send({ email, deviceFingerprint: 'synthetic-email-device' });
const verify = (email: string, code: string) => request(app).post(`${base}/verify`)
  .send({ email, code, deviceFingerprint: 'synthetic-email-device' });
const signup = (signupToken: string, extra: Record<string, unknown> = {}) => request(app).post(`${base}/complete-signup`)
  .send({ signupToken, firstName: 'Nova', lastName: 'Reyes', phone: '+639171234567', ...extra });

const envKeys = ['EMAIL_CODE_SIGN_IN_ENABLED', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_FROM_NAME'];
const originalEnv = { ...process.env };
const nativeFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  domainStatus.mockResolvedValue('accepts_mail');
  Object.assign(process.env, { EMAIL_CODE_SIGN_IN_ENABLED: '1', EMAIL_AUTH_DELIVERY_ENABLED: '1',
    RESEND_API_KEY: 're_synthetic_email_code_key', EMAIL_FROM: 'no-reply@example.invalid' });
  delete process.env.EMAIL_FROM_NAME;
});
afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});

type Sent = { idempotencyKey: string; payload: { from: string; to: string[]; subject: string; text: string; html: string } };
async function withProvider(run: (sent: Sent[]) => Promise<void>,
  respond?: (res: ServerResponse, sent: Sent) => void): Promise<void> {
  const sent: Sent[] = [];
  let counter = 0;
  const server = http.createServer((req, res) => {
    let body = ''; req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const row = { idempotencyKey: String(req.headers['idempotency-key']), payload: JSON.parse(body) };
      sent.push(row);
      if (respond) { respond(res, row); return; }
      counter += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(counter).padStart(12, '0')}` }));
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

async function withDatabase(run: (database: Pool) => Promise<void>, role = 'customer'): Promise<void> {
  await withSessionDatabase(async database => {
    await database.query(`
      ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';
      UPDATE users SET must_rotate_password = FALSE;
      CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id),
        action text, entity_type text, entity_id uuid, new_values jsonb);
      DROP TABLE login_attempts;
      CREATE TABLE login_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone varchar(320) NOT NULL,
        ip_address inet NOT NULL, attempt_type varchar(20) NOT NULL, success boolean NOT NULL DEFAULT FALSE,
        device_fingerprint varchar(128), user_agent text, locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW())`);
    await run(database);
  }, role);
}

function codeIn(row: Sent): string {
  const code = /\n\n(\d{6})\n\n/.exec(row.payload.text)?.[1];
  if (!code) throw new Error('No code paragraph in the email text');
  return code;
}
async function challenge(database: Pool): Promise<Record<string, unknown>> {
  return (await database.query(`SELECT id, state, sends, attempts,
      round(extract(epoch FROM (expires_at - created_at)) * 1000)::int AS window_ms, expires_at
    FROM email_code_challenges ORDER BY created_at DESC LIMIT 1`)).rows[0];
}
// Move the last send back so the 30-second resend pause has passed.
async function passResendPause(database: Pool): Promise<void> {
  await database.query(`UPDATE email_code_challenges SET last_sent_at = last_sent_at - INTERVAL '31 seconds'
    WHERE state = 'pending'`);
}
async function counts(database: Pool): Promise<Record<string, number>> {
  return (await database.query(`SELECT (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM refresh_tokens) AS sessions,
    (SELECT count(*)::int FROM email_code_challenges) AS codes`)).rows[0];
}

sqlIt('D37 - a code email is sent, the code is valid for exactly 300000 ms, and it stands out in the message', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const response = await ask(newEmail);
      expect(response.status).toBe(202);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body.data).toMatchObject({ resent: false, validForMs: 300000, resendInMs: 30000, delivery: 'accepted' });
      expect(response.body.data.expiresInMs).toBeGreaterThan(290000);
      expect(response.body.data.expiresInMs).toBeLessThanOrEqual(300000);

      const row = await challenge(database);
      expect(row).toMatchObject({ id: response.body.data.challengeId, state: 'pending', sends: 1, window_ms: 300000 });
      expect(sent).toHaveLength(1);
      const email = sent[0]!;
      expect(email.idempotencyKey).toBe(`onservice-email-code/${row.id}/1`);
      expect(email.payload.to).toEqual([newEmail]);
      expect(email.payload.from).toBe('onService PH <no-reply@example.invalid>');
      expect(email.payload.subject).toBe('Your onService PH sign-in code');
      const code = codeIn(email);
      expect(code).toBe(deriveEmailCode(String(row.id)));
      expect(email.payload.subject).not.toContain(code);
      // The code sits alone in a large bold block in the HTML part.
      expect(email.payload.html).toMatch(new RegExp(`font-size:40px;[^"]*font-weight:bold;[^"]*">${code}</div>`));
      expect(email.payload.text).toContain('5 minutes after it was requested');
    });
  });
}, 60000);

sqlIt('D37 - asking again inside the window re-sends the SAME code and never moves the expiry', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const first = await ask(newEmail);
      const before = await challenge(database);
      await passResendPause(database);
      const second = await ask(newEmail);
      expect(second.status).toBe(202);
      expect(second.body.data).toMatchObject({ resent: true, challengeId: first.body.data.challengeId });
      expect(second.body.data.expiresInMs).toBeLessThanOrEqual(first.body.data.expiresInMs);
      const after = await challenge(database);
      expect(after).toMatchObject({ id: before.id, sends: 2, window_ms: 300000 });
      expect((after.expires_at as Date).getTime()).toBe((before.expires_at as Date).getTime());
      expect(sent.map(row => row.idempotencyKey)).toEqual([
        `onservice-email-code/${before.id}/1`, `onservice-email-code/${before.id}/2`]);
      expect(codeIn(sent[1]!)).toBe(codeIn(sent[0]!));
      expect((await counts(database)).codes).toBe(1);
    });
  });
}, 60000);

sqlIt('D37 - a resend inside 30 seconds of the last send is refused and nothing is sent', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(newEmail);
      const again = await ask(newEmail);
      expect(again.status).toBe(429);
      expect(again.body.error.code).toBe('email_code_resend_too_soon');
      expect(again.body.error.retryAfterMs).toBeGreaterThan(0);
      expect(again.body.error.retryAfterMs).toBeLessThanOrEqual(30000);
      expect(sent).toHaveLength(1);
      expect(await challenge(database)).toMatchObject({ sends: 1 });
    });
  });
}, 60000);

sqlIt('D37 - after the window closes, asking again creates a new code with a new five-minute window', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const first = await ask(newEmail);
      await database.query(`UPDATE email_code_challenges SET created_at = clock_timestamp() - INTERVAL '300001 milliseconds',
        last_sent_at = clock_timestamp() - INTERVAL '300001 milliseconds', expires_at = clock_timestamp() - INTERVAL '1 millisecond'`);
      const second = await ask(newEmail);
      expect(second.status).toBe(202);
      expect(second.body.data.resent).toBe(false);
      expect(second.body.data.challengeId).not.toBe(first.body.data.challengeId);
      const states = (await database.query('SELECT id, state FROM email_code_challenges ORDER BY created_at')).rows;
      expect(states).toEqual([{ id: first.body.data.challengeId, state: 'expired' },
        { id: second.body.data.challengeId, state: 'pending' }]);
      expect(await challenge(database)).toMatchObject({ window_ms: 300000 });
      expect(codeIn(sent[1]!)).toBe(deriveEmailCode(second.body.data.challengeId));
    });
  });
}, 60000);

sqlIt('D37 - the right code is refused 1 ms after expiry and accepted before it (database clock)', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(existingEmail);
      const code = codeIn(sent[0]!);
      await database.query(`UPDATE email_code_challenges SET expires_at = clock_timestamp() - INTERVAL '1 millisecond',
        created_at = clock_timestamp() - INTERVAL '300001 milliseconds', last_sent_at = clock_timestamp() - INTERVAL '300001 milliseconds'`);
      const late = await verify(existingEmail, code);
      expect(late.status).toBe(400);
      expect(late.body.error.code).toBe('email_code_expired');
      expect(await challenge(database)).toMatchObject({ state: 'expired' });
      expect((await counts(database)).sessions).toBe(1);

      const fresh = await ask(existingEmail);
      const freshCode = codeIn(sent[1]!);
      await database.query(`UPDATE email_code_challenges SET expires_at = clock_timestamp() + INTERVAL '3 seconds'
        WHERE id = $1`, [fresh.body.data.challengeId]);
      const inTime = await verify(existingEmail, freshCode);
      expect(inTime.status).toBe(200);
      expect(inTime.body.data.status).toBe('signed_in');
    });
  });
}, 60000);

sqlIt('D37 - the right code signs in the existing account with this email in any letter case', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask('Synthetic-Session@EXAMPLE.invalid');
      const response = await verify('synthetic-session@example.invalid', codeIn(sent[0]!));
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ status: 'signed_in', isNewUser: false,
        user: { id: sessionOwner, email: existingEmail, role: 'customer' } });
      const identity = await request(app).get('/owned-identity').set('Authorization', `Bearer ${response.body.data.accessToken}`);
      expect(identity.status).toBe(200);
      expect(identity.body.userId).toBe(sessionOwner);
      const account = (await database.query('SELECT email_verified_at, last_login_at FROM users WHERE id = $1', [sessionOwner])).rows[0];
      expect(account.email_verified_at).not.toBeNull();
      expect(account.last_login_at).not.toBeNull();
      expect((await database.query("SELECT action FROM audit_log WHERE user_id = $1", [sessionOwner])).rows)
        .toEqual([{ action: 'email_code_sign_in' }]);
      expect(await challenge(database)).toMatchObject({ state: 'consumed' });
      expect((await counts(database)).sessions).toBe(2);
      // A used code cannot be used again.
      const replay = await verify(existingEmail, codeIn(sent[0]!));
      expect(replay.status).toBe(400);
      expect(replay.body.error.code).toBe('email_code_not_found');
    });
  });
}, 60000);

sqlIt('D37 - a new email creates no account until "create your account" gives a name and mobile number', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const before = await counts(database);
      await ask(newEmail);
      const checked = await verify(newEmail, codeIn(sent[0]!));
      expect(checked.status).toBe(200);
      expect(checked.body.data).toMatchObject({ status: 'needs_account', email: newEmail, signupExpiresInSeconds: 1800 });
      expect(checked.body.data.accessToken).toBeUndefined();
      expect((await counts(database)).users).toBe(before.users);

      // The sign-up token is not a session.
      const misuse = await request(app).get('/owned-identity').set('Authorization', `Bearer ${checked.body.data.signupToken}`);
      expect(misuse.status).toBe(401);

      const created = await signup(checked.body.data.signupToken);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ status: 'signed_in', isNewUser: true,
        user: { email: newEmail, phone: '+639171234567', firstName: 'Nova', lastName: 'Reyes', role: 'customer' } });
      const row = (await database.query(`SELECT role, is_verified, email_verified_at, phone_verified_at
        FROM users WHERE lower(email) = lower($1)`, [newEmail])).rows[0];
      expect(row.role).toBe('customer');
      expect(row.is_verified).toBe(true);
      expect(row.email_verified_at).not.toBeNull();
      // Typed during the SMS pause, never proven: phone sign-in must not open it later.
      expect(row.phone_verified_at).toBeNull();
      const identity = await request(app).get('/owned-identity').set('Authorization', `Bearer ${created.body.data.accessToken}`);
      expect(identity.status).toBe(200);

      // The same sign-up token cannot make a second account.
      const twice = await signup(checked.body.data.signupToken, { phone: '+639179999999' });
      expect(twice.status).toBe(409);
      expect(twice.body.error.code).toBe('email_already_registered');
      expect((await counts(database)).users).toBe(before.users + 1);
    });
  });
}, 60000);

sqlIt('D37 - sign-up refuses a mobile number that already belongs to another account', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const before = await counts(database);
      await ask(newEmail);
      const checked = await verify(newEmail, codeIn(sent[0]!));
      // The fixture owner already holds +639170000000.
      const taken = await signup(checked.body.data.signupToken, { phone: '+639170000000' });
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('phone_already_registered');
      expect((await counts(database)).users).toBe(before.users);
    });
  });
}, 60000);

sqlIt('D37 - wrong codes count down and the fifth wrong code kills the code', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(existingEmail);
      const right = codeIn(sent[0]!);
      const wrong = right === '000000' ? '111111' : '000000';
      for (const left of [4, 3, 2, 1]) {
        const response = await verify(existingEmail, wrong);
        expect(response.status).toBe(400);
        expect(response.body.error).toMatchObject({ code: 'email_code_incorrect', remainingAttempts: left });
      }
      const fifth = await verify(existingEmail, wrong);
      expect(fifth.status).toBe(429);
      expect(fifth.body.error.code).toBe('email_code_attempts_exhausted');
      expect(await challenge(database)).toMatchObject({ state: 'invalidated', attempts: 5 });
      const late = await verify(existingEmail, right);
      expect(late.status).toBe(400);
      expect(late.body.error.code).toBe('email_code_not_found');
      expect((await counts(database)).sessions).toBe(1);
    });
  });
}, 60000);

sqlIt('D37 - an admin-tier email is refused on the marketplace sign-in', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const before = await counts(database);
      await ask(existingEmail);
      const response = await verify(existingEmail, codeIn(sent[0]!));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('email_sign_in_not_allowed');
      expect((await counts(database)).sessions).toBe(before.sessions);
    });
  }, 'super_admin');
}, 60000);

sqlIt('D37 - a deactivated account is refused', async () => {
  await withDatabase(async database => {
    await database.query('UPDATE users SET is_active = FALSE WHERE id = $1', [sessionOwner]);
    await withProvider(async sent => {
      await ask(existingEmail);
      const response = await verify(existingEmail, codeIn(sent[0]!));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('account_deactivated');
      expect((await counts(database)).sessions).toBe(1);
    });
  });
}, 60000);

sqlIt('D37 - an address whose domain takes no mail is refused before anything is stored or sent', async () => {
  await withDatabase(async database => {
    domainStatus.mockResolvedValue('no_mail');
    await withProvider(async sent => {
      const response = await ask('someone@gmial.com');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('email_domain_cannot_receive');
      expect(domainStatus).toHaveBeenCalledWith('gmial.com');
      expect(sent).toHaveLength(0);
      expect((await counts(database)).codes).toBe(0);
    });
  });
}, 60000);

sqlIt('D37 - when the provider refuses the email, the person is told and may try again straight away', async () => {
  await withDatabase(async database => {
    let refuse = true;
    await withProvider(async sent => {
      const failed = await ask(newEmail);
      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe('email_code_not_sent');
      expect(await challenge(database)).toMatchObject({ state: 'invalidated' });
      refuse = false;
      const retry = await ask(newEmail);
      expect(retry.status).toBe(202);
      expect(retry.body.data.resent).toBe(false);
      expect(sent).toHaveLength(2);
    }, (res, row) => {
      if (refuse) { res.statusCode = 422; res.end('{}'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key: row.idempotencyKey }));
    });
  });
}, 60000);

sqlIt('D37 - one code is sent at most 5 times', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(newEmail);
      for (let send = 2; send <= 5; send += 1) {
        await passResendPause(database);
        expect((await ask(newEmail)).status).toBe(202);
      }
      await passResendPause(database);
      const sixth = await ask(newEmail);
      expect(sixth.status).toBe(429);
      expect(sixth.body.error).toMatchObject({ code: 'email_code_send_limit', codePending: true });
      expect(sent).toHaveLength(5);
      expect(new Set(sent.map(codeIn)).size).toBe(1);
    });
  });
}, 60000);

sqlIt('D37 - at most 5 new codes per email per hour', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      for (let round = 1; round <= 5; round += 1) {
        expect((await ask(newEmail)).status).toBe(202);
        await database.query(`UPDATE email_code_challenges SET state = 'expired', finished_at = clock_timestamp()
          WHERE state = 'pending'`);
      }
      const sixth = await ask(newEmail);
      expect(sixth.status).toBe(429);
      expect(sixth.body.error.code).toBe('email_code_hourly_limit');
      expect(sixth.body.error.retryAfterMs).toBeGreaterThan(0);
      expect(sent).toHaveLength(5);
    });
  });
}, 60000);

sqlIt('D37 - two requests at the same moment for one email make one code and one email', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const results = await Promise.all([ask(newEmail), ask(newEmail)]);
      expect(results.map(r => r.status).sort()).toEqual([202, 429]);
      expect((await counts(database)).codes).toBe(1);
      expect(sent).toHaveLength(1);
    });
  });
}, 60000);

sqlIt('D37 - email sign-in answers 503 and does nothing while switched off', async () => {
  await withDatabase(async database => {
    process.env.EMAIL_CODE_SIGN_IN_ENABLED = '0';
    await withProvider(async sent => {
      const response = await ask(newEmail);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('email_sign_in_unavailable');
      expect((await verify(newEmail, '123456')).status).toBe(503);
      expect(sent).toHaveLength(0);
      expect((await counts(database)).codes).toBe(0);
    });
  });
}, 60000);

sqlIt('D37 - only real wrong guesses are recorded, under a digest of the address, never the address', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      // No code yet: not a guess, nothing recorded.
      expect((await verify(newEmail, '123456')).body.error.code).toBe('email_code_not_found');
      await ask(newEmail);
      const right = codeIn(sent[0]!);
      expect((await verify(newEmail, right === '000000' ? '111111' : '000000')).status).toBe(400);
      const rows = (await database.query('SELECT phone, attempt_type, success FROM login_attempts')).rows;
      expect(rows).toEqual([{ phone: `email:${recipientHash(newEmail.toLowerCase())}`, attempt_type: 'otp_verify', success: false }]);
      expect(JSON.stringify(rows)).not.toContain('example.invalid');
      // A right code is not recorded as a failure either.
      expect((await verify(newEmail, right)).status).toBe(200);
      expect((await database.query('SELECT count(*)::int AS n FROM login_attempts')).rows).toEqual([{ n: 1 }]);
    });
  });
}, 60000);

sqlIt('D37 - wrong guesses by someone else never lock the owner out of their email', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(existingEmail);
      const right = codeIn(sent[0]!);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i += 1) await verify(existingEmail, wrong);
      // The attacker killed that code; the owner simply gets a new one and signs in.
      const fresh = await ask(existingEmail);
      expect(fresh.status).toBe(202);
      const signedIn = await verify(existingEmail, codeIn(sent[1]!));
      expect(signedIn.status).toBe(200);
      expect(signedIn.body.data.status).toBe('signed_in');
    });
  });
}, 60000);

sqlIt('D37 - a network with 30 wrong guesses this hour is paused from checking codes', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(newEmail);
      const right = codeIn(sent[0]!);
      await verify(newEmail, right === '000000' ? '111111' : '000000');
      const ip = (await database.query('SELECT host(ip_address) AS ip FROM login_attempts')).rows[0].ip;
      await database.query(`INSERT INTO login_attempts (phone, ip_address, attempt_type, success)
        SELECT 'email:' || md5(g::text) || md5(g::text), $1::inet, 'otp_verify', FALSE FROM generate_series(1, 29) g`, [ip]);
      const paused = await verify(newEmail, right);
      expect(paused.status).toBe(429);
      expect(paused.body.error.code).toBe('email_code_network_guess_limit');
      expect(paused.body.error.retryAfterMs).toBeGreaterThan(0);
      // Requests for codes are unaffected; only code checks pause.
      await passResendPause(database);
      expect((await ask(newEmail)).status).toBe(202);
    });
  });
}, 60000);

sqlIt('D37 - "already sent" answers carry the code\'s remaining time so the app can open the code screen', async () => {
  await withDatabase(async database => {
    await withProvider(async () => {
      await ask(newEmail);
      const again = await ask(newEmail);
      expect(again.status).toBe(429);
      expect(again.body.error).toMatchObject({ code: 'email_code_resend_too_soon', codePending: true });
      expect(again.body.error.expiresInMs).toBeGreaterThan(290000);
      expect(again.body.error.expiresInMs).toBeLessThanOrEqual(300000);
    });
  });
}, 60000);

sqlIt('D37 - codes the provider refused do not count toward the hourly limit', async () => {
  await withDatabase(async database => {
    let refuse = true;
    await withProvider(async sent => {
      for (let i = 0; i < 6; i += 1) {
        expect((await ask(newEmail)).body.error.code).toBe('email_code_not_sent');
      }
      refuse = false;
      expect((await ask(newEmail)).status).toBe(202);
      expect(sent).toHaveLength(7);
    }, (res, row) => {
      if (refuse) { res.statusCode = 422; res.end('{}'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key: row.idempotencyKey }));
    });
  });
}, 60000);

sqlIt('D37 - a refused resend is undone: the send count and the 30-second pause go back', async () => {
  await withDatabase(async database => {
    let refuse = false;
    await withProvider(async sent => {
      await ask(newEmail);
      await passResendPause(database);
      const before = (await database.query('SELECT sends, last_sent_at FROM email_code_challenges')).rows[0];
      refuse = true;
      expect((await ask(newEmail)).body.error.code).toBe('email_code_not_sent');
      expect((await database.query('SELECT sends, last_sent_at FROM email_code_challenges')).rows[0]).toEqual(before);
      refuse = false;
      const retry = await ask(newEmail);
      expect(retry.status).toBe(202);
      expect(retry.body.data.resent).toBe(true);
      expect(new Set(sent.map(row => /\n\n(\d{6})\n\n/.exec(row.payload.text)?.[1])).size).toBe(1);
    }, (res, row) => {
      if (refuse) { res.statusCode = 422; res.end('{}'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key: row.idempotencyKey }));
    });
  });
}, 60000);

sqlIt('D37 - the provider\'s own rate limit (429) is retried once with the same key', async () => {
  await withDatabase(async () => {
    let calls = 0;
    await withProvider(async sent => {
      const response = await ask(newEmail);
      expect(response.status).toBe(202);
      expect(response.body.data.delivery).toBe('accepted');
      expect(sent).toHaveLength(2);
      expect(sent[0]!.idempotencyKey).toBe(sent[1]!.idempotencyKey);
    }, res => {
      calls += 1;
      if (calls === 1) { res.statusCode = 429; res.end('{}'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
    });
  });
}, 60000);

sqlIt('D37 - when the provider does not confirm, the app is told the delivery is uncertain', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      const response = await ask(newEmail);
      expect(response.status).toBe(202);
      expect(response.body.data.delivery).toBe('unknown');
      // The code stays valid: it may still arrive.
      expect(await challenge(database)).toMatchObject({ state: 'pending', sends: 1 });
      expect(sent).toHaveLength(1);
    }, res => { res.statusCode = 500; res.end('{}'); });
  });
}, 60000);

sqlIt('D37 - a sign-up token is refused unless it comes from a code that was really used for that email', async () => {
  await withDatabase(async database => {
    await withProvider(async sent => {
      await ask(newEmail);
      const pendingId = (await challenge(database)).id as string;
      const forged = jwt.sign({ type: 'email_signup', email: newEmail, emailKey: newEmail.toLowerCase(), challengeId: pendingId },
        process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: 600 });
      const refused = await signup(forged);
      expect(refused.status).toBe(401);
      expect(refused.body.error.code).toBe('signup_session_expired');
      expect((await database.query('SELECT count(*)::int AS n FROM users WHERE lower(email) = lower($1)', [newEmail])).rows)
        .toEqual([{ n: 0 }]);
      expect(sent).toHaveLength(1);
    });
  });
}, 60000);
