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
// Only external delivery and abuse telemetry are stubbed. The HTTP route,
// OTP hash/consume, account reads/writes and session persistence are real.
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/services/security.service', () => ({
  checkOtpLockout: jest.fn().mockResolvedValue({ locked: false, captchaRequired: false }),
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
  registerDeviceFingerprint: jest.fn().mockResolvedValue({ isNewDevice: false }),
}));

it('Bug OPS-523 — denied phone sign-in leaves a deactivated marketplace account and its sessions unchanged', async () => {
  const previous = { ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP, DEV_OTP_CODE: process.env.DEV_OTP_CODE,
    DEV_OTP_ALLOWED_PHONES: process.env.DEV_OTP_ALLOWED_PHONES };
  const phone = '+639170000000';
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use(errorMiddleware);
  try {
    for (const role of ['customer', 'provider', 'provider_staff']) {
      for (const developmentCode of [false, true]) {
        Object.assign(process.env, { ALLOW_DEV_OTP: developmentCode ? '1' : '0',
          DEV_OTP_CODE: '123456', DEV_OTP_ALLOWED_PHONES: phone });
        await withSessionDatabase(async database => {
          await database.query(`CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            phone text NOT NULL, code text, code_hash text, attempts integer NOT NULL DEFAULT 0,
            is_used boolean NOT NULL DEFAULT FALSE, expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT NOW());`);
          await database.query(`UPDATE users SET is_active=FALSE, is_verified=FALSE,
            last_login_at='2026-01-01', updated_at='2026-01-02' WHERE id=$1`, [sessionOwner]);
          const accountBefore = (await database.query('SELECT * FROM users')).rows;
          const sessionsBefore = (await database.query('SELECT * FROM refresh_tokens')).rows;
          jest.mocked(security.recordLoginAttempt).mockClear();
          jest.mocked(security.registerDeviceFingerprint).mockClear();
          let code = '123456';
          if (!developmentCode) {
            expect((await request(app).post('/api/v1/auth/send-otp').send({ phone })).status).toBe(200);
            code = jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
          }
          const response = await request(app).post('/api/v1/auth/verify-otp').send({ phone, code });
          expect({ role, developmentCode, status: response.status }).toEqual({ role, developmentCode, status: 403 });
          expect(response.body.error.message).toBe('Your account has been deactivated. Contact support.');
          expect(response.body.data).toBeUndefined();
          expect(response.headers['set-cookie']).toBeUndefined();
          expect((await database.query('SELECT * FROM users')).rows).toEqual(accountBefore);
          expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessionsBefore);
          expect((await database.query('SELECT is_used FROM otp_codes')).rows)
            .toEqual(developmentCode ? [] : [{ is_used: true }]);
          expect(security.recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
            phone, attemptType: 'otp_verify', success: false,
          }));
          expect(security.recordLoginAttempt).not.toHaveBeenCalledWith(expect.objectContaining({
            attemptType: 'otp_verify', success: true,
          }));
          expect(security.registerDeviceFingerprint).not.toHaveBeenCalled();
        }, role);
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}, 60000);
