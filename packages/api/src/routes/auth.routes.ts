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
  adminLoginSchema,
  adminTwoFactorVerifySchema,
  adminTwoFactorDisableSchema,
} from '../validators/auth.validators';
import * as authService from '../services/auth.service';
import * as securityService from '../services/security.service';
import { platformConfig } from '../config/platform.config';
import { generateTotpSecret, verifyTotp, generateTotpUri, encryptSecret, decryptSecret } from '../utils/totp';
import {
  setAdminSessionCookies,
  clearAdminSessionCookies,
  revokeAdminCsrfTokens,
} from '../utils/admin-cookies';

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

function formatUserResponse(u: UserProfileRow): Record<string, unknown> {
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

// Custom middleware for the 2FA enrolment flow: accepts EITHER a normal admin
// access token OR a short-lived `pre_auth_2fa_setup` token issued by
// /admin/login when an admin lacks TOTP. Sets req.isSetupToken=true when the
// caller is using the setup token so the handler can mint full session tokens
// after successful enable.
interface AdminSetupRequest extends AuthenticatedRequest {
  isSetupToken?: boolean;
}

function adminAuthOrSetupToken(
  req: AdminSetupRequest,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(createAppError('Authentication required.', 401));
    return;
  }
  const token = authHeader.slice('Bearer '.length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(createAppError('Server configuration error.', 500));
    return;
  }
  void (async () => {
    try {
      const jwt = await import('jsonwebtoken');
      const payload = jwt.default.verify(token, secret) as {
        userId: string;
        role: 'customer' | 'provider' | 'admin' | 'super_admin';
        type?: string;
        iat: number;
        exp: number;
      };
      if (payload.type === 'pre_auth_2fa_setup') {
        if (payload.role !== 'admin' && payload.role !== 'super_admin') {
          next(createAppError('Admin role required.', 403));
          return;
        }
        req.user = {
          userId: payload.userId,
          role: payload.role,
          iat: payload.iat,
          exp: payload.exp,
        };
        req.isSetupToken = true;
        next();
        return;
      }
      if (payload.type === 'pre_auth_2fa' || payload.type === 'refresh') {
        next(createAppError('Invalid authentication token.', 401));
        return;
      }
      if (payload.role !== 'admin' && payload.role !== 'super_admin') {
        next(createAppError('Admin role required.', 403));
        return;
      }
      req.user = {
        userId: payload.userId,
        role: payload.role,
        iat: payload.iat,
        exp: payload.exp,
      };
      req.isSetupToken = false;
      next();
    } catch {
      next(createAppError('Invalid or expired authentication token.', 401));
    }
  })();
}

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
      }).catch((err) => {
        logger.warn('Failed to record OTP send attempt', { phone: req.body.phone ?? '', error: err instanceof Error ? err.message : 'Unknown' });
      });
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
        // MED-N85 fix — capture the device fingerprint + IP at the
        // moment the refresh token is INSERTed so /refresh-token can
        // do the binding check on subsequent calls.
        {
          deviceFingerprint: req.body.deviceFingerprint as string | undefined,
          ipAddress: clientIp,
        },
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
      }).catch((err) => {
        logger.warn('Failed to record OTP verify attempt', { phone: req.body.phone ?? '', error: err instanceof Error ? err.message : 'Unknown' });
      });
      next(error);
    }
  },
);

router.post(
  '/refresh-token',
  validationMiddleware(refreshTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // MED-N85 fix — forward the incoming device fingerprint + IP so
      // the service can compare against the binding captured at
      // issuance. The body also accepts deviceFingerprint as part of
      // the refreshTokenSchema (back-compat: if absent we observe-only).
      const tokens = await authService.refreshAccessToken(req.body.refreshToken, {
        deviceFingerprint: req.body.deviceFingerprint as string | undefined,
        ipAddress: getClientIp(req),
      });
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
        // MED-N81 fix: pre-check uniqueness BEFORE the UPDATE so
        // the user gets a friendly 409 instead of a raw 23505
        // SQL error (or worse, no error at all if the column lacks
        // a UNIQUE constraint — which would silently break
        // admin-login lookup and password-reset). Case-insensitive
        // because email comparisons should be.
        const dup = await db.query<{ id: string }>(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1`,
          [email, req.user!.userId],
        );
        if (dup.rows.length > 0) {
          res.status(409).json({
            success: false,
            error: { message: 'That email is already in use by another account.', statusCode: 409 },
          });
          return;
        }
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
  // MED-N84 fix — Zod schema replaces the inline manual type checks
  // for consistency with the rest of the routes.
  validationMiddleware(adminLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const { email, password } = req.body;

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

      const verifyOutcome = authService.verifyPasswordWithRehash(password, user.password_hash);
      const valid = verifyOutcome.valid;
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

      // Opportunistic password rehash to migrate legacy/weaker scrypt params
      // to the current cost factor. Best-effort — never block login on failure.
      if (verifyOutcome.needsRehash) {
        try {
          const newHash = authService.hashPassword(password);
          await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
        } catch (err) {
          logger.warn('opportunistic password rehash failed', { err: String(err) });
        }
      }

      // Check if 2FA is enabled — require TOTP verification before issuing tokens
      const totpResult = await db.query<{ totp_enabled: boolean }>(
        `SELECT totp_enabled FROM users WHERE id = $1`,
        [user.id],
      );
      const totpEnabled = totpResult.rows[0]?.totp_enabled ?? false;

      if (totpEnabled) {
        // Return a partial response requiring 2FA verification
        // Sign a short-lived pre-auth token (5 min) for the 2FA step
        const jwt = await import('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET is not configured');
        const preAuthToken = jwt.default.sign(
          { userId: user.id, role: user.role, type: 'pre_auth_2fa' },
          secret,
          { algorithm: 'HS256', expiresIn: 300 },
        );

        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_2fa_required',
          ipAddress: clientIp,
          metadata: { email },
        });

        res.json({
          success: true,
          data: {
            requires2FA: true,
            preAuthToken,
            user: formatUserResponse(user),
          },
        });
        return;
      }

      // Force 2FA enrollment for admin/super_admin accounts that have not yet
      // configured TOTP. Issue a short-lived `pre_auth_2fa_setup` token that
      // grants access ONLY to /admin/2fa/setup and /admin/2fa/enable.
      if (user.role === 'admin' || user.role === 'super_admin') {
        const jwtSetup = await import('jsonwebtoken');
        const setupSecret = process.env.JWT_SECRET;
        if (!setupSecret) throw new Error('JWT_SECRET is not configured');
        const preAuthToken = jwtSetup.default.sign(
          { userId: user.id, role: user.role, type: 'pre_auth_2fa_setup' },
          setupSecret,
          { algorithm: 'HS256', expiresIn: 300 },
        );

        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_2fa_setup_required',
          ipAddress: clientIp,
          metadata: { email },
        });

        res.json({
          success: true,
          data: {
            requires2FASetup: true,
            preAuthToken,
            userId: user.id,
            user: formatUserResponse(user),
          },
        });
        return;
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

      // Bug 1251 fix: issue HttpOnly session + refresh cookies + JS-readable
      // CSRF cookie. CRIT-N11 fix: tokens are NO LONGER returned in the JSON
      // body — that defeated the HttpOnly defense (XSS could read them from
      // the response). Admin client must rely on the cookies only.
      await setAdminSessionCookies(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        adminUserId: user.id,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      res.json({
        success: true,
        data: {
          user: formatUserResponse(user),
          sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin 2FA: Verify TOTP code after password login ---
router.post(
  '/admin/2fa/verify',
  authRateLimit,
  // MED-N84 fix — Zod schema replaces inline manual checks.
  validationMiddleware(adminTwoFactorVerifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const { preAuthToken, totpCode } = req.body;

      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET is not configured');

      let payload: { userId: string; role: string; type?: string };
      try {
        payload = jwt.default.verify(preAuthToken, secret) as typeof payload;
      } catch {
        throw createAppError('Pre-auth token expired or invalid. Please login again.', 401);
      }

      if (payload.type !== 'pre_auth_2fa') {
        throw createAppError('Invalid token type.', 401);
      }

      const userResult = await db.query<{ id: string; totp_secret: string | null; totp_enabled: boolean; role: string }>(
        `SELECT id, totp_secret, totp_enabled, role FROM users WHERE id = $1 AND role IN ('admin', 'super_admin') AND is_active = TRUE`,
        [payload.userId],
      );

      if (userResult.rows.length === 0 || !userResult.rows[0]!.totp_secret || !userResult.rows[0]!.totp_enabled) {
        throw createAppError('2FA not configured for this account.', 400);
      }

      const user = userResult.rows[0]!;
      const decryptedSecret = decryptSecret(user.totp_secret!);
      const valid = verifyTotp(decryptedSecret, totpCode);
      if (!valid) {
        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_2fa_failed',
          ipAddress: clientIp,
          metadata: { reason: 'invalid_totp' },
        });
        throw createAppError('Invalid verification code. Please try again.', 401);
      }

      await db.query(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [user.id],
      );

      const tokens = await authService.createTokenPair(user.id, user.role);

      await securityService.recordLoginAttempt({
        phone: user.id,
        ipAddress: clientIp,
        attemptType: 'admin_login',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
      });
      await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'admin_login_2fa_verified',
        ipAddress: clientIp,
        metadata: {},
      });

      const fullUser = await db.query<UserProfileRow>(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at FROM users WHERE id = $1`,
        [user.id],
      );

      logger.info('Admin 2FA login', { userId: user.id });

      // Bug 1251 fix + CRIT-N11 fix: HttpOnly cookies only. Tokens removed
      // from response body (was an XSS exfil vector).
      await setAdminSessionCookies(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        adminUserId: user.id,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      res.json({
        success: true,
        data: {
          user: formatUserResponse(fullUser.rows[0]!),
          sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin 2FA: Setup (generate secret + QR URI) ---
router.post(
  '/admin/2fa/setup',
  adminAuthOrSetupToken,
  async (req: AdminSetupRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;

      if (role !== 'admin' && role !== 'super_admin') {
        throw createAppError('2FA setup is only available for admin accounts.', 403);
      }

      const userResult = await db.query<{ email: string | null; totp_enabled: boolean }>(
        `SELECT email, totp_enabled FROM users WHERE id = $1`,
        [userId],
      );

      if (userResult.rows.length === 0) throw createAppError('User not found.', 404);
      const user = userResult.rows[0]!;

      if (user.totp_enabled) {
        throw createAppError('2FA is already enabled. Disable it first to reconfigure.', 409);
      }

      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, user.email ?? userId);

      // MED-N82 fix — pre-fix: encryptedSecret was written via a bare
      // db.query with no audit trail. 2FA enrollment is a security-
      // sensitive event (the secret stored is what the admin's
      // authenticator app will use forever after). Post-fix: UPDATE +
      // admin_actions audit run in a single transaction. The admin_2fa
      // CHECK constraint already accepts 'admin_2fa_enrolled' (mig
      // 087); we re-use it here for the setup-initiated event since
      // setup is the de-facto enrollment step (verify just confirms).
      const encryptedSecret = encryptSecret(secret);
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE users SET totp_secret = $1, totp_enabled = FALSE, updated_at = NOW() WHERE id = $2`,
          [encryptedSecret, userId],
        );
        await client.query(
          `INSERT INTO admin_actions
             (admin_id, action_type, target_type, target_id, details)
           VALUES ($1, 'admin_2fa_enrolled', 'user', $2, $3::jsonb)`,
          [
            userId,
            userId,
            JSON.stringify({ phase: 'setup', enabled: false }),
          ],
        );
      });

      logger.info('Admin 2FA setup initiated', { userId });

      res.json({
        success: true,
        data: {
          secret,
          uri,
          message: 'Scan the QR code with your authenticator app, then verify with a code.',
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin 2FA: Enable (verify setup code to activate) ---
router.post(
  '/admin/2fa/enable',
  adminAuthOrSetupToken,
  async (req: AdminSetupRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;
      const { totpCode } = req.body;

      if (role !== 'admin' && role !== 'super_admin') {
        throw createAppError('2FA is only available for admin accounts.', 403);
      }

      if (typeof totpCode !== 'string' || !totpCode) {
        throw createAppError('Verification code is required.', 400);
      }

      const userResult = await db.query<{ totp_secret: string | null; totp_enabled: boolean }>(
        `SELECT totp_secret, totp_enabled FROM users WHERE id = $1`,
        [userId],
      );

      if (userResult.rows.length === 0) throw createAppError('User not found.', 404);
      const user = userResult.rows[0]!;

      if (user.totp_enabled) {
        throw createAppError('2FA is already enabled.', 409);
      }

      if (!user.totp_secret) {
        throw createAppError('Please call /auth/admin/2fa/setup first.', 400);
      }

      const decryptedEnableSecret = decryptSecret(user.totp_secret);
      const valid = verifyTotp(decryptedEnableSecret, totpCode);
      if (!valid) {
        throw createAppError('Invalid verification code. Please try again with a new code from your authenticator app.', 400);
      }

      await db.query(
        `UPDATE users SET totp_enabled = TRUE, updated_at = NOW() WHERE id = $1`,
        [userId],
      );

      logger.info('Admin 2FA enabled', { userId });

      // When enrolment was forced via the pre_auth_2fa_setup token, mint full
      // tokens so the admin completes login in one round-trip instead of being
      // forced to log in again and supply a code.
      if (req.isSetupToken) {
        const fullUser = await db.query<UserProfileRow>(
          `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at FROM users WHERE id = $1`,
          [userId],
        );
        await db.query(
          `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [userId],
        );
        const tokens = await authService.createTokenPair(userId, role);

        // Bug 1251 + CRIT-N11 fix: HttpOnly cookies only.
        await setAdminSessionCookies(res, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          adminUserId: userId,
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] as string | undefined,
        });

        res.json({
          success: true,
          data: {
            message: 'Two-factor authentication is now enabled.',
            user: formatUserResponse(fullUser.rows[0]!),
            sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Two-factor authentication is now enabled.' },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin: Refresh access token (cookie-based) ---
// Bug 1251 fix. Reads admin_refresh from a cookie (scoped path) and rotates
// both access + refresh, plus mints a new CSRF token. Returns the user
// payload only — tokens are returned only as cookies.
router.post(
  '/admin/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshFromCookie = (req as any).cookies?.admin_refresh as string | undefined;
      if (!refreshFromCookie) {
        throw createAppError('Missing admin refresh cookie.', 401);
      }

      const tokens = await authService.refreshAccessToken(refreshFromCookie);

      // Pull the user id+role+profile for the response and for the cookie.
      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET is not configured');
      const payload = jwt.default.verify(tokens.accessToken, secret) as {
        userId: string;
        role: string;
      };

      const userResult = await db.query<UserProfileRow>(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, created_at
         FROM users WHERE id = $1 AND role IN ('admin', 'super_admin') AND is_active = TRUE`,
        [payload.userId],
      );
      if (userResult.rows.length === 0) {
        throw createAppError('Admin account not found or deactivated.', 401);
      }
      const user = userResult.rows[0]!;

      // Revoke prior CSRF tokens for this admin so an old XSS-stolen token
      // cannot be replayed after the refresh boundary.
      await revokeAdminCsrfTokens(user.id);

      await setAdminSessionCookies(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        adminUserId: user.id,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      res.json({
        success: true,
        data: {
          user: formatUserResponse(user),
          sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin: Logout (cookie-based) ---
// Bug 1251 fix. Revokes the refresh token in the DB, marks all CSRF tokens
// for the admin as revoked, and clears the three admin cookies on the client.
router.post(
  '/admin/logout',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshFromCookie = (req as any).cookies?.admin_refresh as string | undefined;

      // Best-effort logout: revoke the specific refresh token the browser holds,
      // or all tokens for the user if no cookie is present.
      await authService.logout(userId, refreshFromCookie);
      await revokeAdminCsrfTokens(userId);
      clearAdminSessionCookies(res);

      logger.info('Admin logout', { userId });
      res.json({ success: true, data: { message: 'Logged out successfully.' } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Admin 2FA: Disable ---
router.post(
  '/admin/2fa/disable',
  authMiddleware,
  // MED-N84 fix — Zod schema replaces inline manual checks.
  validationMiddleware(adminTwoFactorDisableSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;
      const { totpCode } = req.body;

      if (role !== 'admin' && role !== 'super_admin') {
        throw createAppError('2FA is only available for admin accounts.', 403);
      }

      const userResult = await db.query<{ totp_secret: string | null; totp_enabled: boolean }>(
        `SELECT totp_secret, totp_enabled FROM users WHERE id = $1`,
        [userId],
      );

      if (userResult.rows.length === 0) throw createAppError('User not found.', 404);
      const user = userResult.rows[0]!;

      if (!user.totp_enabled || !user.totp_secret) {
        throw createAppError('2FA is not currently enabled.', 400);
      }

      const decryptedDisableSecret = decryptSecret(user.totp_secret);
      const valid = verifyTotp(decryptedDisableSecret, totpCode);
      if (!valid) {
        throw createAppError('Invalid verification code.', 401);
      }

      await db.query(
        `UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, updated_at = NOW() WHERE id = $1`,
        [userId],
      );

      logger.info('Admin 2FA disabled', { userId });

      res.json({
        success: true,
        data: { message: 'Two-factor authentication has been disabled.' },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
