import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { updateProfileSchema, addServiceSchema, setScheduleSchema } from '../validators/provider.validators';
import * as providerService from '../services/provider.service';
import * as reviewService from '../services/review.service';
import * as providerToolsService from '../services/provider-tools.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();

function requireProvider(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'provider' && req.user!.role !== 'admin') {
    throw createAppError('Only providers can access this resource.', 403);
  }
}

router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const services = await providerService.getProviderServices(provider.id);
      const schedule = await providerService.getSchedule(provider.id);
      const ratings = await reviewService.getProviderAggregateRating(provider.id);

      res.json({
        success: true,
        data: {
          ...providerService.formatProvider(provider),
          services: services.map(providerService.formatProviderService),
          schedule: schedule.map(providerService.formatScheduleSlot),
          ratings,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const providerId = req.params['id'];
      if (typeof providerId !== 'string' || !providerId) throw createAppError('Provider ID is required.', 400);

      const provider = await providerService.getProviderById(providerId);
      const services = await providerService.getProviderServices(provider.id);
      const schedule = await providerService.getSchedule(provider.id);
      const ratings = await reviewService.getProviderAggregateRating(provider.id);
      const providerName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null;

      res.json({
        success: true,
        data: {
          ...providerService.formatProvider(provider),
          name: providerName,
          services: services.map(providerService.formatProviderService),
          schedule: schedule.map(providerService.formatScheduleSlot),
          ratings,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/me',
  authMiddleware,
  validationMiddleware(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const updated = await providerService.updateProfile(provider.id, req.body);
      res.json({ success: true, data: providerService.formatProvider(updated) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/me/availability',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const { isAvailable } = req.body;
      if (typeof isAvailable !== 'boolean') {
        throw createAppError('isAvailable must be a boolean.', 400);
      }
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const updated = await providerService.setAvailability(provider.id, isAvailable);
      res.json({ success: true, data: providerService.formatProvider(updated) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/me/services',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const services = await providerService.getProviderServices(provider.id);
      res.json({ success: true, data: services.map(providerService.formatProviderService) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/me/services',
  authMiddleware,
  validationMiddleware(addServiceSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const service = await providerService.addProviderService(
        provider.id, req.body.subcategoryId, req.body.basePrice,
      );
      res.status(201).json({ success: true, data: providerService.formatProviderService(service) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/me/services/:subcategoryId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const subcategoryId = req.params['subcategoryId'];
      if (typeof subcategoryId !== 'string' || !subcategoryId) throw createAppError('Subcategory ID is required.', 400);
      await providerService.removeProviderService(provider.id, subcategoryId);
      res.json({ success: true, data: { message: 'Service removed.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/me/schedule',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const schedule = await providerService.getSchedule(provider.id);
      res.json({ success: true, data: schedule.map(providerService.formatScheduleSlot) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/me/schedule',
  authMiddleware,
  validationMiddleware(setScheduleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const schedule = await providerService.setSchedule(provider.id, req.body.schedule);
      res.json({ success: true, data: schedule.map(providerService.formatScheduleSlot) });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Earnings Summary ---

router.get(
  '/me/earnings/summary',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const summary = await providerToolsService.getEarningsSummary(provider.id);
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Earnings Trends ---

router.get(
  '/me/earnings/trends',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const period = (typeof req.query.period === 'string' ? req.query.period : 'daily') as 'daily' | 'weekly' | 'monthly';
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        throw createAppError('period must be daily, weekly, or monthly.', 400);
      }

      const trends = await providerToolsService.getEarningsTrends(provider.id, period, days);
      res.json({ success: true, data: trends });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Earnings by Category ---

router.get(
  '/me/earnings/categories',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
      const categories = await providerToolsService.getEarningsByCategory(provider.id, days);
      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Earnings Goals ---

router.get(
  '/me/goals',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const goals = await providerToolsService.getEarningsGoals(provider.id);
      const progress = await providerToolsService.getGoalProgress(provider.id);
      res.json({ success: true, data: { goals: goals.map(providerToolsService.formatEarningsGoal), progress } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/me/goals',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { periodType, targetAmount } = req.body as { periodType: string; targetAmount: number };

      if (!periodType || !['daily', 'weekly', 'monthly'].includes(periodType)) {
        throw createAppError('periodType must be daily, weekly, or monthly.', 400);
      }
      if (!targetAmount || typeof targetAmount !== 'number' || targetAmount <= 0) {
        throw createAppError('targetAmount must be a positive number.', 400);
      }

      const goal = await providerToolsService.setEarningsGoal(
        provider.id,
        periodType as 'daily' | 'weekly' | 'monthly',
        targetAmount,
      );
      res.status(201).json({ success: true, data: providerToolsService.formatEarningsGoal(goal) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/me/goals/:periodType',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const periodType = req.params['periodType'] as string;

      if (!periodType || !['daily', 'weekly', 'monthly'].includes(periodType)) {
        throw createAppError('periodType must be daily, weekly, or monthly.', 400);
      }

      await providerToolsService.removeEarningsGoal(provider.id, periodType as 'daily' | 'weekly' | 'monthly');
      res.json({ success: true, message: 'Earnings goal removed.' });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Demand Insights ---

router.get(
  '/me/demand-insights',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
      const insights = await providerToolsService.getDemandInsights(provider.id, days);
      res.json({ success: true, data: insights });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Receipt Generator ---

router.get(
  '/me/receipts/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const bookingId = req.params['bookingId'];
      if (!bookingId || typeof bookingId !== 'string') {
        throw createAppError('bookingId is required.', 400);
      }
      const receipt = await providerToolsService.generateReceipt(provider.id, bookingId);
      res.json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Materials List Generator ---

router.get(
  '/me/materials-list/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const bookingId = req.params['bookingId'];
      if (!bookingId || typeof bookingId !== 'string') {
        throw createAppError('bookingId is required.', 400);
      }
      const materialsList = await providerToolsService.getMaterialsList(provider.id, bookingId);
      res.json({ success: true, data: materialsList });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Tools: Monthly Summary (BIR) ---

router.get(
  '/me/monthly-summary',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const now = new Date();
      const year = Math.max(2024, Math.min(now.getFullYear(), Number(req.query.year) || now.getFullYear()));
      const month = Math.max(1, Math.min(12, Number(req.query.month) || now.getMonth() + 1));

      const summary = await providerToolsService.getMonthlySummary(provider.id, year, month);
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
