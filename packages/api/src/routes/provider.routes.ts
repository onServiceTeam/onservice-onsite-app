import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { providerApplicationSchema, updateProfileSchema, addServiceSchema, setScheduleSchema, availabilityOverrideSchema } from '../validators/provider.validators';
import * as providerService from '../services/provider.service';
import * as reviewService from '../services/review.service';
import * as providerToolsService from '../services/provider-tools.service';
import * as providerStaffService from '../services/provider-staff.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();

function requireProvider(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'provider' && req.user!.role !== 'admin') {
    throw createAppError('Only providers can access this resource.', 403);
  }
}

router.post(
  '/apply',
  authMiddleware,
  validationMiddleware(providerApplicationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const provider = await providerService.createProviderApplication(req.user!.userId, {
        businessName: req.body.businessName,
        categoryIds: req.body.categoryIds,
        serviceRadiusKm: req.body.serviceRadiusKm,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        city: req.body.city,
        province: req.body.province,
        governmentIdFrontUrl: req.body.governmentIdFrontUrl,
        governmentIdBackUrl: req.body.governmentIdBackUrl,
        nbiClearanceUrl: req.body.nbiClearanceUrl,
        selfieUrl: req.body.selfieUrl,
        // Phase K MED-K07: optional fields, dropped when undefined.
        nbiExpiryDate: req.body.nbiExpiryDate,
        governmentIdNumber: req.body.governmentIdNumber,
      });
      res.status(201).json({
        success: true,
        data: providerService.formatProvider(provider),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/application-status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await providerService.getApplicationStatus(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const [services, schedule, ratings, portfolio, certifications] = await Promise.all([
        providerService.getProviderServices(provider.id),
        providerService.getSchedule(provider.id),
        reviewService.getProviderAggregateRating(provider.id),
        providerService.getPortfolio(provider.id),
        providerService.getCertifications(provider.id),
      ]);

      res.json({
        success: true,
        data: {
          ...providerService.formatProvider(provider),
          services: services.map(providerService.formatProviderService),
          schedule: schedule.map(providerService.formatScheduleSlot),
          ratings,
          portfolio: portfolio.map(providerService.formatPortfolioItem),
          certifications: certifications.map(providerService.formatCertification),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  // MED-N96 fix: pre-fix this endpoint was UNAUTHENTICATED and returned
  // the provider's full profile including precise lat/long, city,
  // province, and full first+last name. Combined with portfolio photo
  // EXIF (preserved by Bug 1325 D01 SSE-KMS pipeline) this enabled
  // reverse-geocoding to specific addresses by anonymous internet
  // browsers.
  //
  // Now: requires authentication. Customers/providers/admins can all
  // view (no role restriction) — the matching engine and search
  // surfaces are already auth-gated, so any legitimate "browse a
  // provider's profile" flow already has a logged-in actor. SEO/
  // landing-page browsing of providers would need a separate explicit
  // public endpoint with reduced fields (deferred to v1.1+).
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const providerId = req.params['id'];
      if (typeof providerId !== 'string' || !providerId) throw createAppError('Provider ID is required.', 400);

      const provider = await providerService.getProviderById(providerId);
      const [services, schedule, ratings, portfolio, certifications, sukiCount] = await Promise.all([
        providerService.getProviderServices(provider.id),
        providerService.getSchedule(provider.id),
        reviewService.getProviderAggregateRating(provider.id),
        providerService.getPortfolio(provider.id),
        providerService.getCertifications(provider.id),
        providerService.getSukiCount(provider.id),
      ]);
      const providerName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null;

      res.json({
        success: true,
        data: {
          ...providerService.formatProvider(provider),
          name: providerName,
          services: services.map(providerService.formatProviderService),
          schedule: schedule.map(providerService.formatScheduleSlot),
          ratings,
          portfolio: portfolio.map(providerService.formatPortfolioItem),
          certifications: certifications.map(providerService.formatCertification),
          sukiCount,
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

// Phase E CRIT-118 fix — NBI status endpoint for the mobile
// NbiStatusBanner global component. Pre-fix the component hit
// /api/v1/provider/nbi-status which did not exist; every fetch
// returned 404 and the banner silently never rendered. Post-fix
// route exists at /api/v1/providers/me/nbi-status (canonical
// `providers` namespace, /me self-scoped).
router.get(
  '/me/nbi-status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const status = await providerService.getProviderNbiStatus(provider.id);
      res.json({ success: true, data: status });
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

// --- Portfolio Management ---

router.get(
  '/me/portfolio',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const items = await providerService.getPortfolio(provider.id);
      res.json({ success: true, data: items.map(providerService.formatPortfolioItem) });
    } catch (error) {
      next(error);
    }
  },
);

// BUG-PHASE152-01 fix — portfolio caption + categoryId had no
// server-side length cap. A misbehaving provider could submit a
// 100,000-char caption that the table accepts and the public
// portfolio view then displays to every customer browsing the
// provider's profile. Same defense-in-depth gap as MED-N97
// (file:// URIs) — needs an explicit reject. 500-char cap matches
// the cap pattern used elsewhere (cancellation reason, address
// notes). categoryId capped at 64 (UUID is 36; allow some slack).
const PORTFOLIO_CAPTION_MAX = 500;
const PORTFOLIO_CATEGORY_ID_MAX = 64;

router.post(
  '/me/portfolio',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { imageUrl, caption, categoryId, displayOrder } = req.body as {
        imageUrl: string; caption?: string; categoryId?: string; displayOrder?: number;
      };
      if (!imageUrl || typeof imageUrl !== 'string') throw createAppError('imageUrl is required.', 400);
      // MED-N97 fix: same Bug 36/461/1224 family as booking photo
      // validation. Reject `file://` URIs and other non-HTTP schemes
      // — the URL must come from the /api/v1/uploads multipart step
      // so it's a real S3 / local-uploads URL viewable by anyone
      // browsing the provider's portfolio.
      if (!/^https?:\/\//i.test(imageUrl)) {
        throw createAppError(
          'Invalid imageUrl. Portfolio images must be uploaded via /api/v1/uploads first; raw file:// URIs are not accepted.',
          400,
        );
      }
      // BUG-PHASE152-01 fix — cap caption + categoryId.
      if (caption !== undefined && (typeof caption !== 'string' || caption.length > PORTFOLIO_CAPTION_MAX)) {
        throw createAppError(`caption must be a string ≤ ${PORTFOLIO_CAPTION_MAX} characters.`, 400);
      }
      if (categoryId !== undefined && (typeof categoryId !== 'string' || categoryId.length > PORTFOLIO_CATEGORY_ID_MAX)) {
        throw createAppError(`categoryId must be a string ≤ ${PORTFOLIO_CATEGORY_ID_MAX} characters.`, 400);
      }
      // MED-N97 fix: cap portfolio at 50 items per provider so a
      // misbehaving client can't fill the table with junk.
      const existing = await providerService.getPortfolio(provider.id);
      if (existing.length >= 50) {
        throw createAppError('Portfolio is at its 50-item limit. Delete an item before adding another.', 400);
      }
      const item = await providerService.addPortfolioItem(provider.id, { imageUrl, caption, categoryId, displayOrder });
      res.status(201).json({ success: true, data: providerService.formatPortfolioItem(item) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/me/portfolio/:itemId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const itemId = req.params['itemId'] as string;
      const { caption, displayOrder } = req.body as { caption?: string; displayOrder?: number };
      // BUG-PHASE152-01 fix — same caption cap on the patch path.
      if (caption !== undefined && (typeof caption !== 'string' || caption.length > PORTFOLIO_CAPTION_MAX)) {
        throw createAppError(`caption must be a string ≤ ${PORTFOLIO_CAPTION_MAX} characters.`, 400);
      }
      const item = await providerService.updatePortfolioItem(provider.id, itemId, { caption, displayOrder });
      res.json({ success: true, data: providerService.formatPortfolioItem(item) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/me/portfolio/:itemId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const itemId = req.params['itemId'] as string;
      await providerService.removePortfolioItem(provider.id, itemId);
      res.json({ success: true, data: { message: 'Portfolio item removed.' } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Certification Management ---

router.get(
  '/me/certifications',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const certs = await providerService.getCertifications(provider.id);
      res.json({ success: true, data: certs.map(providerService.formatCertification) });
    } catch (error) {
      next(error);
    }
  },
);

// BUG-PHASE152-01 fix — certification fields had no server cap.
// Customer-facing portfolio surfaces these strings; an unbounded
// `name` or `issuingBody` is a sneak-injection vector and a UX hazard.
// Caps mirror typical Phil. cert label lengths with slack.
const CERT_NAME_MAX = 200;
const CERT_ISSUING_BODY_MAX = 200;
const CERT_NUMBER_MAX = 100;

function validateCertText(value: string | undefined, field: string, max: number): void {
  if (value === undefined) return;
  if (typeof value !== 'string') throw createAppError(`${field} must be a string.`, 400);
  if (value.length > max) {
    throw createAppError(`${field} must be ≤ ${max} characters.`, 400);
  }
}

router.post(
  '/me/certifications',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { name, issuingBody, certificateNumber, certificateUrl, issuedDate, expiryDate } = req.body as {
        name: string; issuingBody?: string; certificateNumber?: string;
        certificateUrl?: string; issuedDate?: string; expiryDate?: string;
      };
      if (!name || typeof name !== 'string') throw createAppError('Certification name is required.', 400);
      // BUG-PHASE152-01 fix — server-side length validation.
      validateCertText(name, 'name', CERT_NAME_MAX);
      validateCertText(issuingBody, 'issuingBody', CERT_ISSUING_BODY_MAX);
      validateCertText(certificateNumber, 'certificateNumber', CERT_NUMBER_MAX);
      const cert = await providerService.addCertification(provider.id, {
        name, issuingBody, certificateNumber, certificateUrl, issuedDate, expiryDate,
      });
      res.status(201).json({ success: true, data: providerService.formatCertification(cert) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/me/certifications/:certId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const certId = req.params['certId'] as string;
      const { name, issuingBody, certificateNumber, certificateUrl, issuedDate, expiryDate } = req.body as {
        name?: string; issuingBody?: string; certificateNumber?: string;
        certificateUrl?: string; issuedDate?: string; expiryDate?: string;
      };
      // BUG-PHASE152-01 fix — server-side length validation on PATCH too.
      validateCertText(name, 'name', CERT_NAME_MAX);
      validateCertText(issuingBody, 'issuingBody', CERT_ISSUING_BODY_MAX);
      validateCertText(certificateNumber, 'certificateNumber', CERT_NUMBER_MAX);
      const cert = await providerService.updateCertification(provider.id, certId, {
        name, issuingBody, certificateNumber, certificateUrl, issuedDate, expiryDate,
      });
      res.json({ success: true, data: providerService.formatCertification(cert) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/me/certifications/:certId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const certId = req.params['certId'] as string;
      await providerService.removeCertification(provider.id, certId);
      res.json({ success: true, data: { message: 'Certification removed.' } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Availability Overrides (US-P008) ---

router.get(
  '/me/availability/overrides',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { from, to } = req.query as { from?: string; to?: string };
      const overrides = await providerService.getAvailabilityOverrides(provider.id, from, to);
      res.json({ success: true, data: overrides.map(providerService.formatOverride) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/me/availability/overrides',
  authMiddleware,
  // MED-N99 fix — replace the manual presence-checks with the
  // availabilityOverrideSchema which validates date format, time
  // format, end > start, reason length cap, and rejects past dates.
  validationMiddleware(availabilityOverrideSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { overrideDate, isAvailable, startTime, endTime, reason } = req.body as {
        overrideDate: string; isAvailable: boolean; startTime?: string; endTime?: string; reason?: string;
      };
      const override = await providerService.addAvailabilityOverride(provider.id, {
        overrideDate, isAvailable, startTime, endTime, reason,
      });
      res.status(201).json({ success: true, data: providerService.formatOverride(override) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/me/availability/overrides/:overrideId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const overrideId = req.params['overrideId'] as string;
      await providerService.removeAvailabilityOverride(provider.id, overrideId);
      res.json({ success: true, data: { message: 'Override removed.' } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Instant Availability Toggle ---

router.put(
  '/me/availability/toggle',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { isAvailable } = req.body as { isAvailable: boolean };
      if (typeof isAvailable !== 'boolean') throw createAppError('isAvailable is required.', 400);
      // MED-N100 fix — use the server-computed value the service
      // returns, not the input.
      const updated = await providerService.toggleInstantAvailability(provider.id, isAvailable);
      res.json({ success: true, data: { isAvailable: updated.isAvailable } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/me/availability/status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const isAvailable = await providerService.getInstantAvailability(provider.id);
      res.json({ success: true, data: { isAvailable } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Tier Progression (US-P016) ---

router.get(
  '/me/tier-progression',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const progression = await providerService.getTierProgression(provider.id);
      res.json({ success: true, data: progression });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Calendar / Upcoming Jobs (US-P007) ---

router.get(
  '/me/calendar',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const { from, to } = req.query as { from?: string; to?: string };
      if (!from || !to) throw createAppError('from and to query params are required.', 400);

      const [jobs, overrides] = await Promise.all([
        providerService.getUpcomingJobs(provider.id, from, to),
        providerService.getAvailabilityOverrides(provider.id, from, to),
      ]);

      res.json({
        success: true,
        data: {
          jobs: jobs.map(providerService.formatUpcomingJob),
          overrides: overrides.map(providerService.formatOverride),
        },
      });
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
      // BUG-PHASE121-01 fix — pre-fix the default + upper bound used
      // device-local now.getFullYear() / now.getMonth(). Server runs
      // UTC, so a provider opening "this month" at 01:00 Manila June
      // 1 (= 17:00 UTC May 31) defaulted to safeMonth=5 (May UTC)
      // instead of 6 (June Manila). Same Manila-tz pattern as Phases
      // 105/113/115/116/117/118/119/120. Anchor to Manila year/month
      // so the default matches the calendar month the provider is
      // currently looking at on their wall clock.
      const now = new Date();
      const manilaYM = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      // manilaYM is "YYYY-MM-DD"; pull year + month components.
      const manilaYear = Number(manilaYM.slice(0, 4));
      const manilaMonth = Number(manilaYM.slice(5, 7));
      // MED-N98 fix — pre-fix the year clamp `Math.min(now.getFullYear(), …)`
      // forced any year query (including the legitimately current year)
      // to be at most the current calendar year. Once we cross into
      // 2027 (or beyond), querying the previous year still works, but
      // reading historical 2026 data from a Jan-2027 admin session
      // worked fine — the bug bites the OPPOSITE way: a provider can
      // never query a future year for forecasts. Post-fix the clamp
      // is just a sanity floor (no pre-platform years) and an upper
      // bound of "current year + 1" so tooling can still preview the
      // next BIR year. Bad input still safely defaults to current year.
      const requestedYear = Number(req.query.year);
      const safeYear = Number.isFinite(requestedYear) && requestedYear >= 2024 && requestedYear <= manilaYear + 1
        ? Math.floor(requestedYear)
        : manilaYear;
      const requestedMonth = Number(req.query.month);
      const safeMonth = Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
        ? Math.floor(requestedMonth)
        : manilaMonth;

      const summary = await providerToolsService.getMonthlySummary(provider.id, safeYear, safeMonth);
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Team / staff (D23) ───────────────────────────────────────────────────────
// The provider owner manages their own team. Members go to back-office review
// (admin Staff tab) before they can be assigned jobs.

router.get(
  '/staff',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const data = await providerStaffService.listStaffWithPerformance(provider.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/staff',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : undefined;
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
      const roleTitle = typeof req.body?.roleTitle === 'string' ? req.body.roleTitle.trim() : undefined;
      if (!phone && !email) {
        throw createAppError('Enter a phone number or email to invite a team member.', 400);
      }
      const staff = await providerStaffService.createStaffInvite({
        providerId: provider.id,
        invitedByUserId: req.user!.userId,
        roleTitle: roleTitle || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
      res.status(201).json({ success: true, data: providerStaffService.formatProviderStaff(staff) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/staff/:staffId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const staff = await providerStaffService.getStaffById(req.params.staffId as string);
      // Only the owning provider may remove their own member.
      if (!staff || staff.provider_id !== provider.id) {
        throw createAppError('Team member not found.', 404);
      }
      const updated = await providerStaffService.deactivateStaff(req.params.staffId as string);
      res.json({ success: true, data: providerStaffService.formatProviderStaff(updated) });
    } catch (error) {
      next(error);
    }
  },
);

// Send a team member to onService back-office for approval.
router.post(
  '/staff/:staffId/submit',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const staff = await providerStaffService.getStaffById(req.params.staffId as string);
      if (!staff || staff.provider_id !== provider.id) {
        throw createAppError('Team member not found.', 404);
      }
      const updated = await providerStaffService.submitStaffForReview(req.params.staffId as string);
      res.json({ success: true, data: providerStaffService.formatProviderStaff(updated) });
    } catch (error) {
      next(error);
    }
  },
);

// Assign (or clear, with staffId: null) the approved team member who performs a
// booking. The performer's reviews then roll up to this provider's quality and
// into the member's per-member breakdown.
router.post(
  '/bookings/:bookingId/assign-staff',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireProvider(req);
      const provider = await providerService.getProviderByUserId(req.user!.userId);
      const rawStaffId = req.body?.staffId;
      const staffId = rawStaffId === null || rawStaffId === undefined || rawStaffId === ''
        ? null
        : String(rawStaffId);
      const assigned = await providerStaffService.assignStaffToBooking({
        bookingId: req.params.bookingId as string,
        providerId: provider.id,
        staffId,
      });
      res.json({
        success: true,
        data: assigned ? providerStaffService.formatProviderStaff(assigned) : null,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
