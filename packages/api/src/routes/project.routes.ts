import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as projectService from '../services/project.service';
import {
  createProjectSchema, updateProjectSchema, addMilestoneSchema, updateMilestoneSchema,
  addSelectionSchema, addDocumentSchema,
} from '../validators/project.validators';

// D27 Phase 5 — project layer. All routes require auth; the service enforces
// per-project ownership (customer owner / assigned provider / admin).
const router = Router();

function requester(req: AuthenticatedRequest): { userId: string; role: string } {
  return { userId: req.user!.userId, role: req.user!.role };
}
function pathId(req: AuthenticatedRequest, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !v) throw createAppError(`${name} is required.`, 400);
  return v;
}

// ── Projects ──────────────────────────────────────────────────────────────
router.post('/', authMiddleware, rbacMiddleware('customer'), validationMiddleware(createProjectSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.createProject(requester(req), req.body);
      res.status(201).json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.get('/', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const out = await projectService.listProjects(requester(req), { status });
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

// ── Milestone / selection / document by their own id (declared before the
//    generic /:id project routes so the two-segment paths match first). ──────
router.patch('/milestones/:milestoneId', authMiddleware, validationMiddleware(updateMilestoneSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.updateMilestone(pathId(req, 'milestoneId'), requester(req), req.body);
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.delete('/milestones/:milestoneId', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await projectService.deleteMilestone(pathId(req, 'milestoneId'), requester(req));
      res.json({ success: true });
    } catch (e) { next(e); }
  });

router.delete('/selections/:selectionId', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await projectService.deleteSelection(pathId(req, 'selectionId'), requester(req));
      res.json({ success: true });
    } catch (e) { next(e); }
  });

router.delete('/documents/:documentId', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await projectService.deleteDocument(pathId(req, 'documentId'), requester(req));
      res.json({ success: true });
    } catch (e) { next(e); }
  });

// ── A single project + its children ─────────────────────────────────────────
router.get('/:id', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.getProjectDetail(pathId(req, 'id'), requester(req));
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.patch('/:id', authMiddleware, validationMiddleware(updateProjectSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.updateProject(pathId(req, 'id'), requester(req), req.body);
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.post('/:id/milestones', authMiddleware, validationMiddleware(addMilestoneSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.addMilestone(pathId(req, 'id'), requester(req), req.body);
      res.status(201).json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.post('/:id/selections', authMiddleware, validationMiddleware(addSelectionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.addSelection(pathId(req, 'id'), requester(req), req.body);
      res.status(201).json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.post('/:id/documents', authMiddleware, validationMiddleware(addDocumentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.addDocument(pathId(req, 'id'), requester(req), req.body);
      res.status(201).json({ success: true, data: out });
    } catch (e) { next(e); }
  });

export default router;
