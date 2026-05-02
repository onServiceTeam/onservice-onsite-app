import { z } from 'zod';

const PH_PHONE_REGEX = /^\+63\d{10}$/;

export const sendOtpSchema = z.object({
  phone: z
    .string()
    .regex(PH_PHONE_REGEX, 'Phone must be in +63 9XX XXX XXXX format'),
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .regex(PH_PHONE_REGEX, 'Phone must be in +63 9XX XXX XXXX format'),
  code: z
    .string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d+$/, 'Code must contain only digits'),
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
  totpCode: z.string().regex(/^\d{6,8}$/, 'totpCode must be 6-8 digits'),
});

export const adminTwoFactorDisableSchema = z.object({
  totpCode: z.string().regex(/^\d{6,8}$/, 'totpCode must be 6-8 digits'),
  password: z.string().min(8).max(200).optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
});
