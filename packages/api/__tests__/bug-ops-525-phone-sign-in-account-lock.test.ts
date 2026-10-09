import { sendOtp, verifyOtp } from '../src/services/auth.service';
import { sendOtpSms } from '../src/services/sms.service';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));

it('Bug OPS-525 — phone sign-in rechecks a concurrent account deactivation or privileged-role change before issuing credentials', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  const phone = '+639170000000';
  try {
    for (const role of ['customer', 'provider', 'provider_staff']) {
      for (const mutation of ['deactivate', 'privileged_role']) {
        await withSessionDatabase(async database => {
          await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
            is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT NOW());`);
          await database.query(`UPDATE users SET is_verified=FALSE, last_login_at='2026-01-01',
            updated_at='2026-01-02' WHERE id=$1`, [sessionOwner]);
          await sendOtp(phone);
          const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
          const sessionsBefore = (await database.query('SELECT * FROM refresh_tokens')).rows;
          const writer = await database.connect();
          let signingIn: Promise<{ status: string; statusCode?: number }> | undefined;
          try {
            await writer.query('BEGIN');
            const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
            await writer.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [sessionOwner]);
            // Attach rejection handling immediately and never put credentials
            // into the assertion output, even on the unfixed issuing branch.
            signingIn = verifyOtp(phone, code).then(() => ({ status: 'issued' }),
              (error: { statusCode?: number }) => ({ status: 'denied', statusCode: error.statusCode }));
            await waitForBlockedApproval(database, pid);
            await writer.query(mutation === 'deactivate'
              ? 'UPDATE users SET is_active=FALSE,session_version=session_version+1 WHERE id=$1'
              : "UPDATE users SET role='admin',session_version=session_version+1 WHERE id=$1", [sessionOwner]);
            const expectedAccount = (await writer.query('SELECT * FROM users')).rows;
            await writer.query('COMMIT');
            expect(await signingIn).toEqual({ status: 'denied', statusCode: 403 });
            expect((await database.query('SELECT * FROM users')).rows).toEqual(expectedAccount);
            expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessionsBefore);
            expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
          } finally {
            await writer.query('ROLLBACK');
            writer.release();
            if (signingIn) await signingIn;
          }
        }, role);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 60000);
