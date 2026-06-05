// BUG-PHASE127-01 — MED-N85 device-fingerprint refresh-token binding
// was completely disabled by validator default-strip behavior +
// missing client wiring. Three layered defects:
//
// Layer 1 — API validator (auth.validators.ts):
//   sendOtpSchema and verifyOtpSchema only declared {phone} and
//   {phone, code}. Zod's default behavior on .parse() is to STRIP
//   unknown keys from the output. So when the mobile client sent
//   {phone, deviceFingerprint} or {phone, code, deviceFingerprint},
//   the validator stripped deviceFingerprint before the route
//   handler at packages/api/src/routes/auth.routes.ts L225 / L274 /
//   L285 / L288 could read it. req.body.deviceFingerprint was
//   ALWAYS undefined; the no-bind code path always ran.
//
// Layer 2 — Mobile auth.store.ts requestOtp / verifyOtp:
//   Even before the validator strip, the mobile client never sent
//   the fingerprint. apps/mobile/src/services/device-fingerprint.service.ts
//   exported getDeviceFingerprint() but had ZERO consumers in
//   production code (only the CRIT-K01 regression test touched it).
//   So the API would have rejected stripping nothing.
//
// Layer 3 — refreshTokenSchema (already correct, regression guard):
//   refreshTokenSchema in auth.validators.ts L21-27 already
//   correctly declares deviceFingerprint optional, so the refresh
//   path was always parser-correct. Verifying the new bounds match
//   the existing refresh-side bounds avoids per-endpoint drift.
//
// Net effect: stolen refresh tokens could not be detected by the
// MED-N85 binding check because mobile never bound the fingerprint
// at issuance time. The feature was on paper only.
//
// Same family as Phase 106 (GPS streaming half-built) and Phase
// 125 (review notification end-to-end). Pattern: "wired one side
// of the contract without confirming the other side actually
// honors it."

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VALIDATORS = readFileSync(
  resolve(__dirname, '../src/validators/auth.validators.ts'),
  'utf8',
);
const AUTH_STORE = readFileSync(
  resolve(__dirname, '../../../apps/mobile/src/stores/auth.store.ts'),
  'utf8',
);
const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/auth.routes.ts'),
  'utf8',
);

describe('BUG-PHASE127-01 — device fingerprint binding end-to-end', () => {
  describe('API auth.validators schemas accept deviceFingerprint', () => {
    it('BUG-PHASE127-01 — DEVICE_FINGERPRINT_FIELD shared bounds (8–256, optional)', () => {
      expect(VALIDATORS).toMatch(
        /const DEVICE_FINGERPRINT_FIELD = z\.string\(\)\.min\(8\)\.max\(256\)\.optional\(\);/,
      );
    });

    it('BUG-PHASE127-01 — sendOtpSchema includes deviceFingerprint', () => {
      const block = VALIDATORS.match(/export const sendOtpSchema = z\.object\(\{[\s\S]+?\}\);/);
      expect(block).not.toBeNull();
      expect(block?.[0]).toMatch(/deviceFingerprint: DEVICE_FINGERPRINT_FIELD/);
    });

    it('BUG-PHASE127-01 — verifyOtpSchema includes deviceFingerprint', () => {
      const block = VALIDATORS.match(/export const verifyOtpSchema = z\.object\(\{[\s\S]+?\}\);/);
      expect(block).not.toBeNull();
      expect(block?.[0]).toMatch(/deviceFingerprint: DEVICE_FINGERPRINT_FIELD/);
    });

    it('BUG-PHASE127-01 — refreshTokenSchema deviceFingerprint preserved (regression guard)', () => {
      // Already had this pre-fix per MED-N85. Make sure it didn't
      // regress when this phase touched the validators file.
      expect(VALIDATORS).toMatch(/refreshTokenSchema[\s\S]+?deviceFingerprint: z\.string\(\)\.min\(8\)\.max\(256\)\.optional\(\)/);
    });
  });

  describe('Mobile auth.store.ts wires getDeviceFingerprint', () => {
    it('BUG-PHASE127-01 — getDeviceFingerprint imported from device-fingerprint.service', () => {
      expect(AUTH_STORE).toMatch(
        /import \{ getDeviceFingerprint \} from '@\/services\/device-fingerprint\.service'/,
      );
    });

    it('BUG-PHASE127-01 — requestOtp passes deviceFingerprint', () => {
      // Signature gained an optional captchaToken (E07 — Turnstile captcha on
      // the post-lockout OTP challenge); deviceFingerprint binding is unchanged.
      const fnBody = AUTH_STORE.match(/requestOtp: async \(phone: string, captchaToken\?: string\) => \{[\s\S]+?\},/);
      expect(fnBody).not.toBeNull();
      expect(fnBody?.[0]).toMatch(/deviceFingerprint = await getDeviceFingerprint\(\)/);
      expect(fnBody?.[0]).toMatch(/api\.post\('\/api\/v1\/auth\/send-otp', \{ phone, deviceFingerprint, captchaToken \}\)/);
    });

    it('BUG-PHASE127-01 — verifyOtp passes deviceFingerprint', () => {
      const fnBody = AUTH_STORE.match(/verifyOtp: async \(phone: string, code: string\) => \{[\s\S]+?storeTokens/);
      expect(fnBody).not.toBeNull();
      expect(fnBody?.[0]).toMatch(/deviceFingerprint = await getDeviceFingerprint\(\)/);
      expect(fnBody?.[0]).toMatch(/api\.post\('\/api\/v1\/auth\/verify-otp', \{ phone, code, deviceFingerprint \}\)/);
    });

    it('BUG-PHASE127-01 — fingerprint generation is best-effort (try/catch fallback so a fingerprint failure does not block sign-in)', () => {
      // Two try/catch blocks — one in requestOtp, one in verifyOtp.
      const tryCatchMatches = AUTH_STORE.match(/deviceFingerprint = await getDeviceFingerprint\(\);\s*\}\s*catch\s*\{\s*deviceFingerprint = undefined;\s*\}/g);
      expect(tryCatchMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe('API routes (regression guard — already correct, just confirm read path is preserved)', () => {
    it('BUG-PHASE127-01 — /auth/send-otp route reads req.body.deviceFingerprint', () => {
      expect(ROUTES).toMatch(/deviceFingerprint: req\.body\.deviceFingerprint as string \| undefined/);
    });

    it('BUG-PHASE127-01 — /auth/verify-otp route reads req.body.deviceFingerprint and forwards to verifyOtp context', () => {
      // The route reads req.body.deviceFingerprint multiple times
      // (verifyOtp call + recordLoginAttempt + reuse). Assert the
      // pattern is still in place; if a future refactor drops it,
      // this test surfaces the regression.
      const reads = ROUTES.match(/deviceFingerprint: req\.body\.deviceFingerprint as string \| undefined/g);
      expect(reads?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
  });
});
