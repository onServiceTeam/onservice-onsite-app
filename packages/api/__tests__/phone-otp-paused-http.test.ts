import express from 'express';
import request from 'supertest';

jest.mock('../src/models/db', () => ({ db: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), transaction: jest.fn() } }));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import * as authService from '../src/services/auth.service';
import * as securityService from '../src/services/security.service';

// D37 (Ken, 2026-10-11): SMS cannot be delivered in the Philippines until the
// carriers receive our corporate documents, so phone codes are paused with
// PHONE_OTP_SIGN_IN_ENABLED=0. The phone code itself stays in place for when
// SMS returns; these checks prove the switch stops it at both routes and that
// the untouched path still runs when the switch is on.

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRouter);
app.use(errorMiddleware);
const phone = '+639170000000';
const saved = process.env.PHONE_OTP_SIGN_IN_ENABLED;

let send: jest.SpyInstance;
let check: jest.SpyInstance;
let lockout: jest.SpyInstance;
let record: jest.SpyInstance;
let invited: jest.SpyInstance;
beforeEach(() => {
  send = jest.spyOn(authService, 'sendOtp').mockResolvedValue({ message: 'Verification code sent to your phone.' });
  check = jest.spyOn(authService, 'verifyOtp').mockRejectedValue(new Error('verifyOtp must not run while paused'));
  lockout = jest.spyOn(securityService, 'checkOtpLockout').mockResolvedValue({ locked: false, captchaRequired: false });
  record = jest.spyOn(securityService, 'recordLoginAttempt').mockResolvedValue(undefined);
  // Updated 2026-10-18 (customer review slice P2, D41 Q47): send-otp now asks the
  // invited-testers setting first (on by default, CR-254). This test is about the
  // D37 pause switch, so the number counts as invited here.
  invited = jest.spyOn(authService, 'assertPhoneSignInInvited').mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (saved === undefined) delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
  else process.env.PHONE_OTP_SIGN_IN_ENABLED = saved;
});

it('D37 - with PHONE_OTP_SIGN_IN_ENABLED=0 neither phone route sends, checks or locks anything', async () => {
  process.env.PHONE_OTP_SIGN_IN_ENABLED = '0';
  const sent = await request(app).post('/api/v1/auth/send-otp').send({ phone });
  expect(sent.status).toBe(503);
  expect(sent.body.error).toEqual({ message: 'Phone sign-in is paused. Please sign in with your email address.',
    statusCode: 503, code: 'phone_sign_in_paused' });
  const verified = await request(app).post('/api/v1/auth/verify-otp').send({ phone, code: '123456' });
  expect(verified.status).toBe(503);
  expect(verified.body.error.code).toBe('phone_sign_in_paused');
  expect(send).not.toHaveBeenCalled();
  expect(check).not.toHaveBeenCalled();
  expect(lockout).not.toHaveBeenCalled();
  expect(invited).not.toHaveBeenCalled();
  // Paused requests (e.g. from older apps) must not count toward any lockout.
  expect(record).not.toHaveBeenCalled();
});

it('D37 - with the switch unset or on, the kept phone route still runs', async () => {
  for (const flag of [undefined, '1']) {
    if (flag === undefined) delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
    else process.env.PHONE_OTP_SIGN_IN_ENABLED = flag;
    send.mockClear();
    const sent = await request(app).post('/api/v1/auth/send-otp').send({ phone });
    expect({ flag, status: sent.status }).toEqual({ flag, status: 200 });
    expect(send).toHaveBeenCalledWith(phone);
  }
});
