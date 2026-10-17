/**
 * D24 Option A: read-only status of Google address search for the admin
 * System Settings page (Dispatch & map). Mounted at /api/v1/admin/geo, before
 * the generic admin router (server.ts).
 *
 * Access: admin and super_admin, as for reading settings (settings.routes.ts).
 * authMiddleware also applies the admin cookie CSRF rule and the forced
 * password rotation. The answer says whether the server key is set (yes or
 * no), never the key; it holds counts and Google status words only, no
 * customer data.
 */
import { Router, type NextFunction, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { privateResponse } from '../middleware/private-response.middleware';
import { getAddressSearchStatus } from '../services/geo/address-search.service';

const router = Router();
router.use(privateResponse);
router.use(authMiddleware, rbacMiddleware('admin', 'super_admin'));

router.get('/address-search/status', (_req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  getAddressSearchStatus()
    .then((data) => { res.json({ success: true, data }); })
    .catch(next);
});

export default router;
