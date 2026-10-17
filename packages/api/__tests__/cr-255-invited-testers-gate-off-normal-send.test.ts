// CR-255 (customer review 2026-10-17, slice P2; D41 Q47): with "Invited
// testers only" switched off in admin, a number that is not on the test list
// takes the normal sign-in path again: a code is stored and the text is
// handed to the SMS provider. The provider here is a loopback fixture that
// accepts the text (helpers/sms-http.ts); nothing leaves the machine. Real
// auth router and auth service on the guarded PostgreSQL fixture.
// Guard: this is an acceptance check for the switched-off state, not a
// regression test. It passes on the old code by design (there was no switch,
// so every number took the normal path); it fails if the switch is ignored
// and the gate refuses numbers while off.
import { p2Http, p2It as it, setSettingRow, withP2Database } from './helpers/p2-switches-postgres';
import { smsPhone, smsReceipt, withSmsProvider } from './helpers/sms-http';
import authRouter from '../src/routes/auth.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const savedSwitch = process.env.PHONE_OTP_SIGN_IN_ENABLED;
const savedAllow = process.env.ALLOW_DEV_OTP;
afterEach(() => {
  if (savedSwitch === undefined) delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
  else process.env.PHONE_OTP_SIGN_IN_ENABLED = savedSwitch;
  if (savedAllow === undefined) delete process.env.ALLOW_DEV_OTP;
  else process.env.ALLOW_DEV_OTP = savedAllow;
});

it('Bug CR-255 — with invited testers only off, an unlisted number gets the normal code and text', async () => {
  await withP2Database(async database => {
    await setSettingRow(database, 'invited_testers_only', 'false');
    delete process.env.PHONE_OTP_SIGN_IN_ENABLED;
    delete process.env.ALLOW_DEV_OTP;
    const http = p2Http([['/api/v1/auth', authRouter]]);

    await withSmsProvider((response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([smsReceipt]));
    }, async (endpoint) => {
      const sent = await http.post('/api/v1/auth/send-otp', { phone: smsPhone });
      expect(sent.status).toBe(200);
      expect(sent.body.data).toEqual({ message: 'Verification code sent to your phone.' });
      expect(endpoint.requests).toHaveLength(1);
      expect(JSON.parse(endpoint.requests[0]!.body)).toMatchObject({ number: smsPhone.slice(1) });
    });

    const stored = (await database.query(
      'SELECT COUNT(*)::int AS n FROM otp_codes WHERE phone = $1 AND is_used = FALSE AND code_hash IS NOT NULL', [smsPhone],
    )).rows[0].n;
    expect(stored).toBe(1);
  });
}, 90000);
