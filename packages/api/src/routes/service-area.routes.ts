import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as serviceAreaService from '../services/service-area.service';
import { db } from '../models/db';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { CacheTTL } from '../services/cache.service';

const router = Router();

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

      if (!['active', 'soft_launch', 'recruiting'].includes(area.status)) {
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

router.post(
  '/waitlist',
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

      if (!fullName || !phone || !city || !province) {
        throw createAppError('fullName, phone, city, and province are required.', 400);
      }

      const phoneRegex = /^(\+?63|0)9\d{9}$/;
      if (!phoneRegex.test(phone.replace(/[\s.-]/g, ''))) {
        throw createAppError('Invalid Philippine phone number.', 400);
      }

      const entry = await serviceAreaService.joinWaitlist({
        fullName, phone, email, city, province, barangay, latitude, longitude,
      });

      res.status(201).json({
        success: true,
        data: serviceAreaService.formatWaitlistEntry(entry),
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { serviceAreaId, isPrimary } = req.body as { serviceAreaId: string; isPrimary?: boolean };

      if (!serviceAreaId) {
        throw createAppError('serviceAreaId is required.', 400);
      }

      const providerResult = await db.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [userId],
      );

      if (providerResult.rows.length === 0) {
        throw createAppError('Provider profile not found.', 404);
      }

      const providerId = providerResult.rows[0]!.id;
      const assignment = await serviceAreaService.assignProviderToArea(providerId, serviceAreaId, isPrimary);

      res.status(201).json({
        success: true,
        data: {
          id: assignment.id,
          providerId: assignment.provider_id,
          serviceAreaId: assignment.service_area_id,
          isPrimary: assignment.is_primary,
          createdAt: assignment.created_at,
        },
      });
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
