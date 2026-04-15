import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import * as securityService from '../services/security.service';

const router = Router();

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

export default router;
