import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validationMiddleware } from '../middleware/validation.middleware';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { getClientIp } from '../middleware/ip-block.middleware';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
} from '../validators/auth.validators';
import * as authService from '../services/auth.service';
import * as securityService from '../services/security.service';
import { platformConfig } from '../config/platform.config';

interface UserProfileRow {
  id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: Date;
}

function formatUserResponse(u: UserProfileRow) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role,
    avatarUrl: u.avatar_url,
    isVerified: u.is_verified,
    isActive: u.is_active,
    createdAt: u.created_at,
  };
}

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts. Please try again later.',
      statusCode: 429,
    },
  },
});

router.post(
  '/send-otp',
  authRateLimit,
  validationMiddleware(sendOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const phone = req.body.phone as string;

      const lockoutStatus = await securityService.checkOtpLockout(phone, clientIp);
      if (lockoutStatus.locked) {
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many attempts. Please try again later.',
            statusCode: 429,
            lockoutEndsAt: lockoutStatus.lockoutEndsAt,
          },
        });
        return;
      }

      if (lockoutStatus.captchaRequired) {
        const captchaToken = req.body.captchaToken as string | undefined;
        if (!captchaToken) {
          res.status(428).json({
            success: false,
            error: {
              message: 'CAPTCHA verification required.',
              statusCode: 428,
              captchaRequired: true,
            },
          });
          return;
        }

        const captchaValid = await securityService.verifyCaptchaToken(captchaToken);
        if (!captchaValid) {
          await securityService.logSecurityEvent({
            eventType: 'captcha_failed',
            ipAddress: clientIp,
            metadata: { phone: phone.slice(-4) },
          });
          throw createAppError('CAPTCHA verification failed.', 403);
        }
      }

      const result = await authService.sendOtp(phone);

      await securityService.recordLoginAttempt({
        phone,
        ipAddress: clientIp,
        attemptType: 'otp_send',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
        deviceFingerprint: req.body.deviceFingerprint as string | undefined,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      const clientIp = getClientIp(req);
      await securityService.recordLoginAttempt({
        phone: req.body.phone ?? '',
        ipAddress: clientIp,
        attemptType: 'otp_send',
        success: false,
        userAgent: req.headers['user-agent'] as string | undefined,
      }).catch(() => {});
      next(error);
    }
  },
);

router.post(
  '/verify-otp',
  authRateLimit,
  validationMiddleware(verifyOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const phone = req.body.phone as string;

      const lockoutStatus = await securityService.checkOtpLockout(phone, clientIp);
      if (lockoutStatus.locked) {
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many attempts. Please try again later.',
            statusCode: 429,
            lockoutEndsAt: lockoutStatus.lockoutEndsAt,
          },
        });
        return;
      }

      const { accessToken, refreshToken, user, isNewUser } = await authService.verifyOtp(
        phone,
        req.body.code,
      );

      await securityService.recordLoginAttempt({
        phone,
        ipAddress: clientIp,
        attemptType: 'otp_verify',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
        deviceFingerprint: req.body.deviceFingerprint as string | undefined,
      });

      const deviceFingerprint = req.body.deviceFingerprint as string | undefined;
      let isNewDevice = false;
      if (deviceFingerprint) {
        const deviceResult = await securityService.registerDeviceFingerprint({
          userId: user.id,
          fingerprint: deviceFingerprint,
          deviceName: req.body.deviceName as string | undefined,
          platform: req.body.platform as 'ios' | 'android' | 'web' | undefined,
          ipAddress: clientIp,
        });
        isNewDevice = deviceResult.isNewDevice;
      }

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            phone: user.phone,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatar_url,
            isVerified: user.is_verified,
          },
          isNewUser,
          isNewDevice,
        },
      });
    } catch (error) {
      const clientIp = getClientIp(req);
      await securityService.recordLoginAttempt({
        phone: req.body.phone ?? '',
        ipAddress: clientIp,
        attemptType: 'otp_verify',
        success: false,
        userAgent: req.headers['user-agent'] as string | undefined,
      }).catch(() => {});
      next(error);
    }
  },
);

router.post(
  '/refresh-token',
  validationMiddleware(refreshTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await authService.refreshAccessToken(req.body.refreshToken);
      res.json({ success: true, data: tokens });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/logout',
  authMiddleware,
  validationMiddleware(logoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.user!.userId, req.body.refreshToken);
      res.json({ success: true, data: { message: 'Logged out successfully.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await db.query<UserProfileRow>(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at
         FROM users WHERE id = $1`,
        [req.user!.userId],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'User not found.', statusCode: 404 } });
        return;
      }

      res.json({ success: true, data: formatUserResponse(result.rows[0]!) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/me',
  authMiddleware,
  validationMiddleware(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { firstName, lastName, email } = req.body;

      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      if (firstName !== undefined) {
        sets.push(`first_name = $${idx++}`);
        vals.push(firstName);
      }
      if (lastName !== undefined) {
        sets.push(`last_name = $${idx++}`);
        vals.push(lastName);
      }
      if (email !== undefined) {
        sets.push(`email = $${idx++}`);
        vals.push(email);
      }

      if (sets.length === 0) {
        res.status(400).json({ success: false, error: { message: 'No fields to update.', statusCode: 400 } });
        return;
      }

      sets.push(`updated_at = NOW()`);
      vals.push(req.user!.userId);

      const result = await db.query<UserProfileRow>(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at`,
        vals,
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'User not found.', statusCode: 404 } });
        return;
      }

      res.json({ success: true, data: formatUserResponse(result.rows[0]!) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/login',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const { email, password } = req.body;
      if (typeof email !== 'string' || !email) throw createAppError('Email is required.', 400);
      if (typeof password !== 'string' || !password) throw createAppError('Password is required.', 400);

      const result = await db.query<UserProfileRow & { password_hash: string | null }>(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at, password_hash
         FROM users WHERE email = $1 AND role IN ('admin', 'super_admin')`,
        [email.toLowerCase().trim()],
      );

      if (result.rows.length === 0) {
        await securityService.recordLoginAttempt({
          phone: email,
          ipAddress: clientIp,
          attemptType: 'admin_login',
          success: false,
          userAgent: req.headers['user-agent'] as string | undefined,
        });
        await securityService.logSecurityEvent({
          eventType: 'admin_login_failed',
          ipAddress: clientIp,
          metadata: { email, reason: 'user_not_found' },
        });
        throw createAppError('Invalid email or password.', 401);
      }

      const user = result.rows[0]!;

      if (!user.is_active) {
        throw createAppError('Account is deactivated. Contact support.', 403);
      }

      if (!user.password_hash) {
        throw createAppError('Password login not configured for this account.', 401);
      }

      const valid = authService.verifyPassword(password, user.password_hash);
      if (!valid) {
        await securityService.recordLoginAttempt({
          phone: email,
          ipAddress: clientIp,
          attemptType: 'admin_login',
          success: false,
          userAgent: req.headers['user-agent'] as string | undefined,
        });
        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_failed',
          ipAddress: clientIp,
          metadata: { email, reason: 'invalid_password' },
        });
        throw createAppError('Invalid email or password.', 401);
      }

      await db.query(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [user.id],
      );

      const tokens = await authService.createTokenPair(user.id, user.role);

      await securityService.recordLoginAttempt({
        phone: email,
        ipAddress: clientIp,
        attemptType: 'admin_login',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
      });
      await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'admin_login',
        ipAddress: clientIp,
        metadata: { email },
      });

      logger.info('Admin login', { userId: user.id, email: user.email });

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: formatUserResponse(user),
          sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
