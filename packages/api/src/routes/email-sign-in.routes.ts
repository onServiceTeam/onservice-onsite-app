import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { platformConfig } from '../config/platform.config';
import { authRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { getClientIp } from '../middleware/ip-block.middleware';
import { createAppError } from '../middleware/error.middleware';
import { verifyCaptchaToken } from '../services/security.service';
import { assertEmailSignInEnabled, assertEmailSignInDeliveryConfigured,
  requestEmailSignIn, completeEmailSignIn } from '../services/email-sign-in.service';
import { logger } from '../utils/logger';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use((_req, _res, next) => {
  try { assertEmailSignInEnabled(); next(); } catch (error) { next(error); }
});
router.post('/requests', authRateLimitMiddleware, validationMiddleware(z.object({
  email: z.string().trim().email().max(254).regex(/^[\x21-\x7e]+$/),
  captchaToken: z.string().min(1).max(2048).optional(),
}).strict()), async (req, res, next) => {
  try {
    assertEmailSignInDeliveryConfigured();
    if (!req.body.captchaToken) {
      res.status(428).json({ success: false, error: {
        message: 'CAPTCHA verification required.', statusCode: 428, captchaRequired: true,
      } });
      return;
    }
    if (!(process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY)) {
      throw createAppError('Verification is temporarily unavailable.', 503);
    }
    if (!await verifyCaptchaToken(req.body.captchaToken)) throw createAppError('CAPTCHA verification failed.', 403);
    const id = crypto.randomUUID(), email: string = req.body.email, ip = getClientIp(req);
    // Respond BEFORE account lookup, locking, hashing or provider I/O. This is
    // a request receipt, not a send guarantee or account-existence statement.
    // The same response covers unknown/ineligible/capped/failed requests. No
    // poll endpoint exposes their subsequent private state or delivery timing.
    res.status(202).json({ success: true, data: {
      id, status: 'received', retryAfterSeconds: platformConfig.otpCooldownSeconds,
      message: 'Check your email for a sign-in code. If it does not arrive, wait one minute before trying again or use phone sign-in.',
    } });
    try { await requestEmailSignIn(email, ip, id); }
    catch {
      // Post-response errors must not enter the global handler or log a raw
      // exception containing identifiers, SQL values, codes or credentials.
      logger.warn('Email sign-in request processing did not complete');
    }
  } catch (error) { next(error); }
});

router.post('/:id/confirm', authRateLimitMiddleware, validationMiddleware({
  params: z.object({ id: z.string().uuid() }).strict(),
  body: z.object({ code: z.string().regex(/^\d{6}$/), deviceFingerprint: z.string().min(8).max(256).optional() }).strict(),
}), async (req, res, next) => {
  try {
    const result = await completeEmailSignIn(String(req.params.id), req.body.code,
      { deviceFingerprint: req.body.deviceFingerprint, ipAddress: getClientIp(req) });
    if (result.status !== 'signed_in') {
      res.status(400).json({ success: false, error: { message: 'Invalid or expired sign-in code.', statusCode: 400 } });
      return;
    }
    // Keep the established marketplace bearer-token contract. This endpoint
    // neither reads nor issues administrator cookies, passwords or 2FA proofs.
    const { accessToken, refreshToken, user, isNewUser } = result;
    res.json({ success: true, data: { accessToken, refreshToken, user, isNewUser } });
  } catch {
    // Keep an infrastructure failure distinct from a wrong code without
    // exposing SQL/issuer messages, account details or tentative credentials.
    logger.error('Email sign-in verification could not complete');
    next(createAppError('Sign-in is temporarily unavailable. Please try again.', 503));
  }
});

export default router;
