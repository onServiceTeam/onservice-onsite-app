import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createReviewSchema, providerResponseSchema } from '../validators/review.validators';
import * as reviewService from '../services/review.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

const router = Router();

router.post(
  '/',
  authMiddleware,
  validationMiddleware(createReviewSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const review = await reviewService.createReview(
        req.body.bookingId,
        req.user!.userId,
        req.body,
      );

      const images = await reviewService.getReviewImages(review.id);
      res.status(201).json({ success: true, data: reviewService.formatReview(review, images) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/provider/:providerId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const providerId = req.params['providerId'];
      if (typeof providerId !== 'string' || !providerId) throw createAppError('Provider ID is required.', 400);

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const { reviews, total, aggregate } = await reviewService.getReviewsByProvider(
        providerId, page, pageSize,
      );

      const reviewsWithImages = await Promise.all(
        reviews.map(async (r) => {
          const images = await reviewService.getReviewImages(r.id);
          return reviewService.formatReview(r, images);
        }),
      );

      res.json({
        success: true,
        data: reviewsWithImages,
        aggregate,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/booking/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params['bookingId'];
      if (typeof bookingId !== 'string' || !bookingId) throw createAppError('Booking ID is required.', 400);

      const review = await reviewService.getReviewByBooking(bookingId);
      if (!review) {
        res.json({ success: true, data: null });
        return;
      }

      const images = await reviewService.getReviewImages(review.id);
      res.json({ success: true, data: reviewService.formatReview(review, images) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/response',
  authMiddleware,
  validationMiddleware(providerResponseSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reviewId = req.params['id'];
      if (typeof reviewId !== 'string' || !reviewId) throw createAppError('Review ID is required.', 400);

      interface ProviderIdRow { id: string }
      const providerRow = await db.query<ProviderIdRow>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [req.user!.userId],
      );
      if (providerRow.rows.length === 0) throw createAppError('Provider profile not found.', 404);

      const review = await reviewService.addProviderResponse(
        reviewId,
        providerRow.rows[0]!.id,
        req.body.response,
      );

      res.json({ success: true, data: reviewService.formatReview(review) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
