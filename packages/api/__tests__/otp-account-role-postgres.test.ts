import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp, refreshAccessToken } from '../src/services/auth.service';
import { sendOtpSms } from '../src/services/sms.service';
import { sessionIntegrationIt as it, sessionOwner, sessionHash, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));

const phone = '+639170000000';
const otpTable = `CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW());`;

it('keeps real one-time phone sign-in and refresh working for every marketplace role', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    for (const role of ['customer', 'provider', 'provider_staff']) {
      await withSessionDatabase(async database => {
        await database.query(otpTable);
        await database.query('DELETE FROM refresh_tokens');
        await database.query('UPDATE users SET session_version=7 WHERE id=$1', [sessionOwner]);
        await sendOtp(phone);
        const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
        const signedIn = await verifyOtp(phone, code, { deviceFingerprint: 'synthetic-device', ipAddress: '127.0.0.1' });
        expect(signedIn.isNewUser).toBe(false);
        expect(jwt.verify(signedIn.accessToken, process.env.JWT_SECRET!))
          .toMatchObject({ userId: sessionOwner, role, sessionVersion: 7 });
        expect((await database.query('SELECT token_hash,device_fingerprint FROM refresh_tokens')).rows)
          .toEqual([{ token_hash: sessionHash(signedIn.refreshToken), device_fingerprint: 'synthetic-device' }]);
        await expect(verifyOtp(phone, code)).rejects.toMatchObject({ statusCode: 400 });
        const refreshed = await refreshAccessToken(signedIn.refreshToken, { deviceFingerprint: 'synthetic-device' });
        expect(jwt.verify(refreshed.accessToken, process.env.JWT_SECRET!))
          .toMatchObject({ userId: sessionOwner, role, sessionVersion: 7 });
      }, role);
    }
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 30000);

it('does not reveal the privileged sign-in boundary until a real OTP has been verified', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  try {
    await withSessionDatabase(async database => {
      await database.query(otpTable);
      await sendOtp(phone);
      const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
      const wrong = code === '000000' ? '111111' : '000000';
      await expect(verifyOtp(phone, wrong)).rejects.toMatchObject({ statusCode: 400 });
      expect((await database.query('SELECT attempts,is_used FROM otp_codes')).rows)
        .toEqual([{ attempts: 1, is_used: false }]);
    }, 'admin');
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
});

it('keeps developer codes subject to the same role boundary and denies unknown future roles', async () => {
  const previous = { ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP, DEV_OTP_CODE: process.env.DEV_OTP_CODE,
    DEV_OTP_ALLOWED_PHONES: process.env.DEV_OTP_ALLOWED_PHONES };
  Object.assign(process.env, { ALLOW_DEV_OTP: '1', DEV_OTP_CODE: '123456', DEV_OTP_ALLOWED_PHONES: phone });
  try {
    for (const role of ['admin', 'super_admin', 'dpo', 'unrecognized_future_role']) {
      await withSessionDatabase(async database => {
        const before = (await database.query('SELECT * FROM users')).rows;
        const tokens = (await database.query('SELECT * FROM refresh_tokens')).rows;
        await expect(verifyOtp(phone, '123456')).rejects.toMatchObject({ statusCode: 403, code: 'phone_sign_in_not_allowed' });
        expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
        expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(tokens);
      }, role);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
