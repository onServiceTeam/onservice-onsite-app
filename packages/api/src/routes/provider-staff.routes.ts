/**
 * D23 Phase 4 — staff-member self-service routes. Mounted at /api/v1/staff.
 *
 * These are for the TEAM MEMBER's own account (not the provider owner, whose
 * team-management endpoints live under /api/v1/providers/staff). Any logged-in
 * user can look up + accept invites addressed to them; "my-jobs" is scoped to
 * the provider_staff role.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as providerStaffService from '../services/provider-staff.service';
import * as authService from '../services/auth.service';

const router = Router();

// Invites addressed to the logged-in user's phone/email.
router.get(
  '/my-invites',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await providerStaffService.listInvitesForUser(req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// Accept an invite: links this account, flips role to provider_staff, sends the
// member to back-office review, and returns a fresh token pair carrying the new
// role so the app can re-route immediately.
router.post(
  '/accept/:staffId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const staff = await providerStaffService.acceptInvite(req.params.staffId as string, userId);
      // Preserve the account's canonical session generation while minting the
      // post-acceptance role token. The role mismatch invalidates the caller's
      // former customer/provider token on its next request; inventing version 1
      // here would strand any account whose generation has already advanced.
      const tokens = await authService.createTokenPair(
        userId,
        'provider_staff',
        Number(req.user!.sessionVersion ?? 1),
      );
      res.json({
        success: true,
        data: {
          staff: providerStaffService.formatProviderStaff(staff),
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// The staff member's assigned jobs (read-only list).
router.get(
  '/my-jobs',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider_staff') {
        throw createAppError('Only team members can view assigned jobs.', 403);
      }
      const data = await providerStaffService.getAssignedJobsForUser(req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
