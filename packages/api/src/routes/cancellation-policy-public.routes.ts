// packages/api/src/routes/cancellation-policy-public.routes.ts
//
// Bug 1170 / 1198 fix verified.
// Phase 14 Dispatch 02.
//
// Public read endpoint mounted at /api/v1/settings/cancellation-policy.
// No authentication required — the policy is shown on customer terms +
// help screens before login. Cached aggressively in the service layer
// (5-min Redis TTL); admin save handlers bust the cache so a tuning
// change is visible within seconds.

import { Router, Request, Response, NextFunction } from 'express';
import { getActivePolicy } from '../services/pricing/cancellation.service';

const router = Router();

router.get('/cancellation-policy', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await getActivePolicy();
    res.json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
});

export default router;
