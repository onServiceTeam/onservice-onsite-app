import { Router, Request, Response, NextFunction } from 'express';
import { validationMiddleware } from '../middleware/validation.middleware';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authRateLimitMiddleware } from '../middleware/rate-limit.middleware';
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
import * as adminTwoFactorService from '../services/admin-2fa.service';
import { assertEmailSignInDeliveryConfigured } from '../services/email-sign-in.service';
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
  role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  session_version: number | string;
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

// Public, account-independent configuration discovery. This is not provider
// health, inbox acceptance, account eligibility or permission to skip a proof.
router.get('/methods', (_req: Request, res: Response) => {
  let emailCode: { enabled: boolean; captchaSiteKey?: string } = { enabled: false };
  try {
    // Reuse the producer's opt-in/sender guard; never invent a second flag.
    assertEmailSignInDeliveryConfigured();
    const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
    const secret = process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;
    if (siteKey && secret?.trim()) emailCode = { enabled: true, captchaSiteKey: siteKey };
  } catch {
    // Missing/disabled configuration has one shape, without private details.
  }
  res.set('Cache-Control', 'private, no-store');
  // end(), rather than send()/json(), avoids Express-generated ETags and 304
  // responses: callers always receive a newly evaluated configuration body.
  res.status(200).type('application/json').end(JSON.stringify({
    success: true, data: { phoneOtp: { supported: true }, emailCode },
  }));
});

// Custom middleware for the 2FA enrolment flow: accepts EITHER a normal admin
// access token OR a short-lived `pre_auth_2fa_setup` token issued by
// /admin/login when an admin lacks TOTP. Sets req.isSetupToken=true when the
// caller is using the setup token so the handler can mint full session tokens
// after successful enable.
interface AdminSetupRequest extends AuthenticatedRequest {
  isSetupToken?: boolean;
}

export function adminAuthOrSetupToken(
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
        // E01 / D15 — `dpo` added for NPC RA 10173 §21 segregation.
        // D23 — `provider_staff` team-member login.
        role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';
        sessionVersion?: number;
        type?: string;
        iat: number;
        exp: number;
      };
      // E01 / D15 — admin tier roles include 'dpo'. They share the
      // 2FA setup + admin login flow.
      const ADMIN_TIER = new Set(['admin', 'super_admin', 'dpo']);
      const canonical = await db.query<{
        role: UserProfileRow['role'];
        is_active: boolean;
        session_version: number | string;
        must_rotate_password: boolean | null;
      }>(
        `SELECT role, is_active, session_version,
                COALESCE(must_rotate_password, FALSE) AS must_rotate_password
           FROM users
          WHERE id = $1`,
        [payload.userId],
      );
      const account = canonical.rows[0];
      const tokenVersion = Number(payload.sessionVersion ?? 1);
      const currentVersion = Number(account?.session_version);
      if (!account?.is_active
          || account.role !== payload.role
          || !Number.isSafeInteger(tokenVersion)
          || tokenVersion < 1
          || !Number.isSafeInteger(currentVersion)
          || currentVersion < 1
          || tokenVersion !== currentVersion) {
        next(createAppError('This authentication session has been revoked. Please login again.', 401));
        return;
      }
      if (payload.type === 'pre_auth_2fa_setup') {
        if (!ADMIN_TIER.has(account.role)) {
          next(createAppError('Admin role required.', 403));
          return;
        }
        req.user = {
          userId: payload.userId,
          role: account.role,
          sessionVersion: currentVersion,
          iat: payload.iat,
          exp: payload.exp,
        };
        req.isSetupToken = true;
        next();
        return;
      }
      if (payload.type !== undefined && payload.type !== 'access') {
        next(createAppError('Invalid authentication token.', 401));
        return;
      }
      if (!ADMIN_TIER.has(account.role)) {
        next(createAppError('Admin role required.', 403));
        return;
      }
      // SEC-042 — a normal admin session must obey the same forced-password
      // precondition as every other API. The dedicated setup token remains
      // allowed above because first login intentionally completes TOTP setup
      // before issuing the rotation-flagged full session.
      if (account.must_rotate_password === true) {
        const rotationRequired = createAppError(
          'Password rotation is required before continuing.',
          428,
        );
        rotationRequired.code = 'password_rotation_required';
        next(rotationRequired);
        return;
      }
      req.user = {
        userId: payload.userId,
        role: account.role,
        sessionVersion: currentVersion,
        iat: payload.iat,
        exp: payload.exp,
      };
      req.isSetupToken = false;
      next();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TokenExpiredError' || name === 'JsonWebTokenError' || name === 'NotBeforeError') {
        next(createAppError('Invalid or expired authentication token.', 401));
        return;
      }
      logger.error('Admin setup session canonical-state lookup failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      next(createAppError('Unable to validate the authentication session.', 500));
    }
  })();
}

router.post(
  '/send-otp',
  authRateLimitMiddleware,
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
  authRateLimitMiddleware,
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
      // LL#12 — also pull must_rotate_password so a hydrating admin
      // session can route the user to the change-password screen
      // even on app reload (not just at login). COALESCE keeps the
      // response valid against pre-mig-116 databases.
      const result = await db.query<UserProfileRow & { must_rotate_password: boolean | null }>(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                is_verified, is_active, created_at,
                COALESCE(must_rotate_password, FALSE) AS must_rotate_password
         FROM users WHERE id = $1`,
        [req.user!.userId],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'User not found.', statusCode: 404 } });
        return;
      }

      const row = result.rows[0]!;
      res.json({
        success: true,
        data: {
          ...formatUserResponse(row),
          mustRotatePassword: row.must_rotate_password === true,
        },
      });
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
      const { firstName, lastName } = req.body;
      if (firstName === undefined && lastName === undefined) {
        res.status(400).json({ success: false, error: { message: 'No fields to update.', statusCode: 400 } });
        return;
      }

      // OPS-371 — customer/provider identity edits and their before/after
      // evidence commit together. The dormant response-after-send audit
      // prototype cannot guarantee this, so the canonical writer owns it.
      const updated = await db.transaction(async (client) => {
        const beforeResult = await client.query<UserProfileRow>(
          `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                  is_verified, is_active, session_version, created_at
             FROM users
            WHERE id = $1
            FOR UPDATE`,
          [req.user!.userId],
        );
        const before = beforeResult.rows[0];
        if (!before) throw createAppError('User not found.', 404);

        const nextFirstName = firstName ?? before.first_name;
        const nextLastName = lastName ?? before.last_name;
        if (nextFirstName === before.first_name && nextLastName === before.last_name) {
          return before;
        }

        const updateResult = await client.query<UserProfileRow>(
          `UPDATE users
              SET first_name = $1,
                  last_name = $2,
                  updated_at = NOW()
            WHERE id = $3
          RETURNING id, phone, email, first_name, last_name, role, avatar_url,
                    is_verified, is_active, session_version, created_at`,
          [nextFirstName, nextLastName, req.user!.userId],
        );
        const row = updateResult.rows[0];
        if (!row) throw createAppError('User not found.', 404);

        const auditResult = await client.query<{ id: string }>(
          `INSERT INTO audit_log
             (user_id, action, entity_type, entity_id, old_values, new_values,
              ip_address, user_agent)
           VALUES ($1, 'user_profile_updated', 'users', $1, $2::jsonb, $3::jsonb,
                   $4::inet, $5)
           RETURNING id`,
          [
            req.user!.userId,
            JSON.stringify({ firstName: before.first_name, lastName: before.last_name }),
            JSON.stringify({ firstName: row.first_name, lastName: row.last_name }),
            req.ip ?? null,
            req.headers['user-agent'] ?? null,
          ],
        );
        if (!auditResult.rows[0]?.id) {
          throw createAppError('Unable to record the profile change.', 500);
        }
        return row;
      });

      res.json({ success: true, data: formatUserResponse(updated) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/login',
  authRateLimitMiddleware,
  // MED-N84 fix — Zod schema replaces the inline manual type checks
  // for consistency with the rest of the routes.
  validationMiddleware(adminLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const { email, password } = req.body;
      const accountEmail = email.toLowerCase().trim();

      // Account-scoped brute-force lockout, independent of source IP. The IP
      // limiter + IP auto-block do nothing against an attacker rotating source
      // IPs (botnet / proxy pool) at one admin email. checkOtpLockout only
      // covers attempt_type IN ('otp_send','otp_verify'), so admin_login needs
      // its own per-account counter. Failed rows are already written via
      // recordLoginAttempt below; here we only read/enforce. Respect the
      // relaxed-test flag the same way checkOtpLockout does so QA isn't blocked.
      const ADMIN_LOGIN_LOCKOUT_THRESHOLD = 8;
      if (!platformConfig.rateLimitsRelaxed) {
        const failed = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM login_attempts
           WHERE phone = $1 AND attempt_type = 'admin_login' AND success = FALSE
             AND created_at > NOW() - INTERVAL '15 minutes'`,
          [accountEmail],
        );
        if (Number(failed.rows[0]?.count ?? 0) >= ADMIN_LOGIN_LOCKOUT_THRESHOLD) {
          // Reuse the whitelisted admin_login_failed event type (the
          // security_events.event_type CHECK constraint doesn't allow a new
          // value without a migration); the lockout is flagged in metadata.
          await securityService.logSecurityEvent({
            eventType: 'admin_login_failed',
            ipAddress: clientIp,
            metadata: { email: accountEmail, reason: 'account_lockout', scope: 'account' },
          });
          throw createAppError(
            'Too many failed login attempts for this account. Please try again later.',
            429,
          );
        }
      }

      // E01 / D15 — admin login flow accepts admin, super_admin, AND dpo.
      // The DPO is a real role with NPC RA 10173 §21 segregation; they
      // log in via the admin tier and reach DPO-scope routes via
      // requireDpoRole.
      // LAUNCH-LIMITATIONS #12 — also pull must_rotate_password so the
      // success response can flag forced-rotation. Defaults to FALSE
      // for legacy rows where mig 116 hasn't applied yet.
      const result = await db.query<
        UserProfileRow & { password_hash: string | null; must_rotate_password: boolean | null }
      >(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                is_verified, is_active, created_at, password_hash,
                session_version,
                COALESCE(must_rotate_password, FALSE) AS must_rotate_password
         FROM users WHERE email = $1 AND role IN ('admin', 'super_admin', 'dpo')`,
        [accountEmail],
      );

      if (result.rows.length === 0) {
        await securityService.recordLoginAttempt({
          phone: accountEmail,
          ipAddress: clientIp,
          attemptType: 'admin_login',
          success: false,
          userAgent: req.headers['user-agent'] as string | undefined,
        });
        await securityService.logSecurityEvent({
          eventType: 'admin_login_failed',
          ipAddress: clientIp,
          metadata: { email: accountEmail, reason: 'user_not_found' },
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
          phone: accountEmail,
          ipAddress: clientIp,
          attemptType: 'admin_login',
          success: false,
          userAgent: req.headers['user-agent'] as string | undefined,
        });
        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_failed',
          ipAddress: clientIp,
          metadata: { email: accountEmail, reason: 'invalid_password' },
        });
        throw createAppError('Invalid email or password.', 401);
      }

      // Opportunistic password rehash to migrate legacy/weaker scrypt params
      // to the current cost factor. Best-effort — never block login on failure.
      if (verifyOutcome.needsRehash) {
        try {
          const newHash = authService.hashPassword(password);
          // SEC-072: this is an upgrade of the hash we verified, not a new
          // password choice. A concurrent password replacement (or another
          // completed upgrade) owns its newer hash and must not be overwritten.
          await db.query(
            `UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash = $3`,
            [newHash, user.id, user.password_hash],
          );
        } catch (err) {
          logger.warn('opportunistic password rehash failed', { err: String(err) });
        }
      }

      // ADMIN_DISABLE_2FA escape hatch (default OFF = secure). When set, admin
      // login is email + password only: both the TOTP-verify and the forced-
      // enrollment branches below are skipped and a session is issued directly.
      // Intended for staging/testing or until SMS/email admin 2FA is built.
      // MUST be re-enabled (or replaced) before production — see
      // LAUNCH-LIMITATIONS. Loud warning so it can never be silently on in prod.
      const twoFaDisabled =
        process.env.ADMIN_DISABLE_2FA === '1' || process.env.ADMIN_DISABLE_2FA === 'true';
      if (twoFaDisabled) {
        logger.warn('ADMIN_DISABLE_2FA is active — admin login is password-only', {
          email: accountEmail, nodeEnv: process.env.NODE_ENV,
        });
      }

      // Check if 2FA is enabled — require TOTP verification before issuing tokens
      const totpResult = await db.query<{ totp_enabled: boolean }>(
        `SELECT totp_enabled FROM users WHERE id = $1`,
        [user.id],
      );
      const totpEnabled = totpResult.rows[0]?.totp_enabled ?? false;

      if (totpEnabled && !twoFaDisabled) {
        // Return a partial response requiring 2FA verification.
        // 10-min pre-auth window — enough time to open the authenticator and
        // type a code without the token expiring mid-flow.
        const jwt = await import('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET is not configured');
        const preAuthToken = jwt.default.sign(
          {
            userId: user.id,
            role: user.role,
            sessionVersion: Number(user.session_version),
            type: 'pre_auth_2fa',
          },
          secret,
          { algorithm: 'HS256', expiresIn: 600 },
        );

        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_2fa_required',
          ipAddress: clientIp,
          metadata: { email: accountEmail },
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

      // Force 2FA enrollment for admin tier accounts that have not yet
      // configured TOTP. Issue a short-lived `pre_auth_2fa_setup` token that
      // grants access ONLY to /admin/2fa/setup and /admin/2fa/enable.
      // E01 / D15 — DPO is in the admin tier and must enroll TOTP too.
      // Skipped entirely when ADMIN_DISABLE_2FA is set (password-only login).
      if (!twoFaDisabled && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'dpo')) {
        const jwtSetup = await import('jsonwebtoken');
        const setupSecret = process.env.JWT_SECRET;
        if (!setupSecret) throw new Error('JWT_SECRET is not configured');
        // 30-min setup window — first-time enrollment (install/open an
        // authenticator app, add the key, sync time) routinely takes longer
        // than 5 minutes, especially on an emulator. A short token here was
        // causing "Invalid or expired authentication token" before the admin
        // could finish.
        const preAuthToken = jwtSetup.default.sign(
          {
            userId: user.id,
            role: user.role,
            sessionVersion: Number(user.session_version),
            type: 'pre_auth_2fa_setup',
          },
          setupSecret,
          { algorithm: 'HS256', expiresIn: 1800 },
        );

        await securityService.logSecurityEvent({
          userId: user.id,
          eventType: 'admin_login_2fa_setup_required',
          ipAddress: clientIp,
          metadata: { email: accountEmail },
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

      const tokens = await authService.createTokenPair(
        user.id,
        user.role,
        Number(user.session_version),
      );

      await securityService.recordLoginAttempt({
        phone: accountEmail,
        ipAddress: clientIp,
        attemptType: 'admin_login',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
      });
      await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'admin_login',
        ipAddress: clientIp,
        metadata: { email: accountEmail },
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
          // LAUNCH-LIMITATIONS #12 — when TRUE the admin web app
          // routes straight to the change-password screen and gates
          // every other route until the rotation lands.
          mustRotatePassword: user.must_rotate_password === true,
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
  authRateLimitMiddleware,
  // MED-N84 fix — Zod schema replaces inline manual checks.
  validationMiddleware(adminTwoFactorVerifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const { preAuthToken, totpCode, backupCode } = req.body;

      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET is not configured');

      let payload: { userId: string; role: string; sessionVersion?: number; type?: string };
      try {
        payload = jwt.default.verify(preAuthToken, secret) as typeof payload;
      } catch {
        throw createAppError('Pre-auth token expired or invalid. Please login again.', 401);
      }

      if (payload.type !== 'pre_auth_2fa') {
        throw createAppError('Invalid token type.', 401);
      }

      // BUG-PHASE23-03 fix: also select `phone` so the recordLoginAttempt
      // call below can pass a value that fits in login_attempts.phone
      // (varchar(15)). Pre-fix passed `user.id` (a 36-char UUID) which
      // crashed with "value too long for type character varying(15)" —
      // 2FA verify always 500'd on success, blocking admin tier login
      // entirely. Now we pass the user's actual phone (PH format = 13 chars).
      // OPS-531/532: serialize with account revocation before verifying the
      // current factor. Recovery use, its audit and login metadata must commit
      // together; otherwise a refused/failed login can spend a recovery code.
      const { user, verificationMethod, backupCodesRemaining } = await db.transaction(async client => {
        const userResult = await client.query<{
          id: string;
          phone: string | null;
          totp_secret: string | null;
          totp_enabled: boolean;
          role: string;
          is_active: boolean;
          session_version: number | string;
        }>(
          `SELECT id, phone, totp_secret, totp_enabled, role, is_active, session_version
             FROM users
            WHERE id = $1
            FOR NO KEY UPDATE`,
          [payload.userId],
        );

        const user = userResult.rows[0];
        const currentVersion = Number(user?.session_version);
        const proofVersion = Number(payload.sessionVersion ?? 1);
        if (!user?.is_active || !['admin', 'super_admin', 'dpo'].includes(user.role)
            || user.role !== payload.role
            || !Number.isSafeInteger(currentVersion) || currentVersion < 1
            || !Number.isSafeInteger(proofVersion) || proofVersion < 1
            || currentVersion !== proofVersion) {
          throw createAppError('This authentication session has been revoked. Please login again.', 401);
        }
        if (!user.totp_secret || !user.totp_enabled) {
          throw createAppError('2FA not configured for this account.', 400);
        }
        let verificationMethod: 'totp' | 'backup_code' = 'totp';
        let backupCodesRemaining: number | undefined;
        if (backupCode) {
          verificationMethod = 'backup_code';
          const consumed = await adminTwoFactorService.consumeBackupCodeInTransaction(
            client,
            user.id,
            backupCode as string,
            clientIp,
          );
          backupCodesRemaining = consumed.remainingCodes;
        } else {
          const decryptedSecret = decryptSecret(user.totp_secret!);
          // window=2 (±60s) tolerates moderate device clock drift (common on
          // emulators) without meaningfully weakening 2FA (lockout + rate limit
          // still bound brute force).
          const valid = verifyTotp(decryptedSecret, totpCode as string, 2);
          if (!valid) {
            await securityService.logSecurityEvent({
              userId: user.id,
              eventType: 'admin_2fa_failed',
              ipAddress: clientIp,
              metadata: { reason: 'invalid_totp' },
            });
            throw createAppError('Invalid verification code. Please try again.', 401);
          }
        }

        await client.query(
          `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [user.id],
        );
        return { user, verificationMethod, backupCodesRemaining };
      });

      // Issuance retains its separate current-account/generation check. This
      // boundary is not durable E68 acknowledgement or atomic cookie delivery;
      // a later revocation/issuer failure can still follow factor consumption.
      const tokens = await authService.createTokenPair(
        user.id,
        user.role,
        Number(user.session_version),
      );

      // BUG-PHASE23-03 fix: pass user.phone (varchar(15) compatible),
      // not user.id (36-char UUID overflows). Truncate defensively if
      // phone is unexpectedly missing/long for any user row.
      await securityService.recordLoginAttempt({
        phone: (user.phone ?? '').slice(0, 15),
        ipAddress: clientIp,
        attemptType: 'admin_login',
        success: true,
        userAgent: req.headers['user-agent'] as string | undefined,
      });
      await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'admin_login_2fa_verified',
        ipAddress: clientIp,
        metadata: {
          verificationMethod,
          ...(backupCodesRemaining !== undefined ? { backupCodesRemaining } : {}),
        },
      });

      // LAUNCH-LIMITATIONS #12 — pull must_rotate_password so the
      // post-2FA response can flag forced rotation. Same shape as the
      // password-only login branch above.
      const fullUser = await db.query<
        UserProfileRow & { must_rotate_password: boolean | null }
      >(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                is_verified, is_active, created_at, session_version,
                COALESCE(must_rotate_password, FALSE) AS must_rotate_password
         FROM users WHERE id = $1`,
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
          mustRotatePassword: fullUser.rows[0]?.must_rotate_password === true,
          ...(backupCodesRemaining !== undefined ? { backupCodesRemaining } : {}),
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

      // E01 / D15 — admin tier (admin, super_admin, dpo) all require 2FA.
      if (role !== 'admin' && role !== 'super_admin' && role !== 'dpo') {
        throw createAppError('2FA setup is only available for admin accounts.', 403);
      }

      const { secret, uri } = await db.transaction(async (client) => {
        // OPS-527/528: authorize the exact earlier proof under the account
        // lock, then check enrollment state before replacing the pending key.
        // A delayed request cannot upgrade its authority or undo activation.
        const userResult = await client.query<{
          email: string | null; totp_enabled: boolean; role: string;
          is_active: boolean; session_version: number | string;
          must_rotate_password: boolean;
        }>(
          `SELECT email, totp_enabled, role, is_active, session_version,
                  COALESCE(must_rotate_password, FALSE) AS must_rotate_password
             FROM users WHERE id = $1 FOR NO KEY UPDATE`,
          [userId],
        );
        const user = userResult.rows[0];
        const currentVersion = Number(user?.session_version);
        if (!user?.is_active || user.role !== role
            || !Number.isSafeInteger(currentVersion) || currentVersion < 1
            || currentVersion !== req.user!.sessionVersion) {
          throw createAppError('This authentication session has been revoked. Please login again.', 401);
        }
        if (!req.isSetupToken && user.must_rotate_password) {
          const rotationRequired = createAppError('Password rotation is required before continuing.', 428);
          rotationRequired.code = 'password_rotation_required';
          throw rotationRequired;
        }
        if (user.totp_enabled) {
          throw createAppError('2FA is already enabled. Sign in or contact support for recovery.', 409);
        }

        const secret = generateTotpSecret();
        const uri = generateTotpUri(secret, user.email ?? userId);
        const encryptedSecret = encryptSecret(secret);
        // MED-N82: pending key and enrollment audit still commit together.
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
        return { secret, uri };
      });

      logger.info('Admin 2FA setup initiated', { userId });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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

      // E01 / D15 — admin tier (admin, super_admin, dpo) all enable 2FA.
      if (role !== 'admin' && role !== 'super_admin' && role !== 'dpo') {
        throw createAppError('2FA is only available for admin accounts.', 403);
      }

      if (typeof totpCode !== 'string' || !totpCode) {
        throw createAppError('Verification code is required.', 400);
      }

      // OPS-529/530: the earlier authorized account and the key whose code
      // is verified must remain the same through activation. Lock account
      // before recovery rows, just as setup locks it before replacing a key.
      const { backupBundle, canonicalUser } = await db.transaction(async (client) => {
        const userResult = await client.query<UserProfileRow & {
          totp_secret: string | null; totp_enabled: boolean; must_rotate_password: boolean;
        }>(
          `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                  is_verified, is_active, created_at, session_version,
                  totp_secret, totp_enabled,
                  COALESCE(must_rotate_password, FALSE) AS must_rotate_password
             FROM users WHERE id = $1 FOR NO KEY UPDATE`,
          [userId],
        );
        const user = userResult.rows[0];
        const currentVersion = Number(user?.session_version);
        if (!user?.is_active || user.role !== role
            || !Number.isSafeInteger(currentVersion) || currentVersion < 1
            || currentVersion !== req.user!.sessionVersion) {
          throw createAppError('This authentication session has been revoked. Please login again.', 401);
        }
        if (!req.isSetupToken && user.must_rotate_password) {
          const rotationRequired = createAppError('Password rotation is required before continuing.', 428);
          rotationRequired.code = 'password_rotation_required';
          throw rotationRequired;
        }
        if (user.totp_enabled) throw createAppError('2FA is already enabled.', 409);
        if (!user.totp_secret) throw createAppError('Please call /auth/admin/2fa/setup first.', 400);

        const decryptedEnableSecret = decryptSecret(user.totp_secret);
        // Preserve the existing ±60s enrollment clock-drift window.
        if (!verifyTotp(decryptedEnableSecret, totpCode, 2)) {
          throw createAppError('Invalid verification code. Please try again with a new code from your authenticator app.', 400);
        }

        // SEC-038: activation and the eight recovery codes still commit
        // together. A failed recovery write cannot leave an enabled factor.
        const enabled = await client.query(
          `UPDATE users
              SET totp_enabled = TRUE,
                  updated_at = NOW()
            WHERE id = $1
              AND totp_enabled = FALSE`,
          [userId],
        );
        if ((enabled.rowCount ?? 0) !== 1) {
          throw createAppError('2FA is already enabled.', 409);
        }
        const bundle = await adminTwoFactorService.generateBackupCodesInTransaction(client, userId);
        if (req.isSetupToken) {
          await client.query(
            `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [userId],
          );
        }
        return { backupBundle: bundle, canonicalUser: user };
      });

      logger.info('Admin 2FA enabled', { userId });
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

      // When enrolment was forced via the pre_auth_2fa_setup token, mint full
      // tokens so the admin completes login in one round-trip instead of being
      // forced to log in again and supply a code.
      if (req.isSetupToken) {
        // Bind issuance to the account authorized above, not a later read
        // that could upgrade an old proof to a new role/session generation.
        // Issuance still independently rejects revocation after activation.
        // Interrupted delivery/acknowledgement remains the E68 workflow.
        const tokens = await authService.createTokenPair(
          userId,
          canonicalUser.role,
          Number(canonicalUser.session_version),
        );

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
            user: formatUserResponse(canonicalUser),
            mustRotatePassword: canonicalUser.must_rotate_password === true,
            sessionExpiresAt: new Date(Date.now() + platformConfig.adminSessionTimeoutHours * 3600 * 1000).toISOString(),
            backupCodes: backupBundle.codes,
            backupCodesGeneratedAt: backupBundle.generatedAt,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          message: 'Two-factor authentication is now enabled.',
          backupCodes: backupBundle.codes,
          backupCodesGeneratedAt: backupBundle.generatedAt,
        },
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
        `SELECT id, phone, email, first_name, last_name, role, avatar_url, is_verified, is_active, session_version, created_at
         FROM users WHERE id = $1 AND role IN ('admin', 'super_admin', 'dpo') AND is_active = TRUE`,
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

// --- Admin 2FA: Disable (launch-held) ---
router.post(
  '/admin/2fa/disable',
  authMiddleware,
  // MED-N84 fix — Zod schema replaces inline manual checks.
  validationMiddleware(adminTwoFactorDisableSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const role = req.user!.role;

      // E01 / D15 — admin tier (admin, super_admin, dpo) all manage 2FA.
      if (role !== 'admin' && role !== 'super_admin' && role !== 'dpo') {
        throw createAppError('2FA is only available for admin accounts.', 403);
      }

      // SEC-043 — factor removal is a privileged-account recovery transition,
      // not a profile toggle. Keep the public route fail-closed until the
      // governed recovery authority, audit, session revocation, and last-seat
      // invariants are approved. No account or factor state is read or written.
      const held = createAppError(
        'Administrator recovery changes are unavailable until the governed recovery workflow is enabled.',
        409,
      );
      held.code = 'privileged_recovery_policy_required';
      throw held;
    } catch (error) {
      next(error);
    }
  },
);

export default router;
