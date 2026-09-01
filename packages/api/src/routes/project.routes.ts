import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { uploadRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as projectService from '../services/project.service';
import { platformConfig } from '../config/platform.config';
import {
  createProjectSchema, updateProjectSchema, addMilestoneSchema, updateMilestoneSchema,
  addSelectionSchema, updateSelectionSchema, addDocumentSchema, uploadProjectDocumentSchema,
} from '../validators/project.validators';

// D27 Phase 5 — project layer. All list, mutation, and access-link routes
// require auth; the file stream accepts only a short-lived signed bearer URL.
// The service enforces per-project ownership before minting that URL.
const router = Router();
const projectDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: platformConfig.maxImageSizeMB * 1024 * 1024, files: 1 },
});

interface ProjectDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

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

router.patch('/selections/:selectionId', authMiddleware, validationMiddleware(updateSelectionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.updateSelection(pathId(req, 'selectionId'), requester(req), req.body);
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.delete('/selections/:selectionId', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await projectService.deleteSelection(pathId(req, 'selectionId'), requester(req));
      res.json({ success: true });
    } catch (e) { next(e); }
  });

router.get('/documents/:documentId/access', authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const out = await projectService.createDocumentAccessLink(pathId(req, 'documentId'), requester(req));
      res.json({ success: true, data: out });
    } catch (e) { next(e); }
  });

router.get('/documents/:documentId/file',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const expires = Number(req.query.expires);
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const out = await projectService.getDocumentDownload(pathId(req, 'documentId'), expires, token);
      res.setHeader('Content-Type', out.stream.contentType);
      res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (out.stream.contentLength !== undefined) res.setHeader('Content-Length', String(out.stream.contentLength));
      out.stream.body.pipe(res);
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

router.post('/:id/documents/upload', authMiddleware, uploadRateLimitMiddleware,
  projectDocumentUpload.single('file'), validationMiddleware(uploadProjectDocumentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = (req as AuthenticatedRequest & { file?: ProjectDocumentFile }).file;
      if (!file) throw createAppError('Choose an image to attach.', 400);
      const out = await projectService.uploadPrivateDocument(pathId(req, 'id'), requester(req), {
        label: req.body.label,
        docType: req.body.docType,
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
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
