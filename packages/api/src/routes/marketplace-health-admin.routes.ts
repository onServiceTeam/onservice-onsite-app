// D38 Milestone 3 (Ken, 2026-10-13): back-office marketplace insights and
// request alerts. Mounted at /api/v1/admin/marketplace-health, before the
// generic admin router (server.ts).
//
// Access: admin and super_admin only (E34: dpo is not an operations role, and
// customers and providers never reach it). authMiddleware also enforces CSRF
// for the admin_session cookie and the forced password rotation. Provider
// phone numbers are masked for every role except super_admin; calling a
// provider goes through the audit-logged POST /admin/providers/:id/reveal-contact.
// Everything here reads, except acknowledging an alert, which writes that
// alert row and one audit row (marketplace_alert_acknowledged).

import { Router, type NextFunction, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { privateResponse } from '../middleware/private-response.middleware';
import * as healthService from '../services/marketplace-health.service';
import * as alertService from '../services/marketplace-alert.service';
import {
  acknowledgeBodySchema, alertsQuerySchema, idParamsSchema, lostOpportunitiesQuerySchema,
  openRequestsQuerySchema, providersQuerySchema, responseTimesQuerySchema,
  type AcknowledgeBody, type AlertsQuery, type LostOpportunitiesQuery, type OpenRequestsQuery,
  type ProvidersQuery, type ResponseTimesQuery,
} from '../validators/marketplace-health.validators';

const router = Router();
router.use(privateResponse);
router.use(authMiddleware, rbacMiddleware('admin', 'super_admin'));

type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>;
const handle = (fn: Handler) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

router.get('/summary', handle(async (_req, res) => {
  res.json({ success: true, data: await healthService.getMarketplaceSummary() });
}));

router.get('/open-requests', validationMiddleware({ query: openRequestsQuerySchema }), handle(async (req, res) => {
  const query = req.query as unknown as OpenRequestsQuery;
  const { requests, policy } = await healthService.getOpenRequests({ limit: query.limit });
  res.json({
    success: true,
    data: requests,
    meta: {
      amberMinutes: policy.amberMinutes,
      redMinutes: policy.redMinutes,
      maxRounds: policy.maxRounds,
      generatedAt: new Date().toISOString(),
    },
  });
}));

router.get('/response-times', validationMiddleware({ query: responseTimesQuerySchema }), handle(async (req, res) => {
  const query = req.query as unknown as ResponseTimesQuery;
  const range = healthService.resolveManilaRange(query);
  const result = await healthService.getResponseTimes(range, query.groupBy);
  res.json({ success: true, data: result.groups, meta: { overall: result.overall, ...range, groupBy: query.groupBy } });
}));

router.get('/lost-opportunities', validationMiddleware({ query: lostOpportunitiesQuerySchema }), handle(async (req, res) => {
  const query = req.query as unknown as LostOpportunitiesQuery;
  const range = healthService.resolveManilaRange(query);
  const result = await healthService.getLostOpportunities(range, {
    reason: query.reason, page: query.page, pageSize: query.pageSize,
  });
  res.json({
    success: true,
    data: result.rows,
    meta: { summary: result.summary, total: result.total, page: query.page, pageSize: query.pageSize, ...range },
  });
}));

router.get('/providers', validationMiddleware({ query: providersQuerySchema }), handle(async (req, res) => {
  const query = req.query as unknown as ProvidersQuery;
  const range = healthService.resolveManilaRange(query);
  const result = await healthService.getProviderResponsiveness(range, {
    sort: query.sort, page: query.page, pageSize: query.pageSize, actorRole: req.user!.role,
  });
  res.json({
    success: true,
    data: result.rows,
    meta: { total: result.total, page: query.page, pageSize: query.pageSize, sort: query.sort, ...range },
  });
}));

router.get('/coverage', handle(async (_req, res) => {
  res.json({ success: true, data: await healthService.getCoverageGrid() });
}));

router.get('/alerts', validationMiddleware({ query: alertsQuerySchema }), handle(async (req, res) => {
  const query = req.query as unknown as AlertsQuery;
  const result = await alertService.listAlerts({ status: query.status, limit: query.limit });
  res.json({ success: true, data: result.alerts, meta: result.meta });
}));

router.post(
  '/alerts/:id/acknowledge',
  validationMiddleware({ params: idParamsSchema, body: acknowledgeBodySchema }),
  handle(async (req, res) => {
    const body = req.body as AcknowledgeBody;
    const alert = await alertService.acknowledgeAlert({
      alertId: req.params.id as string,
      adminId: req.user!.userId,
      note: body.note ?? null,
    });
    res.json({ success: true, data: alert });
  }),
);

router.get(
  '/bookings/:id/invites',
  validationMiddleware({ params: idParamsSchema }),
  handle(async (req, res) => {
    const result = await healthService.getRequestInvites(req.params.id as string, req.user!.role);
    res.json({
      success: true,
      data: result.invites,
      meta: { applicable: result.applicable, currentRound: result.currentRound },
    });
  }),
);

export default router;
