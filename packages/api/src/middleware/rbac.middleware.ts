import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { createAppError } from './error.middleware';

// E01 / D15 (2026-05-02) — `dpo` added for NPC RA 10173 §21 segregation.
type UserRole = 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo';

/**
 * Role-based access control middleware.
 * Restricts access to specific user roles.
 */
export function rbacMiddleware(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createAppError('Authentication required.', 401));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(createAppError('You do not have permission to perform this action.', 403));
      return;
    }

    next();
  };
}
