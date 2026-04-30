/**
 * Phase 14 Dispatch 08 — Bug 1366. Breach log routes.
 * DPO-only. Mounted at /api/v1/admin/breach-log.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireDpoRole } from '../middleware/require-dpo.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as breachLogService from '../services/breach-log.service';

const router = Router();

router.get('/', authMiddleware, requireDpoRole, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string'
      ? req.query.status as breachLogService.BreachStatus
      : undefined;
    const pendingNpcOnly = req.query.pendingNpcOnly === 'true';
    const data = await breachLogService.listBreaches({
      status,
      pendingNpcOnly,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/', authMiddleware, requireDpoRole, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const type = body.type;
    const scope = body.scope;
    const occurredAt = body.occurredAt;
    const discoveredAt = body.discoveredAt;
    if (typeof type !== 'string' || typeof scope !== 'string'
      || typeof occurredAt !== 'string' || typeof discoveredAt !== 'string') {
      throw createAppError('type, scope, occurredAt, discoveredAt are all required.', 400);
    }
    const data = await breachLogService.createBreach({
      type: type as breachLogService.BreachType,
      scope,
      affectedUserCount: typeof body.affectedUserCount === 'number' ? body.affectedUserCount : undefined,
      occurredAt,
      discoveredAt,
      reportedBy: req.user!.userId,
    });
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/:id/notify-npc', authMiddleware, requireDpoRole, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string | undefined;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!id) throw createAppError('Breach ID is required.', 400);
    if (typeof body.npcReference !== 'string') {
      throw createAppError('npcReference is required.', 400);
    }
    const data = await breachLogService.markNpcNotified({
      breachId: id,
      npcReference: body.npcReference,
      adminUserId: req.user!.userId,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.patch('/:id/status', authMiddleware, requireDpoRole, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string | undefined;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!id) throw createAppError('Breach ID is required.', 400);
    if (typeof body.status !== 'string') {
      throw createAppError('status is required.', 400);
    }
    const data = await breachLogService.updateBreachStatus({
      breachId: id,
      newStatus: body.status as breachLogService.BreachStatus,
      adminUserId: req.user!.userId,
      remediationSummary: typeof body.remediationSummary === 'string' ? body.remediationSummary : undefined,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
