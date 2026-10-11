import { sendOtp, verifyOtp } from '../src/services/auth.service';
import { sendOtpSms } from '../src/services/sms.service';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));

// D37 (2026-10-11): accounts created by email sign-up while SMS is paused
// carry a mobile number that was typed, never proven (phone_verified_at NULL,
// migration 180). When phone codes are switched back on, holding that number
// must not open the account. Real PostgreSQL, real OTP storage and issuer.

const phone = '+639170000000';
const otpTable = `CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW());`;

it('D37 - a real phone code cannot open an account whose number was never proven', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    await withSessionDatabase(async database => {
      await database.query(otpTable);
      await database.query('UPDATE users SET phone_verified_at = NULL WHERE id = $1', [sessionOwner]);
      const users = (await database.query('SELECT * FROM users')).rows;
      const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
      await sendOtp(phone);
      const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
      await expect(verifyOtp(phone, code, { deviceFingerprint: 'synthetic-device', ipAddress: '127.0.0.1' }))
        .rejects.toMatchObject({ statusCode: 403, code: 'phone_not_verified_for_account' });
      expect((await database.query('SELECT * FROM users')).rows).toEqual(users);
      expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
    });
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 30000);

it('D37 - accounts that existed before the pause keep their proven number and still sign in by phone', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    await withSessionDatabase(async database => {
      await database.query(otpTable);
      // Migration 180 stamps every existing account (column default).
      expect((await database.query('SELECT phone_verified_at IS NOT NULL AS proven FROM users WHERE id = $1',
        [sessionOwner])).rows).toEqual([{ proven: true }]);
      await sendOtp(phone);
      const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
      const signedIn = await verifyOtp(phone, code, { deviceFingerprint: 'synthetic-device', ipAddress: '127.0.0.1' });
      expect(signedIn.user.id).toBe(sessionOwner);
    });
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 30000);
