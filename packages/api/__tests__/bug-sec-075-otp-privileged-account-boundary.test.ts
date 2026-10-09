import express from 'express';
import request from 'supertest';
import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { sendOtpSms } from '../src/services/sms.service';
import * as security from '../src/services/security.service';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
// External delivery/abuse providers only. OTP hashing/consumption, account SQL,
// service/router behavior and credential persistence use their real code.
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/services/security.service', () => ({
  checkOtpLockout: jest.fn().mockResolvedValue({ locked: false, captchaRequired: false }),
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
  registerDeviceFingerprint: jest.fn().mockResolvedValue({ isNewDevice: false }),
}));

it('Bug SEC-075 — a valid phone OTP cannot issue administrator authority or bypass required factor enrollment', async () => {
  const previous = process.env.ALLOW_DEV_OTP;
  process.env.ALLOW_DEV_OTP = '0';
  const phone = '+639170000000';
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use(errorMiddleware);
  try {
    for (const role of ['admin', 'super_admin', 'dpo']) {
      for (const enrolled of [true, false]) {
        await withSessionDatabase(async database => {
          await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
            is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT NOW());`);
          await database.query(`UPDATE users SET totp_enabled=$1, must_rotate_password=FALSE,
            is_verified=FALSE, last_login_at='2026-01-01' WHERE id=$2`, [enrolled, sessionOwner]);
          await database.query('DELETE FROM refresh_tokens');
          const before = (await database.query('SELECT * FROM users')).rows;
          jest.mocked(security.recordLoginAttempt).mockClear();
          expect((await request(app).post('/api/v1/auth/send-otp').send({ phone })).status).toBe(200);
          const code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
          const response = await request(app).post('/api/v1/auth/verify-otp').send({ phone, code });
          expect({ role, enrolled, status: response.status }).toEqual({ role, enrolled, status: 403 });
          expect(response.body.error.code).toBe('phone_sign_in_not_allowed');
          expect(response.body.data).toBeUndefined();
          expect(response.headers['set-cookie']).toBeUndefined();
          expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
          expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
          expect((await database.query('SELECT is_used FROM otp_codes')).rows).toEqual([{ is_used: true }]);
          expect(security.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
            phone, attemptType: 'otp_verify', success: false,
          }));
          expect(security.recordLoginAttempt).not.toHaveBeenCalledWith(expect.objectContaining({
            attemptType: 'otp_verify', success: true,
          }));
        }, role);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = previous;
  }
}, 60000);
