import http, { type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { Socket } from 'node:net';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import emailRouter from '../src/routes/email-sign-in.routes';
import { authMiddleware, type AuthenticatedRequest } from '../src/middleware/auth.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { db } from '../src/models/db';
import { logger } from '../src/utils/logger';
import * as emailService from '../src/services/email-sign-in.service';
import { gatherUserData } from '../src/services/data-management.service';
import { sessionOwner, sessionSecret, sessionHash, withSessionDatabase } from './helpers/account-session-postgres';
import { deferred, within } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';

const originalEnv = { ...process.env };
const envKeys = ['EMAIL_SIGN_IN_ENABLED', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY', 'EMAIL_FROM',
  'NODE_ENV', 'TURNSTILE_SECRET_KEY', 'CAPTCHA_SECRET_KEY'];
const address = 'Verified.Owner+services@example.invalid';
const nativeFetch = globalThis.fetch;
const app = express();
app.use(express.json()); app.use(cookieParser());
app.use('/api/v1/auth/email', emailRouter);
app.get('/owned-identity', authMiddleware, (req: AuthenticatedRequest, res) => res.json(req.user));
app.use(errorMiddleware);
const base = '/api/v1/auth/email';
const start = (email = address, extra: Record<string, unknown> = {}) => request(app).post(`${base}/requests`)
  .send({ email, captchaToken: 'synthetic-captcha', ...extra });
const confirm = (id: string, code: string, extra: Record<string, unknown> = {}) => request(app).post(`${base}/${id}/confirm`)
  .send({ code, deviceFingerprint: 'synthetic-email-device', ...extra });
let work: jest.SpyInstance<ReturnType<typeof emailService.requestEmailSignIn>, Parameters<typeof emailService.requestEmailSignIn>>;
const settle = async (): Promise<void> => { await Promise.allSettled(work.mock.results.map(result => result.value)); };

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const url = new URL(databaseUrl);
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_]+_test$/.test(url.pathname);
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) throw new Error('Email sign-in HTTP requires isolated loopback *_test PostgreSQL in CI.');
const sqlIt = safeDatabase ? it : it.skip;

async function withDatabase(run: (database: Pool) => Promise<void>, role = 'customer'): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe email sign-in HTTP test database.');
  const verifier = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const connection = await verifier.connect();
    try {
      const socket = connection.connection.stream, url = new URL(databaseUrl!);
      const actual = await connection.query('SELECT current_database() AS name');
      if (!(socket instanceof Socket) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress ?? '')
          || socket.remotePort !== Number(url.port || '5432') || actual.rows[0].name !== url.pathname.slice(1)) {
        throw new Error('Email sign-in HTTP test database identity mismatch.');
      }
    } finally { connection.release(); }
  } finally { await verifier.end(); }
  await withSessionDatabase(async database => {
    await database.query(`UPDATE users SET must_rotate_password=FALSE;
      CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),
        action text,entity_type text,entity_id uuid,new_values jsonb)`);
    try { await run(database); } finally { await settle(); }
  }, role);
}
async function seedIdentity(database: Pool): Promise<void> {
  await database.query(`INSERT INTO sign_in_email_identities (user_id,email,email_key,proof_id)
    VALUES ($1,$2,lower($2),$3)`, [sessionOwner, address, crypto.randomUUID()]);
}
async function ageRequests(database: Pool): Promise<void> {
  await database.query(`UPDATE email_sign_in_challenges SET created_at=clock_timestamp()-INTERVAL '2 minutes',
    expires_at=clock_timestamp()+INTERVAL '3 minutes'`);
}
async function counts(database: Pool): Promise<unknown> {
  return (await database.query(`SELECT (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM refresh_tokens) AS sessions,(SELECT count(*)::int FROM audit_log) AS audits`)).rows[0];
}
function assertReceipt(response: request.Response): string {
  expect(response.status).toBe(202);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.body).toEqual({ success: true, data: { id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    status: 'received', retryAfterSeconds: 60,
    message: 'Check your email for a sign-in code. If it does not arrive, wait one minute before trying again or use phone sign-in.' } });
  return response.body.data.id;
}

type Sent = { channel: 'captcha' | 'email'; body: string; idempotencyKey?: string };
function accepted(channel: Sent['channel'], res: ServerResponse): void {
  res.end(JSON.stringify(channel === 'captcha' ? { success: true } : { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
}
async function withDelivery(run: (sent: Sent[]) => Promise<void>,
  respond?: (channel: Sent['channel'], res: ServerResponse, body: string) => void): Promise<void> {
  const sent: Sent[] = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const channel = req.url!.slice(1) as Sent['channel'];
      sent.push({ channel, body, idempotencyKey: req.headers['idempotency-key'] as string | undefined });
      if (respond) respond(channel, res, body); else accepted(channel, res);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string') throw new Error('Missing owned email-provider fixture');
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const channel = input === 'https://api.resend.com/emails' ? 'email'
      : input === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' ? 'captcha' : null;
    if (!channel) throw new Error('Unexpected external email sign-in destination');
    return nativeFetch(`http://127.0.0.1:${bound.port}/${channel}`, init);
  });
  try { await run(sent); }
  finally {
    await settle(); fetchSpy.mockRestore(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
function deliveredCode(sent: Sent[], id: string): string {
  const message = sent.find(row => row.idempotencyKey === `onservice-email-code/${id}`)!;
  const payload = JSON.parse(message.body);
  expect(payload.to).toEqual([address]);
  expect(payload.subject).toBe('Your onService sign-in code');
  const code = /\n\n(\d{6})\n\n/.exec(payload.text)?.[1];
  expect(code).toMatch(/^\d{6}$/); return code!;
}
beforeEach(() => {
  jest.clearAllMocks(); work = jest.spyOn(emailService, 'requestEmailSignIn');
  Object.assign(process.env, { EMAIL_SIGN_IN_ENABLED: '1', EMAIL_AUTH_DELIVERY_ENABLED: '1',
    RESEND_API_KEY: 're_synthetic_signin_delivery_key', EMAIL_FROM: 'signin@example.invalid',
    TURNSTILE_SECRET_KEY: 'synthetic-captcha-key' });
  delete process.env.CAPTCHA_SECRET_KEY;
});
afterEach(async () => {
  await settle(); work.mockRestore();
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});

it('public email request receipt is sent before account-dependent work and never exposes its later failure', async () => {
  const hold = deferred();
  work.mockImplementation(async () => { await hold.promise; throw new Error('synthetic-private-SQL-code-and-email'); });
  await withDelivery(async sent => {
    try {
      const response = await within(start().then(value => value), 'neutral receipt before private work');
      const id = assertReceipt(response);
      expect(work).toHaveBeenCalledWith(address, expect.any(String), id);
      expect(sent.map(row => row.channel)).toEqual(['captcha']);
    } finally { hold.resolve(); }
  });
  expect(logger.warn).toHaveBeenCalledWith('Email sign-in request processing did not complete');
  expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('synthetic-private');
});

it('email feature, sender, CAPTCHA and strict-input guards run before account lookup or any credential delivery', async () => {
  const transaction = jest.spyOn(db, 'transaction'), fetchSpy = jest.spyOn(globalThis, 'fetch');
  try {
    process.env.EMAIL_SIGN_IN_ENABLED = '0'; expect((await start()).status).toBe(503);
    expect((await confirm(crypto.randomUUID(), '123456')).status).toBe(503);
    process.env.EMAIL_SIGN_IN_ENABLED = '1'; delete process.env.RESEND_API_KEY;
    expect((await start()).status).toBe(503);
    process.env.RESEND_API_KEY = 're_synthetic_signin_delivery_key';
    expect((await request(app).post(`${base}/requests`).send({ email: address })).status).toBe(428);
    delete process.env.TURNSTILE_SECRET_KEY; expect((await start()).status).toBe(503);
    for (const extra of [{ id: crypto.randomUUID() }, { role: 'admin' }, { captchaToken: 'x'.repeat(2049) }]) {
      expect((await start(address, extra)).status).toBe(400);
    }
    expect((await start('not-an-email')).status).toBe(400);
    expect((await confirm('not-a-uuid', '123456')).status).toBe(400);
    expect((await confirm(crypto.randomUUID(), '12345')).status).toBe(400);
    expect((await confirm(crypto.randomUUID(), '123456', { userId: sessionOwner })).status).toBe(400);
    expect(work).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); fetchSpy.mockRestore(); }
});

it('failed CAPTCHA cannot start email sign-in even when the client submits an administrator cookie', async () => {
  await withDelivery(async sent => {
    const response = await request(app).post(`${base}/requests`).set('Cookie', 'admin_session=synthetic-cookie')
      .send({ email: address, captchaToken: 'synthetic-captcha' });
    expect(response.status).toBe(403); expect(response.headers['cache-control']).toBe('private, no-store');
    expect(work).not.toHaveBeenCalled(); expect(sent.map(row => row.channel)).toEqual(['captcha']);
  }, (_channel, res) => res.end(JSON.stringify({ success: false })));
});

it('a real CAPTCHA error response cannot acknowledge or prepare an email sign-in request', async () => {
  const transaction = jest.spyOn(db, 'transaction');
  try {
    await withDelivery(async sent => {
      const response = await start();
      expect(response.status).toBe(403);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(work).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect(sent.map(row => row.channel)).toEqual(['captcha']);
    }, (_channel, res) => res.writeHead(503).end('{"success":true}'));
  } finally { transaction.mockRestore(); }
});

for (const role of ['customer', 'provider', 'provider_staff']) {
  sqlIt(`mounted ${role} email sign-in delivers to the verified identity and commits one usable canonical session`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      await seedIdentity(database);
      const response = await start(address.toUpperCase()), id = assertReceipt(response); await settle();
      const code = deliveredCode(sent, id);
      const loggedIn = await confirm(id, code);
      expect(loggedIn.status).toBe(200); expect(loggedIn.headers['cache-control']).toBe('private, no-store');
      expect(loggedIn.headers['set-cookie']).toBeUndefined();
      expect(loggedIn.body.data).toMatchObject({ isNewUser: false, user: { id: sessionOwner, role } });
      const { accessToken, refreshToken } = loggedIn.body.data;
      expect(jwt.verify(refreshToken, sessionSecret)).toMatchObject({ userId: sessionOwner, role, type: 'refresh', sessionVersion: 1 });
      expect((await request(app).get('/owned-identity').auth(accessToken, { type: 'bearer' })).body).toMatchObject({ userId: sessionOwner, role });
      expect((await request(app).get('/owned-identity').auth(refreshToken, { type: 'bearer' })).status).toBe(401);
      expect((await database.query('SELECT device_fingerprint,created_ip FROM refresh_tokens WHERE token_hash=$1', [sessionHash(refreshToken)])).rows[0])
        .toEqual({ device_fingerprint: 'synthetic-email-device', created_ip: expect.any(String) });
      expect((await database.query('SELECT state,code_hash,delivery_state FROM email_sign_in_challenges WHERE id=$1', [id])).rows)
        .toEqual([{ state: 'consumed', code_hash: null, delivery_state: 'accepted' }]);
      expect((await confirm(id, code)).status).toBe(400);
      expect(await counts(database)).toEqual({ users: 1, sessions: 2, audits: 1 });
      await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
      expect((await request(app).get('/owned-identity').auth(accessToken, { type: 'bearer' })).status).toBe(401);
      expect(sent.map(row => row.channel)).toEqual(['captcha', 'email']);
      const serialized = JSON.stringify([response.body, (logger.warn as jest.Mock).mock.calls]);
      for (const secret of [code, address, accessToken, refreshToken, 'code_hash']) expect(serialized).not.toContain(JSON.stringify(secret));
    }), role);
  }, 15000);
}

for (const role of ['admin', 'super_admin', 'dpo']) {
  sqlIt(`mounted email sign-in never replaces ${role} password and second-factor authority`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      await seedIdentity(database);
      const before = (await database.query('SELECT * FROM users')).rows;
      const id = assertReceipt(await start()); await settle();
      expect(sent.map(row => row.channel)).toEqual(['captcha']);
      expect((await database.query('SELECT user_id,delivery_state FROM email_sign_in_challenges WHERE id=$1', [id])).rows)
        .toEqual([{ user_id: null, delivery_state: 'not_started' }]);
      expect((await confirm(id, '123456')).status).toBe(400);
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
    }), role);
  }, 15000);
}

sqlIt('unknown and contact-only email requests return the same receipt and no delivery or new account', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    for (const email of ['unknown@example.invalid', 'synthetic-session@example.invalid']) {
      const id = assertReceipt(await start(email)); await settle();
      expect((await confirm(id, '123456')).status).toBe(400);
    }
    expect(sent.map(row => row.channel)).toEqual(['captcha', 'captcha']);
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
    expect((await database.query('SELECT count(*)::int AS count FROM sign_in_email_identities')).rows[0].count).toBe(0);
  }));
}, 15000);

for (const outcome of ['rejected', 'unknown'] as const) {
  sqlIt(`provider ${outcome} email delivery is private and does not cause response differences or automatic retry`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      await seedIdentity(database);
      const first = assertReceipt(await start()); await settle();
      const second = assertReceipt(await start()); await settle();
      expect(second).not.toBe(first);
      expect((await database.query('SELECT delivery_state FROM email_sign_in_challenges')).rows).toEqual([{ delivery_state: outcome }]);
      expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
      expect((await confirm(second, deliveredCode(sent, first))).status).toBe(400);
    }, (channel, res) => channel === 'captcha' ? accepted(channel, res)
      : outcome === 'rejected' ? res.writeHead(422).end('synthetic-private-provider-body') : res.destroy()));
  }, 15000);
}

sqlIt('a blocked account row cannot delay the public receipt or send a code after committed deactivation', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await seedIdentity(database);
    const blocker = await database.connect();
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
      const id = assertReceipt(await within(start().then(value => value), 'receipt before real account lock'));
      await waitForBlockedApproval(database, pid);
      await blocker.query('UPDATE users SET is_active=FALSE WHERE id=$1', [sessionOwner]); await blocker.query('COMMIT');
      await settle();
      expect(sent.map(row => row.channel)).toEqual(['captcha']);
      expect((await confirm(id, '123456')).status).toBe(400);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await settle(); }
  }));
}, 15000);

sqlIt('delayed provider acceptance does not delay request receipt or bypass revocation and never reopens a terminal proof', async () => {
  await withDatabase(async database => {
    const entered = deferred(); let held: ServerResponse | undefined;
    await withDelivery(async sent => {
      await seedIdentity(database);
      const id = assertReceipt(await start());
      try {
        await within(entered.promise, 'owned email provider arrival');
        expect((await database.query('SELECT delivery_state FROM email_sign_in_challenges WHERE id=$1', [id])).rows[0].delivery_state).toBe('attempting');
        await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
        const code = deliveredCode(sent, id);
        expect((await confirm(id, code)).status).toBe(400);
        accepted('email', held!); await settle();
        expect((await database.query('SELECT state,code_hash,delivery_state FROM email_sign_in_challenges WHERE id=$1', [id])).rows)
          .toEqual([{ state: 'invalidated', code_hash: null, delivery_state: 'accepted' }]);
        expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
        expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
      } finally { held?.end(); }
    }, (channel, res) => { if (channel === 'email') { held = res; entered.resolve(); } else accepted(channel, res); });
  });
}, 15000);

for (const failure of ['throw', 'suppress'] as const) {
  sqlIt(`actual ${failure} delivery-claim failure prevents a send while retaining the same neutral public receipt`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      await seedIdentity(database);
      await database.query(`CREATE FUNCTION reject_email_claim() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.delivery_state='attempting' THEN ${failure === 'throw' ? "RAISE EXCEPTION 'Synthetic claim failure'" : 'RETURN NULL'}; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER reject_email_claim BEFORE UPDATE ON email_sign_in_challenges FOR EACH ROW EXECUTE FUNCTION reject_email_claim()`);
      assertReceipt(await start()); await settle();
      expect((await database.query('SELECT delivery_state FROM email_sign_in_challenges')).rows).toEqual([{ delivery_state: 'not_started' }]);
      expect(sent.map(row => row.channel)).toEqual(['captcha']);
      await database.query('DROP TRIGGER reject_email_claim ON email_sign_in_challenges');
      assertReceipt(await start()); await settle(); // hard cooldown is private and still enforced
      expect(sent.filter(row => row.channel === 'email')).toHaveLength(0);
      await ageRequests(database);
      const fresh = assertReceipt(await start()); await settle();
      expect((await confirm(fresh, deliveredCode(sent, fresh))).status).toBe(200);
      expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
    }));
  }, 15000);
  sqlIt(`actual ${failure} receipt-write failure preserves uncertainty and permits proof completion without a second send`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      await seedIdentity(database);
      await database.query(`CREATE FUNCTION reject_email_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.delivery_finished_at IS NOT NULL THEN ${failure === 'throw' ? "RAISE EXCEPTION 'Synthetic receipt failure'" : 'RETURN NULL'}; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER reject_email_receipt BEFORE UPDATE ON email_sign_in_challenges FOR EACH ROW EXECUTE FUNCTION reject_email_receipt()`);
      const id = assertReceipt(await start()); await settle();
      expect((await database.query('SELECT delivery_state FROM email_sign_in_challenges')).rows).toEqual([{ delivery_state: 'attempting' }]);
      expect((await confirm(id, deliveredCode(sent, id))).status).toBe(200);
      expect(await counts(database)).toEqual({ users: 1, sessions: 2, audits: 1 });
      assertReceipt(await start()); await settle();
      expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
    }));
  }, 15000);
}

sqlIt('concurrent public starts preserve hard recipient and IP limits while returning equally shaped request receipts', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await seedIdentity(database);
    const responses = await Promise.all([start(), start(address.toUpperCase())]);
    const ids = responses.map(assertReceipt); expect(new Set(ids).size).toBe(2); await settle();
    expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
    const id = (await database.query('SELECT id FROM email_sign_in_challenges')).rows[0].id;
    expect(ids).toContain(id);
    expect((await confirm(id, deliveredCode(sent, id))).status).toBe(200);
    for (let n = 0; n < 4; n++) { assertReceipt(await start(`unknown-${n}@example.invalid`)); await settle(); }
    const capped = assertReceipt(await start('capped@example.invalid')); await settle();
    expect((await database.query('SELECT count(*)::int AS count FROM email_sign_in_challenges')).rows[0].count).toBe(5);
    expect((await database.query('SELECT id FROM email_sign_in_challenges WHERE id=$1', [capped])).rowCount).toBe(0);
    expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
  }));
}, 15000);

sqlIt('mounted confirmation enforces attempts and expiry and remains usable when the sender later becomes unavailable', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await seedIdentity(database);
    const first = assertReceipt(await start()); await settle();
    const code = deliveredCode(sent, first), wrong = code === '999999' ? '999998' : '999999';
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await confirm(first, wrong)).status).toBe(400);
      expect((await database.query('SELECT attempts FROM email_sign_in_challenges WHERE id=$1', [first])).rows[0].attempts).toBe(attempt);
    }
    expect((await confirm(first, code)).status).toBe(400);
    await ageRequests(database);
    const second = assertReceipt(await start()); await settle();
    await database.query(`UPDATE email_sign_in_challenges SET created_at=clock_timestamp()-INTERVAL '10 minutes',
      expires_at=clock_timestamp()-INTERVAL '5 minutes' WHERE id=$1`, [second]);
    expect((await confirm(second, deliveredCode(sent, second))).status).toBe(400);
    const third = assertReceipt(await start()); await settle(); delete process.env.RESEND_API_KEY;
    expect((await confirm(third, deliveredCode(sent, third))).status).toBe(200);
    expect(await counts(database)).toEqual({ users: 1, sessions: 2, audits: 1 });
  }));
}, 15000);

sqlIt('a real session-insert failure returns no credentials and the same delivered code succeeds after rollback', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await seedIdentity(database);
    const id = assertReceipt(await start()); await settle();
    const code = deliveredCode(sent, id);
    await database.query(`CREATE FUNCTION reject_email_session() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic private session failure'; END; $$;
      CREATE TRIGGER reject_email_session BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION reject_email_session()`);
    const failed = await confirm(id, code);
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ success: false, error: {
      message: 'Sign-in is temporarily unavailable. Please try again.', statusCode: 503 } });
    expect(failed.headers['cache-control']).toBe('private, no-store');
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
    expect((await database.query('SELECT state,attempts FROM email_sign_in_challenges WHERE id=$1', [id])).rows)
      .toEqual([{ state: 'pending', attempts: 0 }]);
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('Synthetic private session failure');
    await database.query('DROP TRIGGER reject_email_session ON refresh_tokens');
    expect((await confirm(id, code)).status).toBe(200);
    expect(await counts(database)).toEqual({ users: 1, sessions: 2, audits: 1 });
    expect(sent.filter(row => row.channel === 'email')).toHaveLength(1);
  }));
}, 15000);

sqlIt('database delivery constraints reject incomplete or backwards receipts without changing account or proof authority', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await seedIdentity(database);
    const id = assertReceipt(await start()); await settle();
    for (const assignment of ["delivery_finished_at=NULL", "delivery_started_at=NULL", "delivery_state='attempting'",
      "delivery_state='not_started'", "delivery_finished_at=delivery_started_at-INTERVAL '1 second'"]) {
      await expect(database.query(`UPDATE email_sign_in_challenges SET ${assignment} WHERE id=$1`, [id]))
        .rejects.toMatchObject({ code: '23514', constraint: 'email_sign_in_delivery_timestamps' });
    }
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, audits: 0 });
    const original = db.query;
    db.query = async (sql, params) => sql.includes('FROM email_sign_in_challenges') ? original(sql, params)
      : { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    try {
      // This owner-projected query is real SQL. Other export surfaces remain
      // outside this scoped fixture, not full archive/erasure acceptance.
      const result = await gatherUserData(sessionOwner);
      expect(result.emailSignInRequests).toEqual([{ state: 'pending', attempts: 0, request_ip: expect.any(String),
        created_at: expect.any(Date), expires_at: expect.any(Date), finished_at: null,
        delivery_state: 'accepted', delivery_started_at: expect.any(Date), delivery_finished_at: expect.any(Date) }]);
      expect((await gatherUserData(crypto.randomUUID())).emailSignInRequests).toEqual([]);
      for (const secret of [id, deliveredCode(sent, id), 'code_hash', 'identity_proof_id', 'recipient_hash']) {
        expect(JSON.stringify(result)).not.toContain(JSON.stringify(secret));
      }
    } finally { db.query = original; }
  }));
}, 15000);
