import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as securityService from '../services/security.service';
import * as passwordRotation from '../services/admin-password-rotation.service';

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

// Telemetry — anyone admin-tier can read; the count is non-sensitive.
router.get(
  '/admin/legacy-password-stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== 'admin'
          && req.user?.role !== 'super_admin'
          && req.user?.role !== 'dpo') {
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      await passwordRotation.changeOwnAdminPassword({
        userId: req.user!.userId,
        oldPassword,
        newPassword,
      });
      res.json({ success: true, message: 'Password updated.' });
    } catch (error) { next(error); }
  },
);

export default router;
