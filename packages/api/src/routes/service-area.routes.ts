import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as serviceAreaService from '../services/service-area.service';
import { db } from '../models/db';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { CacheTTL } from '../services/cache.service';

const router = Router();

// MED-N163 fix — POST /service-areas/waitlist is unauthenticated and
// has no CAPTCHA. A scraper / spam bot could flood the
// service_area_waitlist table with junk entries (which then bias the
// "expand here next" growth signal and pollute marketing exports).
//
// Per-IP rate limit at 5/min strikes a balance: legitimate users
// rarely re-submit; scripted floods hit the wall fast. Defense-in-
// depth: the service still validates phone format + city/province
// presence; this is the network-edge layer.
const waitlistRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many waitlist submissions from this IP. Please try again in a minute.',
      statusCode: 429,
    },
  },
});

router.get(
  '/',
  cacheMiddleware(CacheTTL.SERVICE_AREAS),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const areas = await serviceAreaService.getActiveServiceAreas();

      res.json({
        success: true,
        data: areas.map(serviceAreaService.formatServiceArea),
      });
    } catch (err) {
      next(err);
    }
  },
);

// Provider applications need the admin-configured recruiting markets as well
// as customer-bookable areas. Keep this separate from GET / so recruiting
// markets never appear as customer coverage.
router.get(
  '/provider-markets',
  cacheMiddleware(CacheTTL.SERVICE_AREAS),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const areas = await serviceAreaService.getProviderApplicationAreas();
      res.json({
        success: true,
        data: areas.map(serviceAreaService.formatServiceArea),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/check',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw createAppError('lat and lng query parameters are required.', 400);
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw createAppError('Invalid coordinates.', 400);
      }

      const result = await serviceAreaService.checkCoverage(lat, lng);

      res.json({
        success: true,
        data: {
          covered: result.covered,
          area: result.area ? serviceAreaService.formatServiceArea(result.area) : null,
          nearestArea: result.nearestArea
            ? {
                ...serviceAreaService.formatServiceArea(result.nearestArea),
                distanceKm: result.distanceKm,
              }
            : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:slug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      if (!slug || typeof slug !== 'string') {
        throw createAppError('slug is required.', 400);
      }

      const area = await serviceAreaService.getServiceAreaBySlug(slug);

      if (!['active', 'soft_launch'].includes(area.status)) {
        throw createAppError('Service area not found.', 404);
      }

      res.json({
        success: true,
        data: serviceAreaService.formatServiceArea(area),
      });
    } catch (err) {
      next(err);
    }
  },
);

// BUG-PHASE155-01 fix — service-area waitlist is PUBLIC (no auth)
// and was missing length validation on every field. The route is
// already rate-limited (waitlistRateLimit), but a determined attacker
// could still submit a 100,000-char fullName once per the rate-limit
// window. The columns are VARCHAR-typed (full_name 200, phone 20,
// email 255, city/province/barangay 100) so Postgres would reject
// the INSERT with a raw constraint error → cryptic 500. Add explicit
// caps so the user gets a friendly 400 and the server doesn't waste
// cycles on the SQL.
//
// Same defense-in-depth pattern as Phase 152/153/154.
const WAITLIST_FULL_NAME_MAX = 200;
const WAITLIST_PHONE_MAX = 20;
const WAITLIST_EMAIL_MAX = 255;
const WAITLIST_CITY_MAX = 100;
const WAITLIST_PROVINCE_MAX = 100;
const WAITLIST_BARANGAY_MAX = 100;

function validateWaitlistField(value: unknown, field: string, max: number, optional = false): void {
  if (value === undefined || value === null || value === '') {
    if (!optional) throw createAppError(`${field} is required.`, 400);
    return;
  }
  if (typeof value !== 'string') throw createAppError(`${field} must be a string.`, 400);
  if (value.length > max) {
    throw createAppError(`${field} must be ≤ ${max} characters.`, 400);
  }
}

router.post(
  '/waitlist',
  waitlistRateLimit, // MED-N163
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fullName, phone, email, city, province, barangay, latitude, longitude } = req.body as {
        fullName: string;
        phone: string;
        email?: string;
        city: string;
        province: string;
        barangay?: string;
        latitude?: number;
        longitude?: number;
      };

      // BUG-PHASE155-01 fix — explicit length validation matching
      // the column types from migration 022_service_areas.sql.
      validateWaitlistField(fullName, 'fullName', WAITLIST_FULL_NAME_MAX);
      validateWaitlistField(phone, 'phone', WAITLIST_PHONE_MAX);
      validateWaitlistField(city, 'city', WAITLIST_CITY_MAX);
      validateWaitlistField(province, 'province', WAITLIST_PROVINCE_MAX);
      validateWaitlistField(email, 'email', WAITLIST_EMAIL_MAX, true);
      validateWaitlistField(barangay, 'barangay', WAITLIST_BARANGAY_MAX, true);

      const phoneRegex = /^(\+?63|0)9\d{9}$/;
      if (!phoneRegex.test(phone.replace(/[\s.-]/g, ''))) {
        throw createAppError('Invalid Philippine phone number.', 400);
      }

      const entry = await serviceAreaService.joinWaitlist({
        fullName, phone, email, city, province, barangay, latitude, longitude,
      });

      res.status(201).json({
        success: true,
        // The caller just submitted this record, so echoing their own values is
        // not an administrative PII reveal.
        data: serviceAreaService.formatWaitlistEntry(entry, true),
        message: "We're not available in your area yet. We'll notify you when we expand!",
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/providers',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const areaId = req.params.id;
      if (!areaId || typeof areaId !== 'string') {
        throw createAppError('id is required.', 400);
      }

      const providers = await serviceAreaService.getAreaProviders(areaId);

      res.json({
        success: true,
        data: providers.map((p) => ({
          providerId: p.provider_id,
          businessName: p.business_name,
          tier: p.tier,
          averageRating: Number(p.rating),
          isPrimary: p.is_primary,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/provider/areas',
  authMiddleware,
  async (_req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Bug UX-263 — this legacy endpoint let an approved provider assign
      // themselves to any market instantly, bypassing the review queue. Keep a
      // clear conflict response for older clients instead of silently changing
      // matching coverage. New clients use /providers/me/service-area/change.
      throw createAppError(
        'Service-area changes require admin review. Submit the change from your Service Area screen.',
        409,
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/provider/my-areas',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const providerResult = await db.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [userId],
      );

      if (providerResult.rows.length === 0) {
        throw createAppError('Provider profile not found.', 404);
      }

      const areas = await serviceAreaService.getProviderAreas(providerResult.rows[0]!.id);

      res.json({
        success: true,
        data: areas.map((a) => ({
          id: a.id,
          providerId: a.provider_id,
          serviceAreaId: a.service_area_id,
          isPrimary: a.is_primary,
          areaName: a.area_name,
          areaCity: a.area_city,
          areaStatus: a.area_status,
          createdAt: a.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
