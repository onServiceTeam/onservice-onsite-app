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

// BUG-PHASE158-01 fix — pre-fix breach-log routes had no length
// caps on scope, npcReference, remediationSummary. All three are
// TEXT columns (unbounded by Postgres). DPO-only access reduces
// the attack surface but doesn't eliminate it — same defense-in-
// depth pattern as Phase 152-157. Caps:
//   scope: 2000 chars (free-form description of affected data)
//   npcReference: 100 chars (preserve the exact regulator-issued reference)
//   remediationSummary: 5000 chars (free-form post-incident report)
const BREACH_SCOPE_MAX = 2000;
const BREACH_NPC_REFERENCE_MAX = 100;
const BREACH_REMEDIATION_MAX = 5000;

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
    // BUG-PHASE158-01 fix — cap scope length.
    if (scope.length > BREACH_SCOPE_MAX) {
      throw createAppError(`scope must be ≤ ${BREACH_SCOPE_MAX} characters.`, 400);
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
    // BUG-PHASE158-01 fix — cap npcReference length.
    if (body.npcReference.length > BREACH_NPC_REFERENCE_MAX) {
      throw createAppError(`npcReference must be ≤ ${BREACH_NPC_REFERENCE_MAX} characters.`, 400);
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
    // BUG-PHASE158-01 fix — cap remediationSummary length.
    if (typeof body.remediationSummary === 'string' && body.remediationSummary.length > BREACH_REMEDIATION_MAX) {
      throw createAppError(`remediationSummary must be ≤ ${BREACH_REMEDIATION_MAX} characters.`, 400);
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
