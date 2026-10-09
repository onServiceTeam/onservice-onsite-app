import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { authRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { getClientIp } from '../middleware/ip-block.middleware';
import { createAppError } from '../middleware/error.middleware';
import { verifyCaptchaToken } from '../services/security.service';
import { assertEmailLinkEnabled, completeEmailLink, getEmailLinkStatus, requestEmailLink,
  type EmailLinkActor } from '../services/email-link.service';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authMiddleware);
router.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    if (!req.user || !['customer', 'provider', 'provider_staff'].includes(req.user.role)) {
      throw createAppError('This account cannot add a sign-in email.', 403);
    }
    assertEmailLinkEnabled();
    next();
  } catch (error) { next(error); }
});
const actor = (req: AuthenticatedRequest): EmailLinkActor => ({
  userId: req.user!.userId, role: req.user!.role as EmailLinkActor['role'],
  sessionVersion: req.user!.sessionVersion!,
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try { res.json({ success: true, data: await getEmailLinkStatus(actor(req)) }); }
  catch (error) { next(error); }
});

router.post('/requests', authRateLimitMiddleware, validationMiddleware(z.object({
  email: z.string().trim().email().max(254).regex(/^[\x21-\x7e]+$/),
  captchaToken: z.string().min(1).max(2048).optional(),
}).strict()), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.body.captchaToken) {
      res.status(428).json({ success: false, error: {
        message: 'CAPTCHA verification required.', statusCode: 428, captchaRequired: true,
      } });
      return;
    }
    // Linking is a rare security-sensitive send. Never use the relaxed-mode
    // missing-secret CAPTCHA bypass for this new identity-changing workflow.
    if (!(process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY)) {
      throw createAppError('Verification is temporarily unavailable.', 503);
    }
    if (!await verifyCaptchaToken(req.body.captchaToken)) throw createAppError('CAPTCHA verification failed.', 403);
    res.status(202).json({ success: true,
      data: await requestEmailLink(actor(req), req.body.email, getClientIp(req)) });
  } catch (error) { next(error); }
});

router.post('/:id/confirm', authRateLimitMiddleware, validationMiddleware({
  params: z.object({ id: z.string().uuid() }).strict(),
  body: z.object({ phoneCode: z.string().regex(/^\d{6}$/), emailCode: z.string().regex(/^\d{6}$/) }).strict(),
}), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await completeEmailLink(actor(req), String(req.params.id), req.body.phoneCode, req.body.emailCode);
    if (result.status !== 'linked') {
      throw createAppError(result.status === 'conflict'
        ? 'This email cannot be linked to this account.' : 'Invalid or expired verification codes.',
      result.status === 'conflict' ? 409 : 400);
    }
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

export default router;
