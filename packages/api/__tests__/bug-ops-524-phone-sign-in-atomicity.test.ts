import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp } from '../src/services/auth.service';
import { sendOtpSms } from '../src/services/sms.service';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));

it('Bug OPS-524 — failed session persistence rolls back account creation or sign-in metadata without restoring the consumed OTP', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  const phone = '+639170000000';
  try {
    for (const scenario of ['customer', 'provider', 'provider_staff', 'new_customer']) {
      await withSessionDatabase(async database => {
        await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
          is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW());`);
        if (scenario === 'new_customer') {
          await database.query(`DELETE FROM refresh_tokens; DELETE FROM users;
            ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
            ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';`);
        } else {
          await database.query(`UPDATE users SET is_verified=FALSE, last_login_at='2026-01-01',
            updated_at='2026-01-02' WHERE id=$1`, [sessionOwner]);
        }
        const accountsBefore = (await database.query('SELECT * FROM users')).rows;
        const sessionsBefore = (await database.query('SELECT * FROM refresh_tokens')).rows;
        await database.query(`CREATE FUNCTION fail_sign_in() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'synthetic sign-in persistence failure'; END $$;
          CREATE TRIGGER fail_sign_in BEFORE INSERT ON refresh_tokens
          FOR EACH ROW EXECUTE FUNCTION fail_sign_in();`);
        await sendOtp(phone);
        const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
        await expect(verifyOtp(phone, code)).rejects.toThrow('synthetic sign-in persistence failure');
        expect((await database.query('SELECT * FROM users')).rows).toEqual(accountsBefore);
        expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessionsBefore);
        expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
        await expect(verifyOtp(phone, code)).rejects.toMatchObject({ statusCode: 400 });

        await database.query('DROP TRIGGER fail_sign_in ON refresh_tokens');
        await sendOtp(phone);
        const retryCode = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
        const signedIn = await verifyOtp(phone, retryCode);
        expect(signedIn.isNewUser).toBe(scenario === 'new_customer');
        expect(jwt.verify(signedIn.accessToken, process.env.JWT_SECRET!)).toMatchObject({
          userId: signedIn.user.id, role: scenario === 'new_customer' ? 'customer' : scenario, sessionVersion: 1,
        });
        expect((await database.query('SELECT is_verified FROM users')).rows).toEqual([{ is_verified: true }]);
        expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows)
          .toEqual([{ count: sessionsBefore.length + 1 }]);
      }, scenario === 'new_customer' ? 'customer' : scenario);
    }
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 60000);
