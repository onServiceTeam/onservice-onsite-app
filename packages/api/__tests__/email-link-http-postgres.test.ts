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

import accountRouter from '../src/routes/account.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { db } from '../src/models/db';
import { logger } from '../src/utils/logger';
import { beginEmailLink, requestEmailLink } from '../src/services/email-link.service';
import { gatherUserData } from '../src/services/data-management.service';
import { sessionOwner, sessionSecret, withSessionDatabase } from './helpers/account-session-postgres';
import { within } from './helpers/admin-password-postgres';

const originalEnv = { ...process.env };
const envKeys = ['EMAIL_LINKING_ENABLED', 'EMAIL_AUTH_DELIVERY_ENABLED', 'RESEND_API_KEY', 'EMAIL_FROM',
  'SEMAPHORE_API_KEY', 'NODE_ENV', 'TURNSTILE_SECRET_KEY', 'CAPTCHA_SECRET_KEY'];
const address = 'New.Owner+test@example.invalid';
const smsPhone = '+639170000000';
const nativeFetch = globalThis.fetch;
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/account', accountRouter);
app.use(errorMiddleware);
const base = '/api/v1/account/sign-in-email';
const access = (role = 'customer', userId = sessionOwner, type = 'access', sessionVersion = 1) => jwt.sign(
  { userId, role, type, sessionVersion }, sessionSecret, { algorithm: 'HS256', expiresIn: 3600 });
const start = (token: string, body: Record<string, unknown> = { email: address, captchaToken: 'synthetic-captcha' }) =>
  request(app).post(`${base}/requests`).auth(token, { type: 'bearer' }).send(body);
const confirm = (token: string, id: string, codes: { phoneCode: string; emailCode: string }) =>
  request(app).post(`${base}/${id}/confirm`).auth(token, { type: 'bearer' }).send(codes);
const status = (token: string) => request(app).get(base).auth(token, { type: 'bearer' });

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
if (process.env.CI && !safeDatabase) throw new Error('Email-link HTTP tests require isolated loopback *_test PostgreSQL in CI.');
const sqlIt = safeDatabase ? it : it.skip;

async function withDatabase(run: (database: Pool) => Promise<void>, role = 'customer'): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe email-link HTTP test database.');
  const verifier = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const connection = await verifier.connect();
    try {
      const socket = connection.connection.stream, url = new URL(databaseUrl!);
      const actual = await connection.query('SELECT current_database() AS name');
      if (!(socket instanceof Socket) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress ?? '')
          || socket.remotePort !== Number(url.port || '5432') || actual.rows[0].name !== url.pathname.slice(1)) {
        throw new Error('Email-link HTTP test database identity mismatch.');
      }
    } finally { connection.release(); }
  } finally { await verifier.end(); }
  await withSessionDatabase(async database => {
    await database.query(`UPDATE users SET must_rotate_password=FALSE;
      CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),
        action text,entity_type text,entity_id uuid,new_values jsonb)`);
    await run(database);
  }, role);
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, { EMAIL_LINKING_ENABLED: '1', EMAIL_AUTH_DELIVERY_ENABLED: '1',
    RESEND_API_KEY: 're_synthetic_link_delivery_key', EMAIL_FROM: 'signin@example.invalid',
    SEMAPHORE_API_KEY: 'synthetic-link-sms-key', TURNSTILE_SECRET_KEY: 'synthetic-captcha-key' });
  delete process.env.CAPTCHA_SECRET_KEY;
});
afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});

type Sent = { channel: 'captcha' | 'phone' | 'email'; body: string };
async function withDelivery(
  run: (sent: Sent[]) => Promise<void>,
  respond?: (channel: Sent['channel'], response: ServerResponse, body: string) => void,
): Promise<void> {
  const sent: Sent[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const channel = req.url!.slice(1) as Sent['channel'];
      sent.push({ channel, body });
      if (respond) { respond(channel, res, body); return; }
      accepted(channel, res);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string') throw new Error('Missing owned provider fixture');
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const channel = input === 'https://api.semaphore.co/api/v4/messages' ? 'phone'
      : input === 'https://api.resend.com/emails' ? 'email'
        : input === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' ? 'captcha' : null;
    if (!channel) throw new Error('Unexpected external verification destination');
    return nativeFetch(`http://127.0.0.1:${bound.port}/${channel}`, init);
  });
  try { await run(sent); }
  finally {
    fetchSpy.mockRestore(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
function accepted(channel: Sent['channel'], res: ServerResponse): void {
  res.end(JSON.stringify(channel === 'phone' ? [{ message_id: 123, recipient: smsPhone.slice(1), status: 'Pending' }]
    : channel === 'email' ? { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } : { success: true }));
}
function codesFrom(sent: Sent[]): { phoneCode: string; emailCode: string } {
  const phone = JSON.parse(sent.find(row => row.channel === 'phone')!.body);
  const email = JSON.parse(sent.find(row => row.channel === 'email')!.body);
  const phoneCode = /onService: (\d{6})/.exec(phone.message)?.[1];
  const emailCode = /\n\n(\d{6})\n\n/.exec(email.text)?.[1];
  expect(phoneCode).toMatch(/^\d{6}$/); expect(emailCode).toMatch(/^\d{6}$/);
  return { phoneCode: phoneCode!, emailCode: emailCode! };
}

it('email-link delivery refuses missing configuration even in development before a challenge or external request', async () => {
  const transaction = jest.spyOn(db, 'transaction'), fetchSpy = jest.spyOn(globalThis, 'fetch');
  try {
    for (const mode of ['production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      for (const key of ['', '   ', 'xxxxxxxxxxxx']) {
        process.env.SEMAPHORE_API_KEY = key;
        await expect(requestEmailLink({ userId: sessionOwner, role: 'customer', sessionVersion: 1 }, address, '192.0.2.1'))
          .rejects.toMatchObject({ statusCode: 503 });
      }
      process.env.SEMAPHORE_API_KEY = 'synthetic-key';
      process.env.EMAIL_AUTH_DELIVERY_ENABLED = '0';
      await expect(requestEmailLink({ userId: sessionOwner, role: 'customer', sessionVersion: 1 }, address, '192.0.2.1'))
        .rejects.toMatchObject({ statusCode: 503 });
      process.env.EMAIL_AUTH_DELIVERY_ENABLED = '1';
    }
    expect(transaction).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); fetchSpy.mockRestore(); }
});

it('mounted email-link requests require authentication and never cache an unauthorized response', async () => {
  const response = await request(app).post(`${base}/requests`).send({ email: address });
  expect(response.status).toBe(401);
  expect(response.headers['cache-control']).toBe('private, no-store');
});

for (const role of ['customer', 'provider', 'provider_staff']) {
  sqlIt(`mounted ${role} linking delivers distinct purpose-bound factors and confirms one owner without new credentials`, async () => {
    await withDatabase(async database => withDelivery(async sent => {
      const token = access(role), before = (await database.query('SELECT * FROM users')).rows;
      expect((await status(token)).body.data).toEqual({ linkedEmail: null, request: null });
      const started = await start(token);
      expect(started.status).toBe(202);
      expect(started.headers['cache-control']).toBe('private, no-store');
      expect(started.body.data.request).toMatchObject({ email: address, phoneSuffix: '0000', state: 'pending',
        delivery: { phone: 'accepted', email: 'accepted' } });
      expect(sent.map(row => row.channel).sort()).toEqual(['captcha', 'email', 'phone']);
      const codes = codesFrom(sent), operation = started.body.data.request.id;
      const sms = JSON.parse(sent.find(row => row.channel === 'phone')!.body);
      expect(sms.number).toBe(smsPhone.slice(1)); expect(sms.message).toContain('adds an email sign-in');
      expect(sms.message).toContain('Do not share');
      const serialized = JSON.stringify(started.body);
      for (const secret of [codes.phoneCode, codes.emailCode, smsPhone, 'phone_code_hash', 'accessToken', 'refreshToken']) {
        expect(serialized).not.toContain(JSON.stringify(secret));
      }
      expect((await status(token)).body.data).toEqual(started.body.data); // response-loss recovery, no send
      expect((await confirm(token, operation, codes)).body).toEqual({ success: true, data: { status: 'linked', email: address } });
      expect((await confirm(token, operation, codes)).status).toBe(200);
      const reopened = await status(token);
      expect(reopened.body.data).toMatchObject({ linkedEmail: address, request: { state: 'completed' } });
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows[0].count).toBe(1);
      expect((await database.query('SELECT count(*)::int AS count FROM audit_log')).rows[0].count).toBe(1);
      expect((await database.query('SELECT phone_code_hash,email_code_hash FROM email_link_challenges')).rows)
        .toEqual([{ phone_code_hash: null, email_code_hash: null }]);
      expect(sent).toHaveLength(3);
    }), role);
  }, 15000);
}

sqlIt('feature, CAPTCHA, strict input, token purpose and current-role guards deny before any send or challenge', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    const token = access();
    process.env.EMAIL_LINKING_ENABLED = '0'; expect((await start(token)).status).toBe(503);
    process.env.EMAIL_LINKING_ENABLED = '1';
    expect((await start(token, { email: address })).status).toBe(428);
    expect((await start(token, { email: address, captchaToken: 'proof', phone: '+639180000000' })).status).toBe(400);
    expect((await start(token, { email: address, captchaToken: 'x'.repeat(2049) })).status).toBe(400);
    for (const type of ['refresh', 'pre_auth_2fa', 'pre_auth_2fa_setup']) expect((await start(access('customer', sessionOwner, type))).status).toBe(401);
    expect((await start(access('provider'))).status).toBe(401);
    expect((await start(access('customer', sessionOwner, 'access', 2))).status).toBe(401);
    const cookieWrite = await request(app).post(`${base}/requests`)
      .set('Cookie', `admin_session=${token}`).auth(token, { type: 'bearer' })
      .send({ email: address, captchaToken: 'synthetic-captcha' });
    expect(cookieWrite.status).toBe(403);
    expect(cookieWrite.body.error.code).toBe('csrf_invalid');
    for (const role of ['admin', 'super_admin', 'dpo']) {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, sessionOwner]);
      expect((await start(access(role))).status).toBe(403);
    }
    await database.query("UPDATE users SET role='customer',is_active=FALSE WHERE id=$1", [sessionOwner]);
    expect((await start(token)).status).toBe(401);
    expect(sent).toHaveLength(0);
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(0);
  }));
});

sqlIt('failed CAPTCHA and missing CAPTCHA configuration leave no challenge, identity or sent code', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    expect((await start(access())).status).toBe(403);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect((await start(access())).status).toBe(503);
    expect(sent.map(row => row.channel)).toEqual(['captcha']);
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(0);
  }, (channel, res) => res.end(JSON.stringify(channel === 'captcha' ? { success: false } : {}))));
});

sqlIt('unknown SMS and rejected email are reported durably without an automatic resend or a successful-send claim', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    const started = await start(access());
    expect(started.status).toBe(202);
    expect(started.body.data.request.delivery).toEqual({ phone: 'unknown', email: 'rejected' });
    expect((await status(access())).body.data).toEqual(started.body.data);
    expect((await start(access())).status).toBe(429);
    expect(sent.filter(row => row.channel !== 'captcha')).toHaveLength(2);
    expect((await database.query('SELECT phone_delivery,email_delivery,delivery_finished_at FROM email_link_challenges')).rows)
      .toEqual([{ phone_delivery: 'unknown', email_delivery: 'rejected', delivery_finished_at: expect.any(Date) }]);
  }, (channel, res) => channel === 'phone' ? res.destroy()
    : channel === 'email' ? res.writeHead(422).end('private error not for logs') : accepted(channel, res)));
});

sqlIt('a real receipt-write failure preserves uncertainty and delivered proofs can still complete without any resend', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await database.query(`CREATE FUNCTION reject_delivery_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.delivery_finished_at IS NOT NULL THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_delivery_receipt BEFORE UPDATE ON email_link_challenges FOR EACH ROW EXECUTE FUNCTION reject_delivery_receipt()`);
    expect((await start(access())).status).toBe(500);
    const recovered = (await status(access())).body.data.request;
    expect(recovered.delivery).toEqual({ phone: 'unknown', email: 'unknown' });
    expect((await confirm(access(), recovered.id, codesFrom(sent))).status).toBe(200);
    expect((await status(access())).body.data.linkedEmail).toBe(address);
    expect(sent).toHaveLength(3);
    const logged = JSON.stringify([(logger.error as jest.Mock).mock.calls, (logger.warn as jest.Mock).mock.calls]);
    expect(logged).not.toContain(codesFrom(sent).phoneCode); expect(logged).not.toContain(codesFrom(sent).emailCode);
  }));
}, 15000);

sqlIt('concurrent starts produce one pair of deliveries and a second owner cannot view or consume the operation', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    const responses = await Promise.all([start(access()), start(access())]);
    expect(responses.map(row => row.status).sort()).toEqual([202, 429]);
    const operation = responses.find(row => row.status === 202)!.body.data.request.id;
    const other = crypto.randomUUID();
    await database.query("INSERT INTO users (id,phone,role) VALUES ($1,'+639180000000','customer')", [other]);
    const otherToken = access('customer', other);
    expect((await status(otherToken)).body.data).toEqual({ linkedEmail: null, request: null });
    expect((await confirm(otherToken, operation, codesFrom(sent))).status).toBe(400);
    expect((await database.query('SELECT attempts FROM email_link_challenges')).rows[0].attempts).toBe(0);
    expect(sent.filter(row => row.channel !== 'captcha')).toHaveLength(2);
    expect((await confirm(access(), operation, codesFrom(sent))).status).toBe(200);
  }));
}, 15000);

sqlIt('late delivery receipts do not reopen a request invalidated while a provider call was in flight', async () => {
  await withDatabase(async database => {
    let smsResponse: ServerResponse | undefined;
    let releasePhone!: () => void;
    const phoneEntered = new Promise<void>(resolve => { releasePhone = resolve; });
    await withDelivery(async sent => {
      const pending = start(access()).then(response => response);
      try {
        await within(phoneEntered, 'owned phone delivery arrival');
        await database.query(`UPDATE email_link_challenges SET state='invalidated',phone_code_hash=NULL,
          email_code_hash=NULL,finished_at=clock_timestamp(),created_at=clock_timestamp()-INTERVAL '2 minutes',
          expires_at=clock_timestamp()+INTERVAL '3 minutes'`);
        const newer = await beginEmailLink({ userId: sessionOwner, role: 'customer', sessionVersion: 1 },
          'Newer@example.invalid', '192.0.2.1');
        accepted('phone', smsResponse!);
        const response = await pending;
        expect(response.status).toBe(202);
        expect(response.body.data.request.state).toBe('invalidated');
        expect(response.body.data.request.email).toBe(address);
        expect(response.body.data.request.id).not.toBe(newer.id);
        expect((await status(access())).body.data.request.id).toBe(newer.id);
        expect((await confirm(access(), response.body.data.request.id, codesFrom(sent))).status).toBe(400);
        expect((await database.query('SELECT count(*)::int AS count FROM sign_in_email_identities')).rows[0].count).toBe(0);
      } finally { smsResponse?.end(); await pending; }
    }, (channel, res) => {
      if (channel === 'phone') { smsResponse = res; releasePhone(); } else accepted(channel, res);
    });
  });
}, 15000);

sqlIt('a real delivery-claim failure commits no send and an explicit later request obeys cooldown', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    await database.query(`CREATE FUNCTION reject_delivery_claim() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.delivery_started_at IS NOT NULL THEN RAISE EXCEPTION 'Synthetic claim failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_delivery_claim BEFORE UPDATE ON email_link_challenges FOR EACH ROW EXECUTE FUNCTION reject_delivery_claim()`);
    expect((await start(access())).status).toBe(500);
    expect((await status(access())).body.data.request.delivery).toEqual({ phone: 'not_started', email: 'not_started' });
    expect(sent.map(row => row.channel)).toEqual(['captcha']);
    expect((await start(access())).status).toBe(429);
    await database.query(`DROP TRIGGER reject_delivery_claim ON email_link_challenges;
      UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '2 minutes',
        expires_at=clock_timestamp()+INTERVAL '3 minutes'`);
    expect((await start(access())).status).toBe(202);
    expect(sent.filter(row => row.channel !== 'captcha')).toHaveLength(2);
    expect((await database.query("SELECT count(*)::int AS count FROM email_link_challenges WHERE state='invalidated'")).rows[0].count).toBe(1);
  }));
}, 15000);

sqlIt('revocation during delivery denies the response and neither old nor new session can consume the old proofs', async () => {
  await withDatabase(async database => {
    let smsResponse: ServerResponse | undefined;
    let releasePhone!: () => void;
    const phoneEntered = new Promise<void>(resolve => { releasePhone = resolve; });
    await withDelivery(async sent => {
      const pending = start(access()).then(response => response);
      try {
        await within(phoneEntered, 'owned phone delivery before revocation');
        await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
        accepted('phone', smsResponse!);
        expect((await pending).status).toBe(401);
        const operation = (await database.query('SELECT id FROM email_link_challenges')).rows[0].id;
        expect((await confirm(access(), operation, codesFrom(sent))).status).toBe(401);
        const newToken = access('customer', sessionOwner, 'access', 2);
        expect((await status(newToken)).body.data.request).toBeNull();
        expect((await confirm(newToken, operation, codesFrom(sent))).status).toBe(400);
        expect((await database.query('SELECT count(*)::int AS count FROM sign_in_email_identities')).rows[0].count).toBe(0);
        expect(sent.filter(row => row.channel !== 'captcha')).toHaveLength(2);
      } finally { smsResponse?.end(); await pending; }
    }, (channel, res) => {
      if (channel === 'phone') { smsResponse = res; releasePhone(); } else accepted(channel, res);
    });
  });
}, 15000);

sqlIt('mounted confirmation counts wrong codes, rejects expired proofs and does not depend on sender availability', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    const first = (await start(access())).body.data.request.id, codes = codesFrom(sent);
    const wrong = { ...codes, emailCode: codes.emailCode === '999999' ? '999998' : '999999' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await confirm(access(), first, wrong)).status).toBe(400);
      expect((await database.query('SELECT attempts FROM email_link_challenges WHERE id=$1', [first])).rows[0].attempts).toBe(attempt);
    }
    expect((await confirm(access(), first, codes)).status).toBe(400);
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '10 minutes',
      expires_at=clock_timestamp()-INTERVAL '5 minutes'`);
    const second = (await start(access())).body.data.request.id;
    const secondCodes = codesFrom(sent.slice(3));
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '10 minutes',
      expires_at=clock_timestamp()-INTERVAL '5 minutes' WHERE id=$1`, [second]);
    expect((await status(access())).body.data.request.state).toBe('expired');
    expect((await confirm(access(), second, secondCodes)).status).toBe(400);
    const third = (await start(access())).body.data.request.id, thirdCodes = codesFrom(sent.slice(6));
    delete process.env.SEMAPHORE_API_KEY; delete process.env.RESEND_API_KEY;
    expect((await confirm(access(), third, thirdCodes)).status).toBe(200);
    expect(sent).toHaveLength(9);
    expect((await database.query('SELECT count(*)::int AS count FROM audit_log')).rows[0].count).toBe(1);
  }));
}, 15000);

sqlIt('real receipt constraints reject incomplete states and owner export includes receipts but never proof secrets', async () => {
  await withDatabase(async database => withDelivery(async sent => {
    const started = await start(access()), operation = started.body.data.request.id;
    for (const assignment of ["delivery_finished_at=NULL", "delivery_started_at=NULL",
      "phone_delivery='attempting'", "email_delivery='not_started'",
      "delivery_finished_at=delivery_started_at-INTERVAL '1 second'"]) {
      await expect(database.query(`UPDATE email_link_challenges SET ${assignment} WHERE id=$1`, [operation]))
        .rejects.toMatchObject({ code: '23514', constraint: 'email_link_delivery_timestamps' });
    }
    const original = db.query;
    db.query = async (sql, params) => sql.includes('FROM sign_in_email_identities') || sql.includes('FROM email_link_challenges')
      ? original(sql, params) : { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    try {
      // These two export queries execute in PostgreSQL. Unrelated archive
      // queries are outside this fixture, not full export acceptance.
      const exported = await gatherUserData(sessionOwner);
      expect(exported.emailLinkRequests).toEqual([{
        phone: smsPhone, email: address, state: 'pending', request_ip: expect.any(String),
        created_at: expect.any(Date), expires_at: expect.any(Date), finished_at: null,
        phone_delivery: 'accepted', email_delivery: 'accepted',
        delivery_started_at: expect.any(Date), delivery_finished_at: expect.any(Date),
      }]);
      expect((await gatherUserData(crypto.randomUUID())).emailLinkRequests).toEqual([]);
      const codes = codesFrom(sent), serialized = JSON.stringify(exported);
      for (const secret of [codes.phoneCode, codes.emailCode, operation, 'phone_code_hash', 'email_code_hash']) {
        expect(serialized).not.toContain(JSON.stringify(secret));
      }
    } finally { db.query = original; }
  }));
}, 15000);
