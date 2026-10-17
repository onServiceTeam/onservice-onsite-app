// CR-254 (customer review 2026-10-17, slice P2; D41 Q47 option a): with the
// admin setting "Invited testers only" on (its default from migration 188),
// phone sign-in refuses a number that is not on the server's test-number list
// with the admin's message, before any code is made, any text is sent or any
// attempt is recorded (a recorded refusal would count toward a lockout or a
// CAPTCHA for everyone on the same network). A listed number still passes.
// Real auth router and auth service, real migration 188 row, guarded
// PostgreSQL fixture; outbound HTTP is watched and must not happen.
import { p2Http, p2It as it, withP2Database } from './helpers/p2-switches-postgres';
import authRouter from '../src/routes/auth.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const uninvited = '+639171112233';
const listed = '+639179998877';
const saved = {
  SEMAPHORE_API_KEY: process.env.SEMAPHORE_API_KEY,
  ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP,
  DEV_OTP_CODE: process.env.DEV_OTP_CODE,
  DEV_OTP_ALLOWED_PHONES: process.env.DEV_OTP_ALLOWED_PHONES,
  PHONE_OTP_SIGN_IN_ENABLED: process.env.PHONE_OTP_SIGN_IN_ENABLED,
};
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it('Bug CR-254 — with invited testers only on, an uninvited number is refused with the admin message and nothing is sent or recorded', async () => {
  await withP2Database(async database => {
    // A key is set, so a send WOULD be attempted if the gate let it through.
    process.env.SEMAPHORE_API_KEY = 'synthetic-sms-key-never-used';
    delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
    Object.assign(process.env, { ALLOW_DEV_OTP: '1', DEV_OTP_CODE: '482915', DEV_OTP_ALLOWED_PHONES: listed });
    const outbound = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No outbound call may happen'));
    const http = p2Http([['/api/v1/auth', authRouter]]);

    const refused = await http.post('/api/v1/auth/send-otp', { phone: uninvited });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toEqual({
      message: 'onService is open to invited testers for now.',
      statusCode: 403,
      code: 'invited_testers_only',
    });
    expect(outbound).not.toHaveBeenCalled();
    const counts = (await database.query(`SELECT
        (SELECT COUNT(*)::int FROM otp_codes) AS codes,
        (SELECT COUNT(*)::int FROM login_attempts) AS attempts`)).rows[0];
    expect(counts).toEqual({ codes: 0, attempts: 0 });

    const allowed = await http.post('/api/v1/auth/send-otp', { phone: listed });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ message: 'Verification code is available from the protected test-account vault.' });
    expect(outbound).not.toHaveBeenCalled();
  });
}, 90000);
