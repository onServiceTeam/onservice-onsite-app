import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { getClientIp } from '../middleware/ip-block.middleware';
import { adminChangePasswordSchema } from '../validators/auth.validators';
import * as securityService from '../services/security.service';
import * as passwordRotation from '../services/admin-password-rotation.service';
import * as authService from '../services/auth.service';
import { setAdminSessionCookies } from '../utils/admin-cookies';

const router = Router();

// LAUNCH-LIMITATIONS #12 — super_admin gate.
function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user?.role !== 'super_admin') {
    throw createAppError('super_admin role required.', 403);
  }
}

// --- User Device Management ---

router.get(
  '/devices',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const devices = await securityService.getUserDevices(req.user!.userId);
      res.json({
        success: true,
        data: devices.map(securityService.formatDeviceFingerprint),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/devices/:deviceId/trust',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const deviceId = String(req.params.deviceId ?? '');
      const updated = await securityService.trustDevice(
        req.user!.userId,
        deviceId,
      );
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { message: 'Device not found.', statusCode: 404 },
        });
        return;
      }
      res.json({ success: true, message: 'Device marked as trusted.' });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/devices/:deviceId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const deviceId = String(req.params.deviceId ?? '');
      const removed = await securityService.revokeDevice(
        req.user!.userId,
        deviceId,
      );
      if (!removed) {
        res.status(404).json({
          success: false,
          error: { message: 'Device not found.', statusCode: 404 },
        });
        return;
      }
      res.json({ success: true, message: 'Device removed.' });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// LAUNCH-LIMITATIONS #12 — admin password rotation endpoints.
// ─────────────────────────────────────────────────────────────────

// Operations telemetry — admin and super_admin can read. DPO accounts retain
// their own password/device controls but not workforce-wide security stats.
router.get(
  '/admin/legacy-password-stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== 'admin'
          && req.user?.role !== 'super_admin') {
        throw createAppError('admin tier role required.', 403);
      }
      const data = await passwordRotation.getLegacyPasswordStats();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// Bulk-flag — destructive in the sense that affected admins will be
// forced to rotate on next login. Super_admin only.
router.post(
  '/admin/flag-legacy-password-hashes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const data = await passwordRotation.flagLegacyHashesForRotation(req.user!.userId);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// Self-service password rotation — any admin-tier user can call this
// for their own account. Used by the admin web app's change-password
// screen, including when must_rotate_password forces a rotation.
router.post(
  '/admin/me/change-password',
  authMiddleware,
  validationMiddleware(adminChangePasswordSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await passwordRotation.changeOwnAdminPassword({
        userId: req.user!.userId,
        oldPassword: req.body.oldPassword as string,
        newPassword: req.body.newPassword as string,
      });

      // SEC-037 — the password transaction invalidates every prior session
      // generation. Issue one replacement session to this verified browser so
      // a legitimate operator is not stranded after securing the account.
      const tokens = await authService.createTokenPair(
        req.user!.userId,
        result.role,
        result.sessionVersion,
      );
      await setAdminSessionCookies(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        adminUserId: req.user!.userId,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      res.json({
        success: true,
        data: {
          message: 'Password updated. Other administrator sessions were signed out.',
          sessionVersion: result.sessionVersion,
          revokedRefreshSessions: result.revokedRefreshSessions,
        },
      });
    } catch (error) { next(error); }
  },
);

export default router;
