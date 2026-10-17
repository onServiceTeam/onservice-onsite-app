// CR-274 (customer review 2026-10-17, slice P2, account-signin-1, fix round):
// when the server cannot record a phone sign-in attempt (the send-code or the
// check-code step failed and the attempt record failed too), its warning names
// the last 4 digits of the number only, never the full number. The honest
// sign-in change sends more requests down this path (every text that was not
// sent is now an error). Real auth router over supertest; the services are
// stubbed so both failures happen on purpose.
import express from 'express';
import request from 'supertest';

const mockWarn = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), transaction: jest.fn() } }));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { createAppError } from '../src/middleware/error.middleware';
import * as authService from '../src/services/auth.service';
import * as securityService from '../src/services/security.service';

const phone = '+639171234567';
const saved = process.env.PHONE_OTP_SIGN_IN_ENABLED;

afterEach(() => {
  jest.restoreAllMocks();
  if (saved === undefined) delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
  else process.env.PHONE_OTP_SIGN_IN_ENABLED = saved;
});

it('Bug CR-274 — a failed sign-in attempt record logs the last 4 digits of the number, never the full number', async () => {
  process.env.PHONE_OTP_SIGN_IN_ENABLED = '1';
  jest.spyOn(authService, 'assertPhoneSignInInvited').mockResolvedValue(undefined);
  jest.spyOn(securityService, 'checkOtpLockout').mockResolvedValue({ locked: false, captchaRequired: false });
  jest.spyOn(authService, 'sendOtp').mockRejectedValue(
    createAppError('We could not send a code to this number. Please try again later.', 502),
  );
  jest.spyOn(authService, 'verifyOtp').mockRejectedValue(createAppError('Invalid or expired code.', 400));
  jest.spyOn(securityService, 'recordLoginAttempt').mockRejectedValue(new Error('login_attempts insert failed'));
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use(errorMiddleware);

  const sent = await request(app).post('/api/v1/auth/send-otp').send({ phone });
  const checked = await request(app).post('/api/v1/auth/verify-otp').send({ phone, code: '123456' });

  // The person still gets the real reason, not the logging failure.
  expect([sent.status, checked.status]).toEqual([502, 400]);
  const warnings = mockWarn.mock.calls.filter(([message]) => String(message).startsWith('Failed to record OTP'));
  expect(warnings).toEqual([
    ['Failed to record OTP send attempt', { phoneSuffix: '4567', error: 'login_attempts insert failed' }],
    ['Failed to record OTP verify attempt', { phoneSuffix: '4567', error: 'login_attempts insert failed' }],
  ]);
  // No warning of any kind carries the full number or its local form.
  expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(/9171234567/);
});
