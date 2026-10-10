import { Router, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadRateLimitMiddleware } from '../middleware/rate-limit.middleware';
import * as uploadService from '../services/upload.service';
import * as bookingPhotoService from '../services/booking-photo.service';
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

// Phase 14 Dispatch 07 helper — resolve booking role for the authenticated
// user based on their session role + relationship to the booking.
function resolveActorRole(req: AuthenticatedRequest): bookingPhotoService.ActorRole {
  const role = req.user!.role;
  if (role === 'admin' || role === 'super_admin') return 'admin';
  // D15 — an assigned staff member performs the job on the provider's behalf,
  // so for booking photos/signatures they act as 'provider'. The service still
  // verifies they are the APPROVED staff assigned to THIS booking before
  // allowing the write, and records their individual user id in uploaded_by.
  if (role === 'provider' || role === 'provider_staff') return 'provider';
  return 'customer';
}

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
      // BUG-PHASE26 follow-up: throw an AppError so error.middleware
      // returns 400 (not the generic 500) for invalid MIME uploads.
      cb(createAppError(`File type "${file.mimetype}" is not allowed.`, 400), false);
    }
  },
});

router.post(
  '/',
  authMiddleware,
  uploadRateLimitMiddleware,
  upload.array('files', platformConfig.maxImagesPerBooking),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const files = (req as AuthenticatedRequest & { files?: MulterFile[] }).files;
      if (!files || files.length === 0) {
        throw createAppError('No files provided.', 400);
      }

      const context = (req.body.context as string) || 'general';
      const allowedContexts = ['job-request', 'change-order', 'dispute', 'chat', 'review', 'onboarding', 'portfolio', 'general'];
      if (!allowedContexts.includes(context)) {
        throw createAppError(`Invalid upload context "${context}".`, 400);
      }

      const results: uploadService.UploadedFile[] = [];

      // §35a — KYC/identity documents (uploaded under the 'onboarding' context)
      // are personal data and must be stored privately, never publicly readable
      // by their storage URL. Everything else (booking photos, chat, etc.) stays
      // public as before.
      const visibility = uploadService.getUploadVisibility(context);

      for (const file of files) {
        // MED-N144 — validateFile is async (reads admin-tunable allowlist).
        await uploadService.validateFile(file.originalname, file.mimetype, file.size);
        const saved = await uploadService.saveUploadedFile(
          file.buffer,
          file.originalname,
          file.mimetype,
          req.user!.userId,
          context,
          visibility,
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

// ─────────────────────────────────────────────────────────────────
// Phase 14 Dispatch 07 — booking photo + signature uploads (Bug 36, 37,
// 461, 1224). Mobile compresses + resizes via expo-image-manipulator
// before posting; server validates MIME/size, uploads via the existing
// upload.service.ts (S3 + KMS or local-FS dual mode), and inserts a
// booking_photos / booking_signatures row that links the booking to the
// stored URL. Storage URL is NEVER a `file://` URI (which was the root
// cause of Bugs 36, 461, 73, 943, 944, 1224).
// ─────────────────────────────────────────────────────────────────

router.post(
  '/booking-photo',
  authMiddleware,
  uploadRateLimitMiddleware,
  upload.single('photo'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = (req as AuthenticatedRequest & { file?: MulterFile }).file;
      if (!file) throw createAppError('No photo provided.', 400);

      const bookingId = typeof req.body?.bookingId === 'string' ? req.body.bookingId : '';
      const photoType = req.body?.photoType;
      if (!bookingId) throw createAppError('bookingId is required.', 400);
      if (!bookingPhotoService.isPhotoType(photoType)) {
        throw createAppError(
          'Invalid photoType. Must be one of: before, during, after, issue, checklist, identity, portfolio.',
          400,
        );
      }

      const result = await bookingPhotoService.uploadBookingPhoto({
        bookingId,
        uploadedByUserId: req.user!.userId,
        uploadedByRole: resolveActorRole(req),
        photoType,
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/booking-photo/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params.bookingId as string | undefined;
      if (typeof bookingId !== 'string' || !bookingId) {
        throw createAppError('bookingId is required.', 400);
      }

      const role = resolveActorRole(req);
      // Non-admins must be a party to the booking — the service does the check.
      // (Admins skip the booking-role check.)
      if (role !== 'admin') {
        // Lazy auth check via service — if user is not a party, the service
        // throws on the first photoType filter; mirror that by performing a
        // no-op upload-check via resolveBookingRole equivalent. Simpler:
        // call uploadBookingPhoto's auth path via a tiny SELECT here.
        const { db } = await import('../models/db');
        const access = await db.query(
          // Mirror bookingService.getBookingById's access check: the approved
          // staff performer (provider_staff) can read photos for their own job,
          // and (SEC-095) only while they are staff of its current provider.
          `SELECT 1 FROM bookings b
           LEFT JOIN providers p ON p.id = b.provider_id
           LEFT JOIN provider_staff ps ON ps.id = b.performer_staff_id
                                      AND ps.provider_id = b.provider_id
           WHERE b.id = $1 AND (
             b.customer_id = $2
             OR p.user_id = $2
             OR (ps.user_id = $2 AND ps.status = 'approved')
           )`,
          [bookingId, req.user!.userId],
        );
        if (access.rows.length === 0) {
          throw createAppError('You do not have access to this booking.', 403);
        }
      }

      const photoTypeRaw = typeof req.query.photoType === 'string' ? req.query.photoType : undefined;
      const photoType = bookingPhotoService.isPhotoType(photoTypeRaw)
        ? photoTypeRaw
        : undefined;

      const photos = await bookingPhotoService.listBookingPhotos(bookingId, photoType ? { photoType } : undefined);
      res.json({ success: true, data: photos });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/booking-signature',
  authMiddleware,
  uploadRateLimitMiddleware,
  upload.single('signature'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = (req as AuthenticatedRequest & { file?: MulterFile }).file;
      if (!file) throw createAppError('No signature provided.', 400);

      const signatureType = req.body?.signatureType;
      if (!bookingPhotoService.isSignatureType(signatureType)) {
        throw createAppError(
          'Invalid signatureType. Must be one of: ic_agreement, customer_acceptance, work_authorization, change_order_accept.',
          400,
        );
      }

      const bookingIdRaw = typeof req.body?.bookingId === 'string' && req.body.bookingId.length > 0
        ? req.body.bookingId
        : null;
      const fullNameTyped = typeof req.body?.fullNameTyped === 'string' ? req.body.fullNameTyped : undefined;

      const result = await bookingPhotoService.uploadSignature({
        bookingId: bookingIdRaw,
        signedByUserId: req.user!.userId,
        signedRole: resolveActorRole(req),
        signatureType,
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        fullNameTyped,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
