import { Router, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import * as uploadService from '../services/upload.service';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const router = Router();

const ALLOWED_MIME_SET = new Set<string>(platformConfig.allowedImageTypes);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: platformConfig.maxImageSizeMB * 1024 * 1024,
    files: platformConfig.maxImagesPerBooking,
  },
  fileFilter: (_req: unknown, file: MulterFile, cb: (error: Error | null, accept: boolean) => void) => {
    if (ALLOWED_MIME_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed.`), false);
    }
  },
});

router.post(
  '/',
  authMiddleware,
  upload.array('files', platformConfig.maxImagesPerBooking),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const files = (req as AuthenticatedRequest & { files?: MulterFile[] }).files;
      if (!files || files.length === 0) {
        throw createAppError('No files provided.', 400);
      }

      const context = (req.body.context as string) || 'general';
      const allowedContexts = ['job-request', 'change-order', 'dispute', 'chat', 'review', 'onboarding', 'general'];
      if (!allowedContexts.includes(context)) {
        throw createAppError(`Invalid upload context "${context}".`, 400);
      }

      const results: uploadService.UploadedFile[] = [];

      for (const file of files) {
        uploadService.validateFile(file.originalname, file.mimetype, file.size);
        const saved = await uploadService.saveUploadedFile(
          file.buffer,
          file.originalname,
          file.mimetype,
          req.user!.userId,
          context,
        );
        results.push(saved);
      }

      res.status(201).json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
