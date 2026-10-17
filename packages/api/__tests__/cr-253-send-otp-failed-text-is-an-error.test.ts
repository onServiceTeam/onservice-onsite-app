// CR-253 (customer review 2026-10-17, slice P2, account-signin-1): sign-in
// honesty. When the text with the code was not sent, POST /auth/send-otp
// answers with a plain error in every environment. Before this fix only
// production did; a test or staging server (the tester server runs as
// staging) said "Verification code sent to your phone." with no text sent.
// A number on the server's test-number list still succeeds without a text.
// Real auth router and real auth service on the guarded PostgreSQL fixture;
// no SMS key is set, so the real SMS service reports that nothing was sent.
// The invited-testers setting is off here so the normal send path runs.
import { p2Http, p2It as it, setSettingRow, withP2Database } from './helpers/p2-switches-postgres';
import authRouter from '../src/routes/auth.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// The shared IP limiter is not the subject here.
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const uninvited = '+639171112233';
const listed = '+639179998877';
const saved = {
  NODE_ENV: process.env.NODE_ENV,
  SEMAPHORE_API_KEY: process.env.SEMAPHORE_API_KEY,
  ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP,
  DEV_OTP_CODE: process.env.DEV_OTP_CODE,
  DEV_OTP_ALLOWED_PHONES: process.env.DEV_OTP_ALLOWED_PHONES,
  PHONE_OTP_SIGN_IN_ENABLED: process.env.PHONE_OTP_SIGN_IN_ENABLED,
};
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it('Bug CR-253 — a code that was not texted is an error on test and staging servers, and a listed test number still signs in', async () => {
  await withP2Database(async database => {
    await setSettingRow(database, 'invited_testers_only', 'false');
    delete process.env.SEMAPHORE_API_KEY;
    delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
    Object.assign(process.env, { ALLOW_DEV_OTP: '1', DEV_OTP_CODE: '482915', DEV_OTP_ALLOWED_PHONES: listed });
    const http = p2Http([['/api/v1/auth', authRouter]]);

    const answers: Record<string, unknown> = {};
    for (const environment of ['test', 'staging']) {
      process.env.NODE_ENV = environment;
      // Each environment uses a fresh number, so the resend cooldown never answers first.
      const phone = environment === 'test' ? uninvited : '+639171112234';
      const response = await http.post('/api/v1/auth/send-otp', { phone });
      answers[environment] = { status: response.status, error: response.body.error, data: response.body.data };
    }
    process.env.NODE_ENV = 'test';
    const notSent = {
      status: 502,
      error: { message: 'We could not send a code to this number. Please try again later.', statusCode: 502, code: 'sms_not_sent' },
      data: undefined,
    };
    expect(answers).toEqual({ test: notSent, staging: notSent });

    const allowed = await http.post('/api/v1/auth/send-otp', { phone: listed });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ message: 'Verification code is available from the protected test-account vault.' });
    // The listed number never gets a stored code: the test code is used instead.
    expect((await database.query('SELECT COUNT(*)::int AS n FROM otp_codes WHERE phone = $1', [listed])).rows[0].n).toBe(0);
  });
}, 90000);
