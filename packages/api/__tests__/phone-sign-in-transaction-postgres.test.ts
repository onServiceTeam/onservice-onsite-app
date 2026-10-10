import jwt from 'jsonwebtoken';
import type { QueryResultRow } from 'pg';
import { db } from '../src/models/db';
import { sendOtp, verifyOtp, refreshAccessToken } from '../src/services/auth.service';
import { sendOtpSms } from '../src/services/sms.service';
import { deferred, within } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, sessionHash, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));

const phone = '+639170000000';
const otherPhone = '+639170000001';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otpTable = `CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW());`;

// Scheduling only: every statement, lock, commit and rollback is real SQL.
function pauseAccountRead() {
  const actual = db.transaction, entered = deferred(), release = deferred();
  let paused = false, pid = 0;
  db.transaction = async work => actual(async client => work({
    query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
      const result = await client.query<R>(sql, params);
      if (!paused && sql.includes('SELECT * FROM users WHERE phone')) {
        paused = true;
        pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        entered.resolve(); await release.promise;
      }
      return result;
    },
  }));
  return { entered: entered.promise, pid: () => pid, release: release.resolve,
    restore: () => { db.transaction = actual; } };
}

async function withDevCode(run: () => Promise<void>) {
  const previous = { ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP, DEV_OTP_CODE: process.env.DEV_OTP_CODE,
    DEV_OTP_ALLOWED_PHONES: process.env.DEV_OTP_ALLOWED_PHONES };
  Object.assign(process.env, { ALLOW_DEV_OTP: '1', DEV_OTP_CODE: '123456',
    DEV_OTP_ALLOWED_PHONES: `${phone},${otherPhone}` });
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

it('account-first revocation waits for an earlier sign-in and removes its session without blocking another account', async () => {
  await withDevCode(async () => withSessionDatabase(async database => {
    await database.query("INSERT INTO users (id,phone,role) VALUES ($1,$2,'customer')", [otherOwner, otherPhone]);
    const pause = pauseAccountRead();
    const signingIn = verifyOtp(phone, '123456');
    void signingIn.catch(() => undefined);
    let revoking: Promise<void> | undefined;
    try {
      await within(pause.entered, 'locked account sign-in read');
      revoking = (async () => {
        const writer = await database.connect();
        try {
          await writer.query('BEGIN');
          await writer.query('UPDATE users SET session_version=session_version+1 WHERE id=$1', [sessionOwner]);
          await writer.query('DELETE FROM refresh_tokens WHERE user_id=$1', [sessionOwner]);
          await writer.query('COMMIT');
        } catch (error) { await writer.query('ROLLBACK'); throw error; }
        finally { writer.release(); }
      })();
      void revoking.catch(() => undefined);
      await waitForBlockedApproval(database, pause.pid());
      const unrelated = await within(verifyOtp(otherPhone, '123456'), 'independent account sign-in');
      expect(unrelated.user.id).toBe(otherOwner);
      pause.release();
      const signedIn = await within(signingIn, 'first sign-in commit');
      await within(revoking, 'account-first revocation commit');
      expect(jwt.verify(signedIn.accessToken, process.env.JWT_SECRET!))
        .toMatchObject({ userId: sessionOwner, role: 'customer', sessionVersion: 1 });
      expect((await database.query('SELECT session_version FROM users WHERE id=$1', [sessionOwner])).rows)
        .toEqual([{ session_version: 2 }]);
      expect((await database.query('SELECT user_id,token_hash FROM refresh_tokens')).rows)
        .toEqual([{ user_id: otherOwner, token_hash: sessionHash(unrelated.refreshToken) }]);
      await expect(refreshAccessToken(signedIn.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    } finally {
      pause.release();
      await Promise.allSettled([signingIn, ...(revoking ? [revoking] : [])]);
      pause.restore();
    }
  }));
});

it('a waiting fresh sign-in uses the preserved account after a concurrent role-change rollback', async () => {
  await withDevCode(async () => withSessionDatabase(async database => {
    await database.query('UPDATE users SET session_version=7 WHERE id=$1', [sessionOwner]);
    const writer = await database.connect();
    let signingIn: ReturnType<typeof verifyOtp> | undefined;
    try {
      await writer.query('BEGIN');
      const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      await writer.query("UPDATE users SET role='admin',session_version=8 WHERE id=$1", [sessionOwner]);
      signingIn = verifyOtp(phone, '123456');
      void signingIn.catch(() => undefined);
      await waitForBlockedApproval(database, pid);
      await writer.query('ROLLBACK');
      const result = await signingIn;
      expect(jwt.verify(result.accessToken, process.env.JWT_SECRET!))
        .toMatchObject({ userId: sessionOwner, role: 'customer', sessionVersion: 7 });
      expect((await database.query('SELECT role,session_version FROM users')).rows)
        .toEqual([{ role: 'customer', session_version: 7 }]);
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens WHERE token_hash=$1',
        [sessionHash(result.refreshToken)])).rows).toEqual([{ count: 1 }]);
    } finally {
      await writer.query('ROLLBACK'); writer.release();
      if (signingIn) await Promise.allSettled([signingIn]);
    }
  }));
});

it('two real simultaneous uses of one phone code create exactly one new session', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    await withSessionDatabase(async database => {
      await database.query(otpTable);
      await database.query('DELETE FROM refresh_tokens');
      await sendOtp(phone);
      const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
      const results = await Promise.allSettled([verifyOtp(phone, code), verifyOtp(phone, code)]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toEqual([
        expect.objectContaining({ reason: expect.objectContaining({ statusCode: 400 }) }),
      ]);
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
      expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
    });
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
});
