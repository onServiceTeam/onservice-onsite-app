import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { platformConfig } from '../config/platform.config';
import { authRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { getClientIp } from '../middleware/ip-block.middleware';
import * as securityService from '../services/security.service';
import {
  assertEmailCodeSignInEnabled, assertEmailGuessAllowance, completeEmailSignup, emailAttemptKey, normalizeEmail,
  requestMarketplaceEmailCode, verifyMarketplaceEmailCode, WRONG_GUESS_CODES, type EmailSignInUser,
} from '../services/email-code-auth.service';
import { logger } from '../utils/logger';

/**
 * D37 (Ken, 2026-10-11): email-code sign-in for customers, providers and
 * provider staff while phone codes are paused. Mounted at
 * /api/v1/auth/email-code. See email-code-auth.service.ts for the rules.
 *
 *   POST /request          { email }                      -> code sent (or the same code re-sent)
 *   POST /verify           { email, code }                -> signed in, or needs_account + signupToken
 *   POST /complete-signup  { signupToken, firstName, lastName, phone } -> new account, signed in
 *
 * Abuse limits (review 2026-10-12): codes per email and per network per hour,
 * 30 s between sends, 5 sends and 5 wrong tries per code, and a per-network
 * ceiling on wrong guesses. The phone-code lockout is NOT reused: it counted
 * every failure and locked whole shared mobile-network addresses, so anyone
 * could lock a person out of their own email.
 */

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

const device = {
  deviceFingerprint: z.string().min(8).max(256).optional(),
  deviceName: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
};
const emailField = z.string().trim().min(3).max(254);

function userResponse(user: EmailSignInUser): Record<string, unknown> {
  return {
    id: user.id, phone: user.phone, firstName: user.first_name, lastName: user.last_name,
    email: user.email, role: user.role, avatarUrl: user.avatar_url, isVerified: user.is_verified,
  };
}

/** Errors from the email-code service may carry retryAfterMs / remainingAttempts / expiresInMs. */
export function sendEmailCodeError(error: unknown, res: Response, next: NextFunction): void {
  const details = (error as { clientDetails?: Record<string, unknown> }).clientDetails;
  const status = (error as { statusCode?: number }).statusCode;
  if (details && status && status < 600 && (error as { isOperational?: boolean }).isOperational) {
    res.status(status).json({ success: false, error: {
      message: (error as Error).message, statusCode: status, code: (error as { code?: string }).code, ...details,
    } });
    return;
  }
  next(error);
}

async function registerDevice(userId: string, body: Record<string, unknown>, ip: string): Promise<boolean> {
  if (typeof body.deviceFingerprint !== 'string') return false;
  try {
    const result = await securityService.registerDeviceFingerprint({
      userId, fingerprint: body.deviceFingerprint, ipAddress: ip,
      deviceName: body.deviceName as string | undefined,
      platform: body.platform as 'ios' | 'android' | 'web' | undefined,
    });
    return result.isNewDevice;
  } catch {
    // Device bookkeeping must never undo a completed sign-in.
    logger.warn('Email sign-in device registration failed');
    return false;
  }
}

router.post(
  '/request',
  authRateLimitMiddleware,
  // captchaToken is accepted for older clients and ignored.
  validationMiddleware(z.object({ email: emailField, captchaToken: z.string().min(1).max(2048).optional(), ...device }).strict()),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const receipt = await requestMarketplaceEmailCode(req.body.email, getClientIp(req));
      res.status(202).json({ success: true, data: {
        challengeId: receipt.challengeId,
        resent: receipt.resent,
        expiresInMs: receipt.expiresInMs,
        resendInMs: receipt.resendInMs,
        validForMs: platformConfig.emailCode.validForMs,
        // 'unknown': the provider did not confirm (timeout or its own error).
        // The code may still arrive; the app suggests Resend after 30 s.
        delivery: receipt.delivery,
        message: receipt.resent
          ? 'We sent the same code again. It is still valid until the original time.'
          : 'We sent a 6-digit code to your email. It is valid for 5 minutes.',
      } });
    } catch (error) {
      sendEmailCodeError(error, res, next);
    }
  },
);

router.post(
  '/verify',
  authRateLimitMiddleware,
  validationMiddleware(z.object({ email: emailField, code: z.string().regex(/^\d{6}$/), ...device }).strict()),
  async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    let attemptKey = '';
    try {
      assertEmailCodeSignInEnabled();
      attemptKey = emailAttemptKey(normalizeEmail(req.body.email).hash);
      await assertEmailGuessAllowance(ip);

      const result = await verifyMarketplaceEmailCode(req.body.email, req.body.code,
        { deviceFingerprint: req.body.deviceFingerprint, ipAddress: ip });

      if (result.status === 'needs_account') {
        res.json({ success: true, data: {
          status: 'needs_account', email: result.email, signupToken: result.signupToken,
          signupExpiresInSeconds: platformConfig.emailCode.signupTokenSeconds,
        } });
        return;
      }
      const isNewDevice = await registerDevice(result.user.id, req.body, ip);
      res.json({ success: true, data: {
        status: 'signed_in', accessToken: result.accessToken, refreshToken: result.refreshToken,
        user: userResponse(result.user), isNewUser: result.isNewUser, isNewDevice,
      } });
    } catch (error) {
      // Only a real wrong guess counts toward the per-network ceiling.
      if (attemptKey && WRONG_GUESS_CODES.has((error as { code?: string }).code ?? '')) {
        await securityService.recordLoginAttempt({ phone: attemptKey, ipAddress: ip, attemptType: 'otp_verify',
          success: false, userAgent: req.headers['user-agent'] as string | undefined });
      }
      sendEmailCodeError(error, res, next);
    }
  },
);

router.post(
  '/complete-signup',
  authRateLimitMiddleware,
  validationMiddleware(z.object({
    signupToken: z.string().min(20).max(4096),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^\+63\d{10}$/),
    ...device,
  }).strict()),
  async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    try {
      const result = await completeEmailSignup(req.body.signupToken,
        { firstName: req.body.firstName, lastName: req.body.lastName, phone: req.body.phone },
        { deviceFingerprint: req.body.deviceFingerprint, ipAddress: ip });
      const isNewDevice = await registerDevice(result.user.id, req.body, ip);
      res.status(201).json({ success: true, data: {
        status: 'signed_in', accessToken: result.accessToken, refreshToken: result.refreshToken,
        user: userResponse(result.user), isNewUser: true, isNewDevice,
      } });
    } catch (error) {
      sendEmailCodeError(error, res, next);
    }
  },
);

export default router;
