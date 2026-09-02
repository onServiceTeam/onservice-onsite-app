import { z } from 'zod';

const PH_PHONE_REGEX = /^\+63\d{10}$/;

// BUG-PHASE127-01 fix — pre-fix sendOtpSchema and verifyOtpSchema
// only declared {phone} / {phone, code}. Zod's default behavior on
// .parse() is to STRIP unknown keys from the output. So when the
// mobile client sent {phone, deviceFingerprint} to /auth/send-otp
// (or {phone, code, deviceFingerprint} to /auth/verify-otp), the
// validator stripped deviceFingerprint before the route handler
// could read it — even though auth.routes.ts at L225 + L274 + L285
// + L288 read req.body.deviceFingerprint expecting it to be there.
// Result: the MED-N85 refresh-token binding feature was silently
// disabled — the API always saw deviceFingerprint=undefined and
// fell through to the no-bind path. Stolen refresh tokens could
// not be detected.
//
// Fix: declare deviceFingerprint as an optional bounded string on
// both schemas. Length bounds match the refreshTokenSchema below
// (which already had it correctly). Once the mobile client wires
// getDeviceFingerprint() into its requestOtp/verifyOtp calls
// (separate change), the binding feature becomes functional.
const DEVICE_FINGERPRINT_FIELD = z.string().min(8).max(256).optional();

export const sendOtpSchema = z.object({
  phone: z
    .string()
    .regex(PH_PHONE_REGEX, 'Phone must be in +63 9XX XXX XXXX format'),
  deviceFingerprint: DEVICE_FINGERPRINT_FIELD,
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .regex(PH_PHONE_REGEX, 'Phone must be in +63 9XX XXX XXXX format'),
  code: z
    .string()
    .regex(/^\d{4,8}$/, 'Verification code must be 4 to 8 digits'),
  deviceFingerprint: DEVICE_FINGERPRINT_FIELD,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  // MED-N85 — optional device fingerprint forwarded to the binding
  // check. Mobile already sends this on /auth/verify; sending it here
  // means /refresh-token can compare against the issuance record.
  deviceFingerprint: z.string().min(8).max(256).optional(),
});

// MED-N84 fix — admin login + 2FA endpoints used to extract fields
// directly from req.body with manual type checks. Inconsistent with
// the rest of the routes that go through validationMiddleware(Zod).
// These schemas centralize the validation so the route handlers can
// just consume req.body knowing the shape is correct.
export const adminLoginSchema = z.object({
  email: z.string().email('Email must be a valid email address').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const adminTwoFactorVerifySchema = z.object({
  preAuthToken: z.string().min(10, 'preAuthToken is required'),
  totpCode: z.string().regex(/^\d{6,8}$/, 'totpCode must be 6-8 digits').optional(),
  backupCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/, 'backupCode must be a valid 10-character recovery code')
    .optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.totpCode ? 1 : 0) + (value.backupCode ? 1 : 0) !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of totpCode or backupCode.',
      path: ['totpCode'],
    });
  }
});

export const adminTwoFactorDisableSchema = z.object({
  totpCode: z.string().regex(/^\d{6,8}$/, 'totpCode must be 6-8 digits'),
  password: z.string().min(8).max(200).optional(),
});

export const adminChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'oldPassword is required').max(200),
  newPassword: z.string().min(12, 'newPassword must be at least 12 characters').max(128),
}).strict();

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

// Bug UX-654 — changing a contact email through the generic profile endpoint
// bypassed ownership verification. The active customer product deliberately
// does not offer email editing until a verified pending-email workflow exists,
// so fail closed at the request boundary instead of silently accepting an
// unverified identity change. `.strict()` also prevents Zod from stripping an
// attempted email field and letting a mixed name+email request partially pass.
export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
}).strict();
