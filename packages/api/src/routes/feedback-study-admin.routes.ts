// Tester feedback version 2, admin routes (mounted at /api/v1/admin/feedback/v2,
// before the version 1 router so "v2" is never read as a submission id).

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { publicStudy } from '../config/feedback-study';
import * as service from '../services/feedback-study-admin.service';

const router = Router();
router.use(authMiddleware, rbacMiddleware('admin', 'super_admin'));

const idParams = z.object({ id: z.string().uuid() }).strict();
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const problemsQuery = z.object({
  ...pageQuery,
  status: z.enum(service.PROBLEM_STATUSES).optional(),
  severity: z.enum(['stopped', 'slowed', 'annoyed', 'looks_wrong']).optional(),
  screenKey: z.string().regex(/^[a-z0-9_]{1,60}$/).optional(),
}).strict();
const sessionsQuery = z.object(pageQuery).strict();
const screenshotParams = z.object({
  id: z.string().uuid(),
  filename: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/),
}).strict();
const triageBody = z.object({
  status: z.enum(service.PROBLEM_STATUSES),
  assignedAdminId: z.string().uuid().nullable().default(null),
  duplicateOf: z.string().uuid().nullable().default(null),
  note: z.string().trim().min(10).max(2000),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
const eraseBody = z.object({ note: z.string().trim().min(10).max(2000) }).strict();
const sessionStatusBody = z.object({
  dismissed: z.boolean(),
  note: z.string().trim().min(10).max(2000),
}).strict();

type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>;
const handle = (fn: Handler) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

router.get('/study', handle(async (_req, res) => {
  res.json({ success: true, data: publicStudy() });
}));

router.get('/overview', handle(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.feedbackOverview() });
}));

router.get('/problems', validationMiddleware({ query: problemsQuery }), handle(async (req, res) => {
  const query = req.query as unknown as z.infer<typeof problemsQuery>;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.listProblems({ ...query, role: req.user!.role }) });
}));

router.patch('/problems/:id', validationMiddleware({ params: idParams, body: triageBody }), handle(async (req, res) => {
  const body = req.body as z.infer<typeof triageBody>;
  const data = await service.triageProblem({
    entryId: req.params.id as string, adminId: req.user!.userId, actorRole: req.user!.role, ...body,
  });
  res.json({ success: true, data });
}));

router.get('/problems/:id/history', validationMiddleware({ params: idParams }), handle(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.problemHistory(req.params.id as string, req.user!.role) });
}));

router.get('/entries/:id/screenshots/:filename', validationMiddleware({ params: screenshotParams }), handle(async (req, res) => {
  const stream = await service.getEntryScreenshotForAdmin(req.params.id as string, req.params.filename as string);
  res.setHeader('Content-Type', stream.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (stream.contentLength != null) res.setHeader('Content-Length', String(stream.contentLength));
  await new Promise<void>((resolve, reject) => {
    stream.body.on('error', reject);
    res.on('finish', resolve);
    stream.body.pipe(res);
  });
}));

router.get('/sessions', validationMiddleware({ query: sessionsQuery }), handle(async (req, res) => {
  const query = req.query as unknown as z.infer<typeof sessionsQuery>;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.listSessions({ ...query, role: req.user!.role }) });
}));

router.get('/sessions/:id', validationMiddleware({ params: idParams }), handle(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.getSessionForAdmin(req.params.id as string, req.user!.role) });
}));

router.patch('/sessions/:id', validationMiddleware({ params: idParams, body: sessionStatusBody }), handle(async (req, res) => {
  const body = req.body as z.infer<typeof sessionStatusBody>;
  await service.setSessionDismissed({ sessionId: req.params.id as string, adminId: req.user!.userId, ...body });
  res.json({ success: true });
}));

// A tester asked for their answers to be deleted. Super admins only.
router.delete('/sessions/:id', rbacMiddleware('super_admin'), validationMiddleware({ params: idParams, body: eraseBody }), handle(async (req, res) => {
  const body = req.body as z.infer<typeof eraseBody>;
  const data = await service.eraseSession({ sessionId: req.params.id as string, adminId: req.user!.userId, note: body.note });
  res.json({ success: true, data });
}));

export default router;
